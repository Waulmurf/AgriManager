//! Liefert Dateien aus einem festen Verzeichnis mit HTTP-Range-Unterstützung aus.
//!
//! Wird vom Tauri-Protokoll `mapdata://` genutzt, damit PMTiles im WebView per
//! Byte-Range gelesen werden kann, ohne Tile-Server. Ohne Tauri-Abhängigkeit,
//! damit die Logik auf jedem System getestet werden kann.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// Antwort, unabhängig vom HTTP-Framework.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl Reply {
    fn error(status: u16, msg: &str) -> Self {
        Reply {
            status,
            headers: cors(vec![("Content-Type", "text/plain; charset=utf-8".into())]),
            body: msg.as_bytes().to_vec(),
        }
    }

    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

fn cors(mut h: Vec<(&'static str, String)>) -> Vec<(&'static str, String)> {
    h.push(("Access-Control-Allow-Origin", "*".into()));
    h.push(("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS".into()));
    h.push(("Access-Control-Allow-Headers", "Range, If-Match, If-None-Match".into()));
    h.push((
        "Access-Control-Expose-Headers",
        "Content-Range, Content-Length, Accept-Ranges, ETag".into(),
    ));
    h
}

/// Ein aufgelöster Byte-Bereich, beide Grenzen inklusive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64,
}

/// Wertet einen `Range`-Header für eine Datei der Länge `len` aus.
///
/// * `Ok(None)`: kein oder ein nicht unterstützter Header → ganze Datei
/// * `Ok(Some(r))`: gültiger Einzelbereich
/// * `Err(())`: Bereich nicht erfüllbar (416)
///
/// Mehrfachbereiche (`bytes=0-1,5-6`) werden wie fehlender Header behandelt,
/// das ist nach RFC 9110 zulässig.
pub fn parse_range(header: Option<&str>, len: u64) -> Result<Option<ByteRange>, ()> {
    let Some(h) = header else { return Ok(None) };
    let h = h.trim();
    let Some(spec) = h.strip_prefix("bytes=") else { return Ok(None) };
    if spec.contains(',') {
        return Ok(None);
    }
    let (a, b) = spec.split_once('-').ok_or(())?;
    let (a, b) = (a.trim(), b.trim());
    let range = if a.is_empty() {
        // Suffix: die letzten n Bytes
        let n: u64 = b.parse().map_err(|_| ())?;
        if n == 0 || len == 0 {
            return Err(());
        }
        ByteRange { start: len.saturating_sub(n), end: len - 1 }
    } else {
        let start: u64 = a.parse().map_err(|_| ())?;
        if start >= len {
            return Err(());
        }
        let end = if b.is_empty() {
            len - 1
        } else {
            let e: u64 = b.parse().map_err(|_| ())?;
            if e < start {
                return Err(());
            }
            e.min(len - 1)
        };
        ByteRange { start, end }
    };
    Ok(Some(range))
}

/// Löst einen URL-Pfad sicher innerhalb von `root` auf. Nur einfache
/// Dateinamen aus Buchstaben, Ziffern, `-`, `_` und `.` sind erlaubt.
pub fn resolve(root: &Path, url_path: &str) -> Option<PathBuf> {
    let name = url_path.trim_start_matches('/');
    let name = name.split(['?', '#']).next().unwrap_or("");
    if name.is_empty()
        || name.starts_with('.')
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return None;
    }
    Some(root.join(name))
}

/// Beantwortet eine Anfrage an `root` für `url_path`.
pub fn serve(root: &Path, method: &str, url_path: &str, range: Option<&str>) -> Reply {
    if method.eq_ignore_ascii_case("OPTIONS") {
        return Reply { status: 204, headers: cors(vec![]), body: vec![] };
    }
    let head = method.eq_ignore_ascii_case("HEAD");
    if !head && !method.eq_ignore_ascii_case("GET") {
        return Reply::error(405, "Methode nicht erlaubt");
    }
    let Some(path) = resolve(root, url_path) else {
        return Reply::error(400, "ungültiger Pfad");
    };
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return Reply::error(404, "nicht gefunden"),
    };
    let meta = match file.metadata() {
        Ok(m) if m.is_file() => m,
        _ => return Reply::error(404, "nicht gefunden"),
    };
    let len = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let etag = format!("\"{len:x}-{mtime:x}\"");
    let ctype = content_type(&path);

    let parsed = match parse_range(range, len) {
        Ok(r) => r,
        Err(()) => {
            let mut r = Reply::error(416, "Bereich nicht erfüllbar");
            r.headers.push(("Content-Range", format!("bytes */{len}")));
            return r;
        }
    };
    let (status, start, count) = match parsed {
        Some(r) => (206, r.start, r.end - r.start + 1),
        None => (200, 0, len),
    };
    let mut body = Vec::new();
    if !head {
        body = vec![0u8; count as usize];
        if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut body).is_err() {
            return Reply::error(500, "Lesefehler");
        }
    }
    let mut headers = vec![
        ("Content-Type", ctype.to_string()),
        ("Content-Length", count.to_string()),
        ("Accept-Ranges", "bytes".to_string()),
        ("ETag", etag),
        ("Cache-Control", "no-cache".to_string()),
    ];
    if status == 206 {
        headers.push(("Content-Range", format!("bytes {}-{}/{}", start, start + count - 1, len)));
    }
    Reply { status, headers: cors(headers), body }
}

