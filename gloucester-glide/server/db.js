// Speicherung der Läufe in SQLite (in Node eingebaut).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track TEXT NOT NULL,
      cheese TEXT NOT NULL,
      name TEXT NOT NULL,
      time_ms INTEGER NOT NULL,
      respawns INTEGER NOT NULL,
      inputs TEXT NOT NULL,
      frames TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_track_time ON runs (track, time_ms);
  `);
  // Spalten, die später dazukamen
  const cols = db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name);
  if (!cols.includes('integrity')) db.exec('ALTER TABLE runs ADD COLUMN integrity INTEGER NOT NULL DEFAULT 100');

  const insert = db.prepare(
    'INSERT INTO runs (track, cheese, name, time_ms, respawns, integrity, inputs, frames, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // Bestenliste: je Name nur der beste Lauf
  const best = db.prepare(`
    SELECT id, name, cheese, time_ms AS timeMs, respawns, integrity, created_at AS createdAt FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY name ORDER BY time_ms, id) AS rn
      FROM runs WHERE track = ? AND (? IS NULL OR cheese = ?)
    ) WHERE rn = 1 ORDER BY time_ms, id LIMIT ?
  `);
  const rankOf = db.prepare(`
    SELECT COUNT(*) AS better FROM (
      SELECT name, MIN(time_ms) AS t FROM runs WHERE track = ? GROUP BY name
    ) WHERE t < ?
  `);
  const ghost = db.prepare('SELECT id, track, name, cheese, time_ms AS timeMs, frames FROM runs WHERE id = ?');
  const top = db.prepare(
    'SELECT id, track, name, cheese, time_ms AS timeMs, frames FROM runs WHERE track = ? AND (? IS NULL OR cheese = ?) ORDER BY time_ms, id LIMIT 1',
  );
  const personal = db.prepare('SELECT MIN(time_ms) AS t FROM runs WHERE track = ? AND name = ?');
  const counts = db.prepare('SELECT track, COUNT(*) AS runs, MIN(time_ms) AS bestMs FROM runs GROUP BY track');

  return {
    addRun({ track, cheese, name, timeMs, respawns, integrity = 100, inputs, frames }) {
      const r = insert.run(track, cheese, name, timeMs, respawns, integrity, inputs, frames, Date.now());
      return Number(r.lastInsertRowid);
    },
    leaderboard(track, { cheese = null, limit = 20 } = {}) {
      return best.all(track, cheese, cheese, limit);
    },
    rank(track, timeMs) {
      return rankOf.get(track, timeMs).better + 1;
    },
    personalBest(track, name) {
      return personal.get(track, name).t ?? null;
    },
    ghost(id) {
      return ghost.get(id) ?? null;
    },
    topGhost(track, cheese = null) {
      return top.get(track, cheese, cheese) ?? null;
    },
    stats() {
      return Object.fromEntries(counts.all().map((r) => [r.track, { runs: r.runs, bestMs: r.bestMs }]));
    },
    close() {
      db.close();
    },
  };
}
