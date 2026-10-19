// Server-Anbindung. Ohne Server läuft das Spiel trotzdem – dann nur mit lokalen Bestzeiten.
import { TRACKS, dailyTrack } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';

async function call(path, opts) {
  const res = await fetch(`./api${path}`, { headers: { 'content-type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Fehler ${res.status}`), { status: res.status });
  return body;
}

export const api = {
  online: true,
  async tracks() {
    try {
      const r = await call('/tracks');
      this.online = true;
      return r;
    } catch {
      this.online = false;
      const today = new Date().toISOString().slice(0, 10);
      const list = [...Object.values(TRACKS).map((d) => ({ ...d, daily: false })), { ...dailyTrack(today), daily: true }];
      return {
        today,
        offline: true,
        tracks: list.map((d) => ({ id: d.id, name: d.name, tagline: d.tagline, length: d.finish, daily: d.daily, runs: 0, bestMs: null })),
        cheeses: Object.values(CHEESES),
      };
    }
  },
  leaderboard(track, { cheese, name, limit = 20 } = {}) {
    const q = new URLSearchParams({ limit });
    if (cheese) q.set('cheese', cheese);
    if (name) q.set('name', name);
    return call(`/leaderboard/${encodeURIComponent(track)}?${q}`);
  },
  submit(run) {
    return call('/runs', { method: 'POST', body: JSON.stringify(run) });
  },
  ghost(id) {
    return call(`/ghost/${id}`);
  },
  topGhost(track, cheese) {
    return call(`/ghost/top/${encodeURIComponent(track)}${cheese ? `?cheese=${cheese}` : ''}`);
  },
};

// Lokale Ablage: Name, Auswahl, eigene Bestzeiten und Ghosts
const KEY = 'gloucester-glide';
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
export const local = {
  data: load(),
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* privates Fenster o. Ä. */
    }
  },
  get(k, d) {
    return this.data[k] ?? d;
  },
  set(k, v) {
    this.data[k] = v;
    this.save();
  },
  best(track, cheese) {
    return this.data.bests?.[`${track}/${cheese}`] ?? null;
  },
  bestAny(track) {
    const all = Object.entries(this.data.bests ?? {}).filter(([k]) => k.startsWith(`${track}/`));
    return all.reduce((m, [, v]) => (!m || v.timeMs < m.timeMs ? v : m), null);
  },
  setBest(track, cheese, rec) {
    this.data.bests ||= {};
    this.data.bests[`${track}/${cheese}`] = rec;
    // alte Tagesrennen aufräumen
    const keep = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(this.data.bests)) {
      const m = /^daily-(\d{4}-\d{2}-\d{2})\//.exec(k);
      if (m && m[1] < keep) delete this.data.bests[k];
    }
    this.save();
  },
};
