// HTTP-API: Strecken, Bestenliste, Läufe einreichen (werden nachgespielt), Ghosts.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { TRACKS, trackById, dailyTrack } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';
import { openDb } from './db.js';
import { createVerifier } from './verifier.js';

const isoDay = (d) => d.toISOString().slice(0, 10);

export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw
    .normalize('NFC')
    .replace(/[\p{C}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
  return name.length ? name : null;
}

export async function buildApp({ dbFile = 'data/glide.db', staticDir = null, now = () => new Date(), verifier = null, logger = false, runsPerMinute = 12 } = {}) {
  const app = Fastify({ logger, bodyLimit: 256 * 1024, trustProxy: true });
  const db = openDb(dbFile);
  const v = verifier ?? createVerifier();
  app.addHook('onClose', async () => {
    db.close();
    if (!verifier) await v.close();
  });

  // Tagesrennen: heute (UTC) sowie ±1 Tag, damit alle Zeitzonen mitfahren können
  const allowedDaily = () => {
    const t = now().getTime();
    return new Set([-1, 0, 1].map((d) => `daily-${isoDay(new Date(t + d * 86400000))}`));
  };

  // Einfache Drosselung je IP
  const hits = new Map();
  const limited = (ip) => {
    const t = Date.now();
    const list = (hits.get(ip) ?? []).filter((x) => t - x < 60000);
    list.push(t);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, l] of hits) if (t - l[l.length - 1] > 60000) hits.delete(k);
    return list.length > runsPerMinute;
  };

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/tracks', async () => {
    const stats = db.stats();
    const today = dailyTrack(isoDay(now()));
    const list = [...Object.values(TRACKS).map((d) => ({ ...d, daily: false })), { ...today, daily: true }];
    return {
      today: isoDay(now()),
      tracks: list.map((d) => ({
        id: d.id,
        name: d.name,
        tagline: d.tagline,
        length: d.finish,
        daily: d.daily,
        runs: stats[d.id]?.runs ?? 0,
        bestMs: stats[d.id]?.bestMs ?? null,
      })),
      cheeses: Object.values(CHEESES).map(({ id, name, blurb }) => ({ id, name, blurb })),
    };
  });

  app.get('/api/leaderboard/:track', async (req, reply) => {
    const { track } = req.params;
    if (!trackById(track)) return reply.code(404).send({ error: 'Unbekannte Strecke' });
    const cheese = CHEESES[req.query.cheese] ? req.query.cheese : null;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const entries = db.leaderboard(track, { cheese, limit });
    const name = cleanName(req.query.name);
    return { track, cheese, entries, personalBestMs: name ? db.personalBest(track, name) : null };
  });

  app.post('/api/runs', async (req, reply) => {
    const { track, cheese, inputs, timeMs: claimed } = req.body ?? {};
    const name = cleanName(req.body?.name);
    const def = trackById(track);
    if (!def) return reply.code(400).send({ error: 'Unbekannte Strecke' });
    if (def.id.startsWith('daily-') && !allowedDaily().has(def.id)) return reply.code(400).send({ error: 'Dieses Tagesrennen ist vorbei' });
    if (!CHEESES[cheese]) return reply.code(400).send({ error: 'Unbekannter Käse' });
    if (!name) return reply.code(400).send({ error: 'Bitte einen Namen angeben' });
    if (typeof inputs !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(inputs)) return reply.code(400).send({ error: 'Ungültige Eingabedaten' });
    if (limited(req.ip)) return reply.code(429).send({ error: 'Zu viele Läufe – kurz durchatmen' });
    if (v.queued > 64) return reply.code(503).send({ error: 'Server ist ausgelastet' });

    const r = await v.verify(def.id, cheese, inputs);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    if (r.broken) return reply.code(422).send({ error: 'Der Laib ist unterwegs zerbrochen' });
    if (!r.finished) return reply.code(422).send({ error: 'Lauf hat das Ziel nicht erreicht' });

    const timeMs = Math.round(r.time * 1000);
    const desync = typeof claimed === 'number' && Math.abs(claimed - timeMs) > 1;
    if (desync) req.log.warn({ track, cheese, claimed, timeMs }, 'Abweichung zwischen Client und Server');
    const previousBest = db.personalBest(def.id, name);
    const integrity = Math.round(r.integrity * 100);
    const id = db.addRun({ track: def.id, cheese, name, timeMs, respawns: r.respawns, integrity, inputs, frames: r.frames });
    return {
      ok: true,
      id,
      timeMs,
      respawns: r.respawns,
      integrity,
      rank: db.rank(def.id, timeMs),
      personalBest: previousBest === null || timeMs < previousBest,
      desync,
    };
  });

  app.get('/api/ghost/:id', async (req, reply) => {
    const g = db.ghost(Number(req.params.id));
    if (!g) return reply.code(404).send({ error: 'Ghost nicht gefunden' });
    return { ...g, every: 2 };
  });

  app.get('/api/ghost/top/:track', async (req, reply) => {
    const cheese = CHEESES[req.query.cheese] ? req.query.cheese : null;
    const g = db.topGhost(req.params.track, cheese);
    if (!g) return reply.code(404).send({ error: 'Noch kein Ghost' });
    return { ...g, every: 2 };
  });

  if (staticDir && fs.existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir, preCompressed: true, maxAge: '1h', setHeaders: (reply, file) => /[\/]assets[\/]/.test(file) && reply.header('cache-control', 'public, max-age=31536000, immutable') });
  }

  return app;
}
