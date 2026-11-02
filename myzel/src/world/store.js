// Dauerhafte Welt: veränderte Chunks und Metadaten im localStorage.
// Pro Chunk vier Kanäle (Leben, Myzel, Farbton, Fäulnis) à 32×32 Byte, delta- und lauflängenkodiert.
// Ältere Spielstände mit drei Kanälen werden gelesen (Fäulnis = 0).
import { CHUNK } from '../config.js';

const CELLS = CHUNK * CHUNK;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    s += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    s += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return s;
}

function fromB64(s) {
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]);
    const b = B64.indexOf(s[i + 1]);
    const c = s[i + 2] === '=' ? -1 : B64.indexOf(s[i + 2]);
    const d = s[i + 3] === '=' ? -1 : B64.indexOf(s[i + 3]);
    out.push((a << 2) | (b >> 4));
    if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(out);
}

export function encodeChunk({ L, M, H, B }) {
  const out = [];
  for (const ch of [L, M, H, B ?? new Uint8Array(CELLS)]) {
    let prev = 0;
    let run = 0;
    for (let i = 0; i < CELLS; i++) {
      const d = (ch[i] - prev) & 255;
      prev = ch[i];
      if (d === 0) {
        run++;
        if (run === 255) {
          out.push(0, 255);
          run = 0;
        }
      } else {
        if (run) out.push(0, run);
        run = 0;
        out.push(d);
      }
    }
    if (run) out.push(0, run);
  }
  return toB64(out);
}

export function decodeChunk(str) {
  const bytes = fromB64(str);
  const chans = [new Uint8Array(CELLS), new Uint8Array(CELLS), new Uint8Array(CELLS), new Uint8Array(CELLS)];
  let p = 0;
  for (const ch of chans) {
    let i = 0;
    let prev = 0;
    while (i < CELLS && p < bytes.length) {
      const b = bytes[p++];
      if (b === 0) {
        const run = bytes[p++];
        for (let k = 0; k < run && i < CELLS; k++) ch[i++] = prev;
      } else {
        prev = (prev + b) & 255;
        ch[i++] = prev;
      }
    }
  }
  return { L: chans[0], M: chans[1], H: chans[2], B: chans[3] };
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('myzel:probe', '1');
    s.removeItem('myzel:probe');
    return s;
  } catch {
    return memoryStorage();
  }
}

export function createStore(seed, storage = defaultStorage()) {
  const prefix = `myzel:${seed}:`;
  const chunks = new Map();
  const dirty = new Set();
  let quotaHit = false;

  const store = {
    seed,
    storage,
    get quotaHit() {
      return quotaHit;
    },
    get(key) {
      let c = chunks.get(key);
      if (c) return c;
      const raw = storage.getItem(prefix + 'c:' + key);
      if (!raw) return null;
      try {
        c = decodeChunk(raw);
      } catch {
        return null;
      }
      chunks.set(key, c);
      return c;
    },
    put(key, data) {
      chunks.set(key, data);
      dirty.add(key);
    },
    flush() {
      for (const key of dirty) {
        try {
          storage.setItem(prefix + 'c:' + key, encodeChunk(chunks.get(key)));
        } catch {
          quotaHit = true;
        }
      }
      dirty.clear();
    },
    loadMeta() {
      try {
        return JSON.parse(storage.getItem(prefix + 'meta')) || null;
      } catch {
        return null;
      }
    },
    saveMeta(meta) {
      try {
        storage.setItem(prefix + 'meta', JSON.stringify({ ...meta, seed, saved: Date.now() }));
        storage.setItem('myzel:last', String(seed));
      } catch {
        quotaHit = true;
      }
    },
    wipe() {
      const keys = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
      chunks.clear();
      dirty.clear();
    },
  };
  return store;
}

export function lastSeed(storage = defaultStorage()) {
  const v = storage.getItem('myzel:last');
  if (v == null) return null;
  const meta = storage.getItem(`myzel:${v}:meta`);
  return meta ? Number(v) : null;
}