fn content_type(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "json" => "application/json",
        "pmtiles" | "bin" => "application/octet-stream",
        "pbf" => "application/x-protobuf",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn fixture(name: &str) -> (PathBuf, Vec<u8>) {
        let dir = std::env::temp_dir().join(format!("range_proto_{}_{}", name, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let data: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
        let mut f = File::create(dir.join("region.pmtiles")).unwrap();
        f.write_all(&data).unwrap();
        (dir, data)
    }

    #[test]
    fn parses_ranges() {
        assert_eq!(parse_range(None, 100), Ok(None));
        assert_eq!(parse_range(Some("bytes=0-9"), 100), Ok(Some(ByteRange { start: 0, end: 9 })));
        assert_eq!(parse_range(Some("bytes=90-"), 100), Ok(Some(ByteRange { start: 90, end: 99 })));
        assert_eq!(parse_range(Some("bytes=-10"), 100), Ok(Some(ByteRange { start: 90, end: 99 })));
        assert_eq!(parse_range(Some("bytes=-500"), 100), Ok(Some(ByteRange { start: 0, end: 99 })));
        assert_eq!(parse_range(Some("bytes=50-5000"), 100), Ok(Some(ByteRange { start: 50, end: 99 })));
        assert_eq!(parse_range(Some("bytes=100-"), 100), Err(()));
        assert_eq!(parse_range(Some("bytes=9-3"), 100), Err(()));
        assert_eq!(parse_range(Some("bytes=abc"), 100), Err(()));
        assert_eq!(parse_range(Some("bytes=0-1,4-5"), 100), Ok(None));
        assert_eq!(parse_range(Some("items=0-1"), 100), Ok(None));
    }

    #[test]
    fn serves_partial_content() {
        let (dir, data) = fixture("serves_partial_content");
        let r = serve(&dir, "GET", "/region.pmtiles", Some("bytes=100-199"));
        assert_eq!(r.status, 206);
        assert_eq!(r.body, &data[100..200]);
        assert_eq!(r.header("Content-Range"), Some("bytes 100-199/1000"));
        assert_eq!(r.header("Content-Length"), Some("100"));
        assert_eq!(r.header("Access-Control-Allow-Origin"), Some("*"));
        assert!(r.header("Access-Control-Expose-Headers").unwrap().contains("Content-Range"));
    }

    #[test]
    fn serves_whole_file_and_head() {
        let (dir, data) = fixture("serves_whole_file_and_head");
        let r = serve(&dir, "GET", "region.pmtiles", None);
        assert_eq!(r.status, 200);
        assert_eq!(r.body, data);
        let h = serve(&dir, "HEAD", "region.pmtiles", Some("bytes=0-9"));
        assert_eq!(h.status, 206);
        assert!(h.body.is_empty());
        assert_eq!(h.header("Content-Length"), Some("10"));
    }

    #[test]
    fn rejects_bad_requests() {
        let (dir, _) = fixture("rejects_bad_requests");
        assert_eq!(serve(&dir, "GET", "../etc/passwd", None).status, 400);
        assert_eq!(serve(&dir, "GET", "/a/b.pmtiles", None).status, 400);
        assert_eq!(serve(&dir, "GET", ".hidden", None).status, 400);
        assert_eq!(serve(&dir, "GET", "missing.pmtiles", None).status, 404);
        assert_eq!(serve(&dir, "POST", "region.pmtiles", None).status, 405);
        let r = serve(&dir, "GET", "region.pmtiles", Some("bytes=5000-"));
        assert_eq!(r.status, 416);
        assert_eq!(r.header("Content-Range"), Some("bytes */1000"));
        assert_eq!(serve(&dir, "OPTIONS", "region.pmtiles", None).status, 204);
    }
}
