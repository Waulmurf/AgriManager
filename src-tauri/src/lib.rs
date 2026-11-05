//! Tauri-Hülle der Lohnbetrieb-Simulation.
//!
//! Registriert das Protokoll `mapdata://`, das Dateien aus dem Ressourcen-
//! verzeichnis `map/` (PMTiles, Straßengraph) mit HTTP-Range ausliefert.
//! Im WebView lautet die URL je nach System `mapdata://localhost/<datei>`
//! (macOS/Linux) bzw. `http://mapdata.localhost/<datei>` (Windows).

use std::path::PathBuf;
use tauri::http::{Response, StatusCode};
use tauri::Manager;

fn map_dir(app: &tauri::AppHandle) -> PathBuf {
    // Entwicklungsmodus: Dateien direkt aus src-tauri/resources/map lesen
    if cfg!(debug_assertions) {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("map");
        if dev.is_dir() {
            return dev;
        }
    }
    app.path()
        .resource_dir()
        .map(|d| d.join("map"))
        .unwrap_or_else(|_| PathBuf::from("map"))
}

/// Selbsttest-Einstellungen aus der Umgebung (LOHNBETRIEB_SELFTEST=1,
/// LOHNBETRIEB_SELFTEST_SECONDS, LOHNBETRIEB_SELFTEST_MIN_FPS, LOHNBETRIEB_SELFTEST_MIN_SPS).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SelftestConfig {
    enabled: bool,
    seconds: u32,
    min_fps: f64,
    min_sps: f64,
}

#[tauri::command]
fn selftest_config() -> SelftestConfig {
    let env = |k: &str| std::env::var(k).ok();
    SelftestConfig {
        enabled: env("LOHNBETRIEB_SELFTEST").is_some_and(|v| v == "1"),
        seconds: env("LOHNBETRIEB_SELFTEST_SECONDS").and_then(|v| v.parse().ok()).unwrap_or(20),
        min_fps: env("LOHNBETRIEB_SELFTEST_MIN_FPS").and_then(|v| v.parse().ok()).unwrap_or(30.0),
        min_sps: env("LOHNBETRIEB_SELFTEST_MIN_SPS").and_then(|v| v.parse().ok()).unwrap_or(90.0),
    }
}

/// Gibt das Selbsttest-Ergebnis aus, schreibt es optional in eine Datei
/// (LOHNBETRIEB_SELFTEST_OUT) und beendet die App (Exit-Code 0 = bestanden).
#[tauri::command]
fn selftest_report(app: tauri::AppHandle, json: String) {
    println!("SELFTEST_RESULT {json}");
    if let Ok(path) = std::env::var("LOHNBETRIEB_SELFTEST_OUT") {
        let _ = std::fs::write(path, &json);
    }
    let ok = json.contains("\"ok\":true");
    app.exit(if ok { 0 } else { 1 });
}

/// Protokollzeile aus dem WebView auf die Konsole (nur im Selbsttest genutzt).
#[tauri::command]
fn selftest_log(msg: String) {
    println!("WEBVIEW {msg}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Spielstände als SQLite-Dateien (eine Datei je Spielstand im App-Datenordner)
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![selftest_config, selftest_report, selftest_log])
        .register_asynchronous_uri_scheme_protocol("mapdata", |ctx, request, responder| {
            let root = map_dir(ctx.app_handle());
            let method = request.method().as_str().to_string();
            let path = request.uri().path().to_string();
            let range = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            // Dateizugriff nicht im Event-Loop des WebViews
            std::thread::spawn(move || {
                let reply = range_proto::serve(&root, &method, &path, range.as_deref());
                let mut builder = Response::builder()
                    .status(StatusCode::from_u16(reply.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));
                for (k, v) in &reply.headers {
                    builder = builder.header(*k, v);
                }
                responder.respond(builder.body(reply.body).expect("gültige Antwort"));
            });
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Start der Anwendung");
}
