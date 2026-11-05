/**
 * Spielstände: in der App als SQLite-Datei je Spielstand (Tauri-SQL-Plugin), im Browser
 * (Entwicklung, Tests) im localStorage. Neben dem vollständigen Zustand (JSON) werden
 * Buchungen, Rechnungen und Kundenakten als Tabellen abgelegt, damit die Historie
 * auswertbar bleibt (siehe Anforderungen „Datenhaltung“).
 */
import { isTauri } from '../platform';
import type { SaveState } from '../sim/engine';
import type { BusinessState, FarmSummary } from '../sim/protocol';

export const AUTOSAVE = 'Autosave';
const SCHEMA_VERSION = 1;

export interface SaveInfo {
  name: string;
  updated: number;
  gameTime: number;
  cash: number;
  dataTag: string;
}

export interface SaveExtras {
  dataTag: string;
  business: BusinessState | null;
  farms: FarmSummary[];
}

export interface SaveStore {
  list(): Promise<SaveInfo[]>;
  save(name: string, state: SaveState, extras: SaveExtras): Promise<void>;
  load(name: string): Promise<{ state: SaveState; info: SaveInfo } | null>;
  remove(name: string): Promise<void>;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || 'spielstand';

// ---------------------------------------------------------------------------
// Browser

class BrowserStore implements SaveStore {
  private key = (n: string) => `lohnbetrieb:save:${slug(n)}`;
  async list(): Promise<SaveInfo[]> {
    const out: SaveInfo[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('lohnbetrieb:save:')) continue;
        const v = JSON.parse(localStorage.getItem(k)!);
        out.push(v.info);
      }
    } catch {
      /* Speicher nicht verfügbar */
    }
    return out.sort((a, b) => b.updated - a.updated);
  }
  async save(name: string, state: SaveState, extras: SaveExtras) {
    const info: SaveInfo = { name, updated: Date.now(), gameTime: state.time, cash: state.company.cash, dataTag: extras.dataTag };
    localStorage.setItem(this.key(name), JSON.stringify({ info, state }));
  }
  async load(name: string) {
    const raw = localStorage.getItem(this.key(name));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return { state: v.state as SaveState, info: v.info as SaveInfo };
  }
  async remove(name: string) {
    localStorage.removeItem(this.key(name));
  }
}

// ---------------------------------------------------------------------------
// Tauri / SQLite

type Db = {
  path: string;
  execute(sql: string, args?: unknown[]): Promise<unknown>;
  select<T>(sql: string, args?: unknown[]): Promise<T>;
  /** Achtung: close() ohne Pfad schließt ALLE Verbindungen des Plugins */
  close(db?: string): Promise<boolean>;
};

class SqliteStore implements SaveStore {
  private indexDb: Promise<Db> | null = null;

  private async open(path: string): Promise<Db> {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    return (await Database.load(path)) as unknown as Db;
  }

  /** Verzeichnis aller Spielstände (spielstaende.db) */
  private index(): Promise<Db> {
    if (!this.indexDb) {
      this.indexDb = this.open('sqlite:spielstaende.db').then(async (db) => {
        await db.execute(
          'CREATE TABLE IF NOT EXISTS spielstaende (name TEXT PRIMARY KEY, datei TEXT NOT NULL, aktualisiert INTEGER, spielzeit INTEGER, konto REAL, kartendaten TEXT)',
        );
        return db;
      });
    }
    return this.indexDb;
  }

  async list(): Promise<SaveInfo[]> {
    const db = await this.index();
    const rows = await db.select<{ name: string; aktualisiert: number; spielzeit: number; konto: number; kartendaten: string }[]>(
      'SELECT name, aktualisiert, spielzeit, konto, kartendaten FROM spielstaende ORDER BY aktualisiert DESC',
    );
    return rows.map((r) => ({ name: r.name, updated: r.aktualisiert, gameTime: r.spielzeit, cash: r.konto, dataTag: r.kartendaten }));
  }

  async save(name: string, state: SaveState, extras: SaveExtras) {
    const file = `spielstand-${slug(name)}.db`;
    const db = await this.open(`sqlite:${file}`);
    try {
      // Schema mit Versionsnummer (für spätere Migrationen). Keine BEGIN/COMMIT-Klammer: das
      // SQL-Plugin nutzt einen Verbindungspool, Transaktionen über mehrere Aufrufe sind unsicher.
      await db.execute('CREATE TABLE IF NOT EXISTS meta (schluessel TEXT PRIMARY KEY, wert TEXT)');
      await db.execute('CREATE TABLE IF NOT EXISTS zustand (id INTEGER PRIMARY KEY, json TEXT NOT NULL)');
      await db.execute('CREATE TABLE IF NOT EXISTS buchungen (nr INTEGER PRIMARY KEY, spielzeit INTEGER, text TEXT, betrag REAL, kategorie TEXT)');
      await db.execute('CREATE TABLE IF NOT EXISTS rechnungen (nummer TEXT PRIMARY KEY, betrieb TEXT, betrag REAL, gestellt INTEGER, faellig INTEGER, bezahlt INTEGER, status TEXT)');
      await db.execute('CREATE TABLE IF NOT EXISTS kunden (id INTEGER PRIMARY KEY, name TEXT, flaeche_ha REAL, bekannt INTEGER, zufriedenheit INTEGER)');
      const meta: [string, string][] = [
        ['schema', String(SCHEMA_VERSION)],
        ['name', name],
        ['kartendaten', extras.dataTag],
        ['spielzeit', String(state.time)],
        ['gespeichert', new Date().toISOString()],
      ];
      for (const [k, v] of meta) await db.execute('INSERT OR REPLACE INTO meta (schluessel, wert) VALUES ($1, $2)', [k, v]);
      await db.execute('INSERT OR REPLACE INTO zustand (id, json) VALUES (1, $1)', [JSON.stringify(state)]);
      await db.execute('DELETE FROM buchungen');
      let nr = 1;
      for (const l of state.business.ledger) {
        await db.execute('INSERT INTO buchungen (nr, spielzeit, text, betrag, kategorie) VALUES ($1, $2, $3, $4, $5)', [nr++, l.time, l.text, l.amount, l.category]);
      }
      await db.execute('DELETE FROM rechnungen');
      const farmName = (id: number) => extras.farms[id]?.name ?? String(id);
      for (const i of state.business.invoices) {
        await db.execute(
          'INSERT INTO rechnungen (nummer, betrieb, betrag, gestellt, faellig, bezahlt, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [i.number, farmName(i.farmId), i.amount, i.issuedAt, i.dueAt, i.paidAt ?? null, i.status],
        );
      }
      await db.execute('DELETE FROM kunden');
      for (let id = 0; id < state.farms.length; id++) {
        const [known, sat] = state.farms[id];
        if (!known) continue; // Kundenakte nur für Betriebe im Adressbuch
        await db.execute('INSERT INTO kunden (id, name, flaeche_ha, bekannt, zufriedenheit) VALUES ($1, $2, $3, $4, $5)', [id, farmName(id), extras.farms[id]?.areaHa ?? 0, 1, sat]);
      }
    } finally {
      await db.close(db.path);
    }
    const idx = await this.index();
    await idx.execute(
      'INSERT OR REPLACE INTO spielstaende (name, datei, aktualisiert, spielzeit, konto, kartendaten) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, file, Date.now(), state.time, state.company.cash, extras.dataTag],
    );
  }

  async load(name: string) {
    const idx = await this.index();
    const rows = await idx.select<{ datei: string; aktualisiert: number; spielzeit: number; konto: number; kartendaten: string }[]>(
      'SELECT datei, aktualisiert, spielzeit, konto, kartendaten FROM spielstaende WHERE name = $1',
      [name],
    );
    if (!rows.length) return null;
    const db = await this.open(`sqlite:${rows[0].datei}`);
    try {
      const st = await db.select<{ json: string }[]>('SELECT json FROM zustand WHERE id = 1');
      if (!st.length) return null;
      const r = rows[0];
      return {
        state: JSON.parse(st[0].json) as SaveState,
        info: { name, updated: r.aktualisiert, gameTime: r.spielzeit, cash: r.konto, dataTag: r.kartendaten },
      };
    } finally {
      await db.close(db.path);
    }
  }

  async remove(name: string) {
    // Datei bleibt liegen (kein Dateisystem-Zugriff nötig), der Eintrag verschwindet aus der Liste
    const idx = await this.index();
    await idx.execute('DELETE FROM spielstaende WHERE name = $1', [name]);
  }
}

export function createSaveStore(): SaveStore {
  return isTauri ? new SqliteStore() : new BrowserStore();
}
