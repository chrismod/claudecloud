// Klang von Myzel – alles live erzeugt mit WebAudio, keine Dateien.
//
//  Mischpult:  Musik (mit Ducking) · Ambience · Effekte → Kompressor → Limiter
//              Hall (Faltungshall aus erzeugter Impulsantwort) und Ping-Pong-Echo als Sends
//  3D-Klang:   HRTF-Panner für alles mit Position; der Hörer folgt der Kamera
//  Musik:      Takt-genauer Scheduler (66 BPM) mit Schichten, die nach Spielzustand ein- und
//              ausblenden: Klangteppich, gezupfte Motive (Karplus-Strong), Bass, Glocken (FM),
//              Trommeln bei Gefahr, dunkles Cello bei Nacht. Tag in D-Dur-Pentatonik,
//              Nacht in d-Moll (äolisch).
//  Ambience:   Wind mit Böen, Laubrascheln, Amsel, Meise, Kuckuck, Specht am Tag;
//              Waldkauz, Grillen, Frösche bei Nacht; Plätschern am Wasser; Brodeln in der Fäulnis.

const ROOT = 146.83; // D3
const hz = (semi) => ROOT * 2 ** (semi / 12);
const DAY = {
  scale: [0, 2, 4, 7, 9],
  chords: [
    [0, 7, 12, 16],
    [-3, 4, 9, 12],
    [-7, 0, 5, 9],
    [-5, 2, 7, 11],
  ],
};
const NIGHT = {
  scale: [0, 3, 5, 7, 10],
  chords: [
    [0, 7, 12, 15],
    [-4, 3, 8, 12],
    [3, 10, 15, 19],
    [-2, 5, 10, 14],
  ],
};

let ctx = null;
let master;
let musicBus;
let duck;
let ambBus;
let sfxBus;
let revSend;
let dlySend;
let noiseBuf;
let volume = 0.8;
const KS = new Map();

// Zustand für Musik und Ambience
const st = { life: 0.5, night: 0, activity: 0, weave: 0, rot: 0, danger: 0, water: 0, speed: 0, play: false };
const lay = { pad: 0, melody: 0, bass: 0, drums: 0, cello: 0, bells: 0 };
let beatT = 0;
let beat = 0;
let chordIdx = 0;
let motif = [];
let pad = null;
let cello = null;
let wind = null;
let rustle = null;
let shimmer = null;
let water = null;
let rotDrone = null;
let whoosh = null;
let crickets = [];
let nextBird = 2;
let nextNight = 3;
let nextBubble = 0;
let nextGrain = 0;
let gust = 0;
let gustTarget = 0;
let gustT = 0;
let nest = { level: 0, x: 0, y: 0, z: 0, next: 0 };

// --- Grundbausteine ---------------------------------------------------------------------------
function makeNoise(seconds = 4) {
  const b = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

// Impulsantwort: frühe Reflexionen + diffuser Nachhall, der mit der Zeit dunkler wird
function makeIR(seconds = 3.6) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let k = 0; k < 14; k++) {
      const i = Math.floor(sr * (0.008 + Math.random() * 0.08));
      d[i] += (Math.random() * 2 - 1) * (0.6 - k * 0.03);
    }
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = 0.25 + 0.7 * t; // Tiefpass wird stärker
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] += lp * Math.pow(1 - t, 2.2) * 0.9;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = b;
  return conv;
}

function panner(x, y, z) {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 9;
  p.maxDistance = 300;
  p.rolloffFactor = 1.1;
  p.positionX.value = x;
  p.positionY.value = y;
  p.positionZ.value = z;
  return p;
}

// Ausgang einer Stimme: Position oder Stereo, plus Hall- und Echo-Anteil
function route(node, { pos = null, pan = 0, rev = 0.25, dly = 0, bus = sfxBus } = {}) {
  let out;
  if (pos) out = panner(pos[0], pos[1], pos[2]);
  else {
    out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
  }
  node.connect(out);
  out.connect(bus);
  if (rev > 0) {
    const g = ctx.createGain();
    g.gain.value = rev;
    out.connect(g).connect(revSend);
  }
  if (dly > 0) {
    const g = ctx.createGain();
    g.gain.value = dly;
    out.connect(g).connect(dlySend);
  }
  return out;
}

function envGain(t, attack, decay, peak, hold = 0) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
  return g;
}

function osc(type, freq, t, dur) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function tone(freq, { t = ctx.currentTime, type = 'sine', attack = 0.005, decay = 1, gain = 0.1, slide = 0, ...r } = {}) {
  const o = osc(type, freq, t, attack + decay);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + attack + decay);
  const g = envGain(t, attack, decay, gain);
  o.connect(g);
  route(g, r);
}

function noise({ t = ctx.currentTime, type = 'bandpass', freq = 1000, q = 1, attack = 0.002, decay = 0.3, gain = 0.2, sweep = 1, ...r } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + attack + decay);
  f.Q.value = q;
  const g = envGain(t, attack, decay, gain);
  src.connect(f).connect(g);
  route(g, r);
  src.start(t, Math.random() * 3);
  src.stop(t + attack + decay + 0.05);
}

// Karplus-Strong: gezupfte Saite / Kalimba, Puffer pro Tonhöhe zwischengespeichert
function ksBuffer(freq) {
  const key = Math.round(freq * 2);
  let b = KS.get(key);
  if (b) return b;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.4);
  b = ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq));
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp = lp * 0.4 + (Math.random() * 2 - 1) * 0.6;
    d[i] = lp * 0.6;
  }
  const damp = 0.9965 - Math.min(0.006, freq / 250000);
  for (let i = N; i < len; i++) d[i] = damp * 0.5 * (d[i - N] + d[i - N - 1 >= 0 ? i - N - 1 : i - N]);
  KS.set(key, b);
  return b;
}

function pluck(freq, { t = ctx.currentTime, gain = 0.12, ...r } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = ksBuffer(freq);
  const g = ctx.createGain();
  g.gain.value = gain;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = Math.min(9000, freq * 7);
  src.connect(f).connect(g);
  route(g, { rev: 0.35, dly: 0.12, ...r });
  src.start(t);
}

// FM-Glocke
function bell(freq, { t = ctx.currentTime, gain = 0.08, ratio = 3.5, index = 2.2, decay = 3, ...r } = {}) {
  const car = osc('sine', freq, t, decay);
  const mod = osc('sine', freq * ratio, t, decay);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(freq * index, t);
  mg.gain.exponentialRampToValueAtTime(freq * 0.02, t + decay * 0.6);
  mod.connect(mg).connect(car.frequency);
  const g = envGain(t, 0.004, decay, gain);
  car.connect(g);
  route(g, { rev: 0.45, dly: 0.15, ...r });
}

// Blechbläser-artig (Horn, Fanfare)
function brass(freq, { t = ctx.currentTime, dur = 1.2, gain = 0.1, ...r } = {}) {
  const a = osc('sawtooth', freq, t, dur + 0.3);
  const b = osc('square', freq * 1.003, t, dur + 0.3);
  const vib = osc('sine', 5, t, dur + 0.3);
  const vg = ctx.createGain();
  vg.gain.value = freq * 0.006;
  vib.connect(vg);
  vg.connect(a.frequency);
  vg.connect(b.frequency);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(freq * 1.2, t);
  f.frequency.linearRampToValueAtTime(freq * 6, t + 0.18);
  f.frequency.linearRampToValueAtTime(freq * 3, t + dur);
  const bg = ctx.createGain();
  bg.gain.value = 0.5;
  b.connect(bg).connect(f);
  a.connect(f);
  const g = envGain(t, 0.08, 0.35, gain, dur);
  f.connect(g);
  route(g, { rev: 0.5, bus: musicBus, ...r });
}

// Chor: Sägezahn mit Vibrato durch drei Formantfilter (Vokal „a“ → „o“)
function choir(freq, { t = ctx.currentTime, dur = 4, gain = 0.05, vowel = 'a', ...r } = {}) {
  const F = vowel === 'a' ? [800, 1150, 2900] : [500, 900, 2600];
  const s = osc('sawtooth', freq, t, dur + 1.5);
  const s2 = osc('sawtooth', freq * 1.004, t, dur + 1.5);
  const vib = osc('sine', 4.8 + Math.random(), t, dur + 1.5);
  const vg = ctx.createGain();
  vg.gain.value = freq * 0.008;
  vib.connect(vg);
  vg.connect(s.frequency);
  vg.connect(s2.frequency);
  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  s.connect(sum);
  s2.connect(sum);
  const g = envGain(t, Math.min(1.2, dur * 0.35), 1.4, gain, dur * 0.5);
  F.forEach((fr, i) => {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = fr;
    f.Q.value = 6;
    const fg = ctx.createGain();
    fg.gain.value = [1, 0.6, 0.25][i];
    sum.connect(f).connect(fg).connect(g);
  });
  route(g, { rev: 0.8, bus: musicBus, ...r });
}

function drum(kind, { t = ctx.currentTime, gain = 0.3, ...r } = {}) {
  if (kind === 'tom') {
    const o = osc('sine', 110, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const g = envGain(t, 0.002, 0.45, gain);
    o.connect(g);
    route(g, { rev: 0.2, bus: musicBus, ...r });
    noise({ t, type: 'lowpass', freq: 400, decay: 0.08, gain: gain * 0.5, bus: musicBus, rev: 0.1, ...r });
  } else if (kind === 'frame') {
    noise({ t, type: 'bandpass', freq: 220, q: 1.5, decay: 0.25, gain, bus: musicBus, rev: 0.25, ...r });
    tone(160, { t, decay: 0.2, gain: gain * 0.6, slide: 0.7, bus: musicBus, rev: 0.2, ...r });
  } else if (kind === 'shaker') {
    noise({ t, type: 'highpass', freq: 6500, q: 0.7, attack: 0.01, decay: 0.07, gain, bus: musicBus, rev: 0.15, ...r });
  }
}

function noiseLoop(type, freq, q, dest, gain = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(dest);
  src.start(0, Math.random() * 3);
  return { f, g };
}

const around = (dMin, dMax, h = 4) => {
  const l = ctx.listener;
  const lx = l.positionX?.value ?? 0;
  const lz = l.positionZ?.value ?? 0;
  const ly = l.positionY?.value ?? 0;
  const a = Math.random() * Math.PI * 2;
  const d = dMin + Math.random() * (dMax - dMin);
  return [lx + Math.cos(a) * d, ly - 10 + h + Math.random() * 6, lz + Math.sin(a) * d];
};

// --- Ambience ---------------------------------------------------------------------------------
function blackbird() {
  const pos = around(15, 40, 8);
  let t = ctx.currentTime;
  const n = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const f = 1500 + Math.random() * 1600;
    const d = 0.08 + Math.random() * 0.18;
    const o = osc('sine', f, t, d);
    o.frequency.exponentialRampToValueAtTime(f * (0.75 + Math.random() * 0.6), t + d);
    const m = osc('sine', f * 2, t, d);
    const mg = ctx.createGain();
    mg.gain.value = f * 0.08;
    m.connect(mg).connect(o.frequency);
    const g = envGain(t, 0.015, d, 0.05);
    o.connect(g);
    route(g, { pos, rev: 0.4, bus: ambBus });
    t += d + 0.04 + Math.random() * 0.1;
  }
}

function tit() {
  const pos = around(10, 30, 7);
  let t = ctx.currentTime;
  for (let r = 0; r < 3; r++) {
    for (const [f, d] of [[6200, 0.06], [6200, 0.06], [4300, 0.12]]) {
      tone(f, { t, attack: 0.008, decay: d, gain: 0.025, slide: 0.92, pos, rev: 0.3, bus: ambBus });
      t += d + 0.05;
    }
    t += 0.12;
  }
}

function cuckoo() {
  const pos = around(45, 80, 10);
  const t = ctx.currentTime;
  tone(720, { t, attack: 0.03, decay: 0.35, gain: 0.05, slide: 0.98, pos, rev: 0.8, bus: ambBus });
  tone(590, { t: t + 0.45, attack: 0.03, decay: 0.45, gain: 0.05, slide: 0.98, pos, rev: 0.8, bus: ambBus });
}

function woodpecker() {
  const pos = around(25, 55, 7);
  let t = ctx.currentTime;
  const n = 14 + Math.floor(Math.random() * 8);
  for (let i = 0; i < n; i++) {
    noise({ t, type: 'bandpass', freq: 1800, q: 3, decay: 0.025, gain: 0.12, pos, rev: 0.5, bus: ambBus });
    t += 0.045 + (i / n) * 0.02;
  }
}

function owl() {
  const pos = around(35, 70, 12);
  let t = ctx.currentTime;
  const hoot = (f, d, g) => {
    const o = osc('sine', f, t, d);
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.linearRampToValueAtTime(f, t + d * 0.3);
    o.frequency.linearRampToValueAtTime(f * 0.94, t + d);
    const vib = osc('sine', 9, t, d);
    const vg = ctx.createGain();
    vg.gain.value = f * 0.012;
    vib.connect(vg).connect(o.frequency);
    const env = envGain(t, 0.06, d, g, d * 0.3);
    o.connect(env);
    route(env, { pos, rev: 0.9, bus: ambBus });
    t += d + 0.2;
  };
  hoot(390, 0.7, 0.08);
  t += 1.4;
  hoot(380, 0.15, 0.05);
  hoot(395, 0.18, 0.05);
  hoot(385, 0.9, 0.07);
}

function frog() {
  const pos = around(12, 35, 1);
  let t = ctx.currentTime;
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const o = osc('sawtooth', 120 + Math.random() * 40, t, 0.18);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 5;
    const am = osc('square', 28, t, 0.18);
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const g = envGain(t, 0.01, 0.16, 0.08);
    const mid = ctx.createGain();
    mid.gain.value = 0.5;
    am.connect(amg).connect(mid.gain);
    o.connect(f).connect(mid).connect(g);
    route(g, { pos, rev: 0.4, bus: ambBus });
    t += 0.26 + Math.random() * 0.1;
  }
}

function makeCrickets() {
  for (let k = 0; k < 3; k++) {
    const o = ctx.createOscillator();
    o.frequency.value = 4300 + k * 450 + Math.random() * 200;
    const am = ctx.createGain();
    am.gain.value = 0;
    const level = ctx.createGain();
    level.gain.value = 0;
    o.connect(am).connect(level);
    route(level, { pan: (k - 1) * 0.7, rev: 0.25, bus: ambBus });
    o.start();
    crickets.push({ am, level, rate: 2.5 + Math.random() * 3, next: 0 });
  }
}

// --- Musik ------------------------------------------------------------------------------------
function makePad() {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = 0;
  filter.connect(g);
  route(g, { rev: 0.7, bus: musicBus });
  const voices = [];
  for (let k = 0; k < 4; k++) {
    const pair = [];
    for (const side of [-1, 1]) {
      const o = ctx.createOscillator();
      o.type = k === 0 ? 'triangle' : 'sawtooth';
      o.detune.value = side * 8;
      const p = ctx.createStereoPanner();
      p.pan.value = side * 0.6;
      const vg = ctx.createGain();
      vg.gain.value = k === 0 ? 0.5 : 0.18;
      o.connect(vg).connect(p).connect(filter);
      o.start();
      pair.push(o);
    }
    voices.push(pair);
  }
  // langsames Atmen
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 180;
  lfo.connect(lg).connect(filter.frequency);
  lfo.start();
  return { filter, g, voices };
}

function makeCello() {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.detune.value = -9;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  f.Q.value = 2;
  const trem = ctx.createOscillator();
  trem.frequency.value = 5.5;
  const tg = ctx.createGain();
  tg.gain.value = 0.25;
  const amp = ctx.createGain();
  amp.gain.value = 0.75;
  trem.connect(tg).connect(amp.gain);
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(f);
  o2.connect(f);
  f.connect(amp).connect(g);
  route(g, { rev: 0.6, bus: musicBus });
  o.start();
  o2.start();
  trem.start();
  return { o, o2, g };
}

function key() {
  return st.night > 0.5 ? NIGHT : DAY;
}

function setChord(i, t) {
  chordIdx = i;
  const c = key().chords[i];
  pad.voices.forEach((pair, k) => pair.forEach((o) => o.frequency.setTargetAtTime(hz(c[k] - 12), t, 0.8)));
  cello.o.frequency.setTargetAtTime(hz(c[0] - 24), t, 0.3);
  cello.o2.frequency.setTargetAtTime(hz(c[0] - 24), t, 0.3);
  // neues Motiv: 4–6 Töne aus Akkord und Skala, wird variiert wiederholt
  const pool = [...c.map((x) => x + 12), ...key().scale.map((x) => x + 12), ...key().scale.map((x) => x + 24)];
  motif = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, () => pool[Math.floor(Math.random() * pool.length)]);
}

const BEAT = 60 / 66;
function schedule() {
  const now = ctx.currentTime;
  if (beatT < now) beatT = now + 0.05;
  while (beatT < now + 0.3) {
    const t = beatT;
    const b = beat % 8; // zwei Takte pro Akkord
    if (b === 0) {
      const next = (chordIdx + 1 + (Math.random() < 0.3 ? 1 : 0)) % 4;
      setChord(beat === 0 ? 0 : next, t);
    }
    const c = key().chords[chordIdx];
    // Bass auf 1 und 3
    if (lay.bass > 0.05 && (b % 4 === 0 || b % 4 === 2)) {
      tone(hz(c[0] - 12), { t, type: 'triangle', attack: 0.02, decay: BEAT * 1.6, gain: 0.09 * lay.bass, bus: musicBus, rev: 0.15 });
    }
    // gezupfte Motive auf Achteln
    for (const off of [0, 0.5]) {
      if (lay.melody < 0.05) break;
      const step = (beat * 2 + off * 2) % 16;
      const note = motif[step % motif.length];
      const p = (off === 0 ? 0.55 : 0.3) * lay.melody;
      if (Math.random() < p) {
        const varied = Math.random() < 0.2 ? note + key().scale[Math.floor(Math.random() * 5)] - key().scale[2] : note;
        pluck(hz(varied), { t: t + off * BEAT + (Math.random() - 0.5) * 0.015, gain: 0.07 + lay.melody * 0.05, pan: (Math.random() - 0.5) * 0.9 });
      }
    }
    // Glocken: selten, nachts häufiger
    if (lay.bells > 0.05 && Math.random() < 0.12 * lay.bells) bell(hz(c[1 + Math.floor(Math.random() * 3)] + 24), { t: t + BEAT * 0.5, gain: 0.035 * lay.bells, pan: (Math.random() - 0.5) * 1.4, bus: musicBus });
    // Trommeln bei Gefahr und Aktion
    if (lay.drums > 0.05) {
      const d = lay.drums;
      if (b % 4 === 0) drum('tom', { t, gain: 0.22 * d });
      if (b % 4 === 2 && d > 0.4) drum('frame', { t, gain: 0.16 * d });
      if (d > 0.6) drum('tom', { t: t + BEAT * 0.75, gain: 0.12 * d });
      drum('shaker', { t: t + BEAT * 0.5, gain: 0.05 * d });
    }
    beat++;
    beatT += BEAT;
  }
}

// --- Öffentliche Schnittstelle ----------------------------------------------------------------
const P = (x, y, z) => (x == null ? null : [x, y ?? 0, z]);

export const audio = {
  get ready() {
    return !!ctx;
  },
  unlock() {
    if (ctx) {
      ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.1;
    master.connect(comp).connect(lim).connect(ctx.destination);
    duck = ctx.createGain();
    duck.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 1.15;
    musicBus.connect(duck);
    ambBus = ctx.createGain();
    ambBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    // Hall
    revSend = ctx.createGain();
    const ir = makeIR();
    const rv = ctx.createGain();
    rv.gain.value = 0.55;
    revSend.connect(ir).connect(rv).connect(master);
    // Ping-Pong-Echo
    dlySend = ctx.createGain();
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = BEAT * 0.75;
    dr.delayTime.value = BEAT * 0.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const pl = ctx.createStereoPanner();
    pl.pan.value = -0.8;
    const pr = ctx.createStereoPanner();
    pr.pan.value = 0.8;
    dlySend.connect(dl);
    dl.connect(pl).connect(master);
    dl.connect(dr);
    dr.connect(pr).connect(master);
    dr.connect(lp).connect(fb).connect(dl);
    noiseBuf = makeNoise();

    wind = { low: noiseLoop('bandpass', 260, 0.7, ambBus), high: noiseLoop('bandpass', 1400, 4, ambBus) };
    rustle = noiseLoop('highpass', 3800, 0.5, ambBus);
    shimmer = noiseLoop('highpass', 7000, 0.6, sfxBus);
    water = noiseLoop('lowpass', 500, 0.8, ambBus);
    whoosh = noiseLoop('bandpass', 600, 1.2, sfxBus);
    rotDrone = { g: ctx.createGain(), f: ctx.createBiquadFilter() };
    rotDrone.f.type = 'lowpass';
    rotDrone.f.frequency.value = 200;
    rotDrone.g.gain.value = 0;
    for (const fr of [49, 49.6, 73.4, 36.7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(rotDrone.f);
      o.start();
    }
    rotDrone.f.connect(rotDrone.g).connect(ambBus);
    makeCrickets();
    pad = makePad();
    cello = makeCello();
    setChord(0, ctx.currentTime);
  },
  setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  },
  get volume() {
    return volume;
  },
  // Hörer = Kamera
  setListener(camera) {
    if (!ctx) return;
    const l = ctx.listener;
    const p = camera.position;
    const f = camera.getWorldDirection(camera.userData.__dir ??= camera.position.clone());
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.05);
      l.positionY.setTargetAtTime(p.y, t, 0.05);
      l.positionZ.setTargetAtTime(p.z, t, 0.05);
      l.forwardX.setTargetAtTime(f.x, t, 0.05);
      l.forwardY.setTargetAtTime(f.y, t, 0.05);
      l.forwardZ.setTargetAtTime(f.z, t, 0.05);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  },
  // jedes Bild: Zustand → Musikschichten und Ambience
  update(s) {
    if (!ctx) return;
    Object.assign(st, s);
    const t = ctx.currentTime;
    const dt = 1 / 60;
    const ease = (k, target, rate) => (lay[k] += (target - lay[k]) * Math.min(1, dt * rate));
    const day = 1 - st.night;
    ease('pad', 0.6 + st.life * 0.4, 0.5);
    ease('melody', st.play ? Math.min(1, 0.15 + st.life * 0.6 + st.activity * 0.4) * (1 - st.danger * 0.5) : 0.5, 0.4);
    ease('bass', st.play ? st.life * day * 0.9 + st.danger * 0.4 : 0.3, 0.4);
    ease('bells', 0.2 + st.night * 0.8, 0.3);
    ease('drums', st.play ? Math.min(1, st.danger * 1.1 + st.rot * 0.4) : 0, 0.6);
    ease('cello', st.night * (0.4 + st.rot * 0.6 + st.danger * 0.4), 0.3);
    pad.g.gain.setTargetAtTime(0.06 * lay.pad, t, 0.5);
    pad.filter.frequency.setTargetAtTime(300 + st.life * 1400 + st.activity * 400 - st.night * 150, t, 0.8);
    cello.g.gain.setTargetAtTime(0.05 * lay.cello, t, 0.6);
    schedule();

    // Wind mit Böen
    gustT -= dt;
    if (gustT <= 0) {
      gustT = 2 + Math.random() * 5;
      gustTarget = Math.random();
    }
    gust += (gustTarget - gust) * dt * 0.6;
    const deadWind = 1 - st.life;
    wind.low.g.gain.setTargetAtTime((0.05 + deadWind * 0.1) * (0.5 + gust), t, 0.4);
    wind.low.f.frequency.setTargetAtTime(220 + gust * 160, t, 0.5);
    wind.high.g.gain.setTargetAtTime(deadWind * gust * gust * 0.025, t, 0.5);
    wind.high.f.frequency.setTargetAtTime(900 + gust * 900, t, 0.5);
    rustle.g.gain.setTargetAtTime(st.life * day * gust * 0.03, t, 0.3);
    water.g.gain.setTargetAtTime(st.water * (0.04 + 0.03 * Math.sin(t * 0.9) * Math.sin(t * 1.7)), t, 0.2);
    shimmer.g.gain.setTargetAtTime(st.weave * 0.035, t, 0.08);
    whoosh.g.gain.setTargetAtTime(Math.min(1, st.speed / 15) ** 2 * 0.06, t, 0.1);
    whoosh.f.frequency.setTargetAtTime(400 + st.speed * 60, t, 0.1);
    rotDrone.g.gain.setTargetAtTime(st.rot * 0.06 + nest.level * 0.025, t, 0.4);
    rotDrone.f.frequency.setTargetAtTime(140 + st.rot * 260 + Math.sin(t * 0.6) * 40, t, 0.3);

    // Weben: funkelnde Körner aus der Tonleiter
    if (st.weave > 0.1 && t > nextGrain) {
      nextGrain = t + 0.05 + Math.random() * 0.12;
      const c = key().chords[chordIdx];
      bell(hz(c[Math.floor(Math.random() * 4)] + 36), { gain: 0.012, decay: 0.6, index: 1, ratio: 2.01, pan: (Math.random() - 0.5) * 1.2, rev: 0.4 });
    }
    // Brodeln in der Fäulnis
    if (st.rot > 0.3 && t > nextBubble) {
      nextBubble = t + 0.15 + Math.random() * 0.5 / st.rot;
      tone(80 + Math.random() * 120, { attack: 0.005, decay: 0.12, gain: 0.05 * st.rot, slide: 2.2, pan: (Math.random() - 0.5) * 1.4, rev: 0.2, bus: ambBus });
    }
    // Herzschlag des nächsten Moderherzens
    if (nest.level > 0.02 && t > nest.next) {
      nest.next = t + 1 / (0.9 + st.night * 0.6);
      const pos = [nest.x, nest.y, nest.z];
      tone(54, { decay: 0.28, gain: 0.5 * nest.level + 0.15, slide: 0.6, pos, rev: 0.15, bus: ambBus });
      tone(47, { t: t + 0.17, decay: 0.32, gain: 0.35 * nest.level + 0.1, slide: 0.6, pos, rev: 0.15, bus: ambBus });
    }
    // Grillen
    for (const c of crickets) {
      c.level.gain.setTargetAtTime(st.night * st.life * 0.012, t, 0.8);
      if (t > c.next) {
        c.next = t + 1 / c.rate;
        for (let k = 0; k < 3; k++) {
          const tt = t + k * 0.045;
          c.am.gain.setValueAtTime(0, tt);
          c.am.gain.linearRampToValueAtTime(1, tt + 0.008);
          c.am.gain.linearRampToValueAtTime(0, tt + 0.03);
        }
      }
    }
    // Vögel am Tag, Eule und Frösche in der Nacht
    if (t > nextBird) {
      nextBird = t + 1.5 + Math.random() * 4;
      if (Math.random() < st.life * day) {
        const r = Math.random();
        if (r < 0.45) blackbird();
        else if (r < 0.8) tit();
        else if (r < 0.9) woodpecker();
        else cuckoo();
      }
    }
    if (t > nextNight) {
      nextNight = t + 3 + Math.random() * 8;
      if (st.night > 0.5) {
        if (Math.random() < 0.35) owl();
        if (st.water > 0.2 && Math.random() < 0.8) frog();
      }
    }
  },
  duck(amount = 0.4, secs = 2) {
    if (!ctx) return;
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(1 - amount, t, 0.05);
    duck.gain.setTargetAtTime(1, t + secs, 0.8);
  },

  // --- Effekte --------------------------------------------------------------------------------
  pulse(pan = 0, hue = 0) {
    if (!ctx) return;
    const c = key().chords[chordIdx];
    const base = hz(c[hue < 0.5 ? 0 : 2] + 12);
    bell(base, { gain: 0.1, decay: 2.2, index: 1.6, pan, rev: 0.5 });
    bell(base * 1.5, { gain: 0.05, decay: 1.6, index: 1.2, pan, rev: 0.5 });
    noise({ type: 'bandpass', freq: 500, q: 0.8, attack: 0.02, decay: 0.7, gain: 0.12, sweep: 5, pan, rev: 0.3 });
    tone(55, { decay: 0.4, gain: 0.18, slide: 0.6, pan, rev: 0 });
  },
  puff(pan = 0) {
    if (!ctx) return;
    noise({ type: 'lowpass', freq: 2200, q: 1, decay: 0.22, gain: 0.3, sweep: 0.25, pan });
    tone(240, { decay: 0.2, gain: 0.12, slide: 0.5, pan, rev: 0.1 });
    const c = key().chords[chordIdx];
    for (let k = 0; k < 3; k++) pluck(hz(c[(k + 1) % 4] + 24), { t: ctx.currentTime + 0.05 + k * 0.06, gain: 0.06, pan });
  },
  crackle(pan = 0) {
    if (!ctx) return;
    noise({ type: 'highpass', freq: 2500 + Math.random() * 3500, q: 1, decay: 0.03 + Math.random() * 0.05, gain: 0.1, pan, rev: 0.1 });
    if (Math.random() < 0.3) noise({ type: 'bandpass', freq: 300, q: 2, decay: 0.06, gain: 0.08, pan, rev: 0.1 });
  },
  decomposed(pan = 0) {
    if (!ctx) return;
    tone(55, { decay: 1.2, gain: 0.35, slide: 0.6, pan, rev: 0.3 });
    noise({ type: 'lowpass', freq: 900, q: 0.7, decay: 1, gain: 0.25, sweep: 0.2, pan });
    const c = key().chords[chordIdx];
    c.forEach((s, i) => pluck(hz(s + 12), { t: ctx.currentTime + i * 0.07, gain: 0.08, pan }));
  },
  join(i) {
    if (!ctx) return;
    const notes = i === 0 ? [12, 16, 19, 24] : [19, 24, 28, 31];
    notes.forEach((s, k) => bell(hz(s), { t: ctx.currentTime + k * 0.09, gain: 0.07, decay: 1.8, pan: i === 0 ? -0.4 : 0.4 }));
  },
  ui() {
    if (!ctx) return;
    pluck(hz(24), { gain: 0.06, rev: 0.15, dly: 0 });
  },
  ping(pan) {
    if (!ctx) return;
    bell(hz(28), { gain: 0.08, decay: 1.4, pan });
    bell(hz(35), { t: ctx.currentTime + 0.14, gain: 0.06, decay: 1.4, pan });
  },
  ritual(progress) {
    if (!ctx) return;
    if (Math.random() < 0.2) bell(hz(12 + Math.floor(progress * 5) * 2.4), { gain: 0.03 + progress * 0.04, decay: 1.2, index: 1 });
  },
  awaken() {
    if (!ctx) return;
    this.duck(0.7, 5);
    const t = ctx.currentTime;
    tone(36.7, { attack: 0.4, decay: 6, gain: 0.45, rev: 0.5 });
    noise({ type: 'lowpass', freq: 300, q: 0.5, attack: 0.3, decay: 4, gain: 0.35, sweep: 8 });
    [0, 7, 12, 16, 19, 24].forEach((s, i) => choir(hz(s), { t: t + i * 0.15, dur: 5, gain: 0.04, vowel: i % 2 ? 'a' : 'o', pan: (i / 5 - 0.5) * 1.2 }));
    [24, 28, 31, 36, 40, 43].forEach((s, i) => bell(hz(s), { t: t + 0.5 + i * 0.12, gain: 0.06, decay: 3, pan: i % 2 ? 0.5 : -0.5, bus: musicBus }));
  },
  denied() {
    if (!ctx) return;
    tone(hz(-5), { decay: 0.2, gain: 0.07, rev: 0.15, type: 'triangle', slide: 0.9 });
  },
  nest(level, x, y, z) {
    nest.level = level;
    if (x != null) Object.assign(nest, { x, y, z });
  },
  purifying(p) {
    if (!ctx) return;
    if (Math.random() < 0.16) bell(hz(12 + Math.floor(p * 8) * 2), { gain: 0.04 + p * 0.05, decay: 0.8, index: 0.8 });
    if (Math.random() < 0.3) noise({ type: 'bandpass', freq: 3000 + p * 3000, q: 4, decay: 0.08, gain: 0.05 });
  },
  purified() {
    if (!ctx) return;
    this.duck(0.6, 3);
    const t = ctx.currentTime;
    noise({ type: 'lowpass', freq: 300, q: 0.5, decay: 2.5, gain: 0.45, sweep: 8 });
    tone(41, { attack: 0.05, decay: 3, gain: 0.35, slide: 0.5 });
    [0, 7, 12, 16, 19, 24, 28].forEach((s, i) => bell(hz(s + 12), { t: t + 0.3 + i * 0.07, gain: 0.06, decay: 2.5, pan: i % 2 ? 0.4 : -0.4 }));
    choir(hz(12), { t: t + 0.2, dur: 3, gain: 0.04 });
  },
  horn(night) {
    if (!ctx) return;
    this.duck(0.5, 3);
    const t = ctx.currentTime;
    const notes = night ? [[-12, 1.2], [-9, 0.6], [-14, 1.8]] : [[-12, 1.0], [-5, 1.6]];
    let tt = t;
    for (const [s, d] of notes) {
      brass(hz(s), { t: tt, dur: d, gain: 0.11, rev: 0.7 });
      brass(hz(s - 12), { t: tt, dur: d, gain: 0.06, rev: 0.7 });
      tt += d + 0.15;
    }
  },
  dawn() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 4, 7, 12, 16, 19].forEach((s, i) => bell(hz(s + 12), { t: t + i * 0.18, gain: 0.06, decay: 3, index: 1 }));
    choir(hz(12), { t, dur: 3, gain: 0.035 });
    setTimeout(blackbird, 500);
    setTimeout(tit, 1400);
  },
  rank() {
    if (!ctx) return;
    this.duck(0.5, 2.5);
    const t = ctx.currentTime;
    [[0, 0.22], [4, 0.22], [7, 0.22], [12, 1.4]].forEach(([s, d], i) => {
      brass(hz(s + 12), { t: t + i * 0.2, dur: d, gain: 0.08 });
      brass(hz(s), { t: t + i * 0.2, dur: d, gain: 0.05 });
    });
    bell(hz(36), { t: t + 0.8, gain: 0.06, decay: 3 });
    drum('tom', { t: t + 0.6, gain: 0.25 });
  },
  objective() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [12, 16, 19, 24].forEach((s, i) => bell(hz(s + 12), { t: t + i * 0.08, gain: 0.07, decay: 1.6, index: 1.2 }));
  },
  flow(mult) {
    if (!ctx) return;
    pluck(hz(12 + key().scale[Math.min(4, mult - 1)] + 12), { gain: 0.1 });
  },

  // --- Begegnungen (mit Position) ------------------------------------------------------------
  wispCall(x, y, z) {
    if (!ctx) return;
    const pos = P(x, y, z);
    const t = ctx.currentTime;
    [24, 28, 31].forEach((s, i) => bell(hz(s + 12), { t: t + i * 0.22, gain: 0.05, decay: 1.4, index: 0.8, pos }));
  },
  wispFreed(x, y, z) {
    if (!ctx) return;
    const pos = P(x, y, z);
    noise({ type: 'highpass', freq: 3000, decay: 0.6, gain: 0.08, sweep: 2, pos });
    [12, 19, 24, 28].forEach((s, i) => bell(hz(s + 12), { t: ctx.currentTime + i * 0.07, gain: 0.07, decay: 1.6, pos }));
  },
  wispJoin(x, y, z, hue = 0) {
    if (!ctx) return;
    const s = [24, 26, 28, 31, 33][Math.floor(hue * 5) % 5];
    bell(hz(s + 12), { gain: 0.08, decay: 1.6, index: 0.9, pos: P(x, y, z) });
    bell(hz(s + 19), { t: ctx.currentTime + 0.1, gain: 0.05, decay: 1.4, index: 0.9, pos: P(x, y, z) });
  },
  wispLost(x, y, z) {
    if (!ctx) return;
    [31, 27, 24].forEach((s, i) => bell(hz(s), { t: ctx.currentTime + i * 0.15, gain: 0.06, decay: 1, index: 3, ratio: 1.41, pos: P(x, y, z) }));
  },
  wispHome(x, y, z) {
    if (!ctx) return;
    const t = ctx.currentTime;
    choir(hz(19), { t, dur: 2.2, gain: 0.04, pos: P(x, y, z) });
    [12, 16, 19, 24, 28].forEach((s, i) => bell(hz(s + 12), { t: t + i * 0.1, gain: 0.06, decay: 2.4, pos: P(x, y, z) }));
  },
  moderSpawn(x, y, z) {
    if (!ctx) return;
    const pos = P(x, y, z);
    for (let k = 0; k < 6; k++) noise({ t: ctx.currentTime + k * 0.05, type: 'bandpass', freq: 1800 + Math.random() * 1500, q: 8, decay: 0.04, gain: 0.08, pos, rev: 0.3 });
    tone(70, { decay: 0.5, gain: 0.2, slide: 0.6, pos });
  },
  moderEat(x, y, z) {
    if (!ctx) return;
    noise({ type: 'bandpass', freq: 400 + Math.random() * 300, q: 3, decay: 0.08, gain: 0.08, pos: P(x, y, z), rev: 0.1 });
  },
  moderBite(x, y, z) {
    if (!ctx) return;
    noise({ type: 'bandpass', freq: 900, q: 2, decay: 0.12, gain: 0.25, pos: P(x, y, z) });
    tone(110, { decay: 0.2, gain: 0.2, slide: 0.5, type: 'square', pos: P(x, y, z), rev: 0.1 });
  },
  moderDie(x, y, z) {
    if (!ctx) return;
    const pos = P(x, y, z);
    noise({ type: 'lowpass', freq: 1200, decay: 0.35, gain: 0.3, sweep: 0.2, pos });
    tone(180, { decay: 0.3, gain: 0.18, slide: 0.3, type: 'triangle', pos });
    bell(hz(31), { t: ctx.currentTime + 0.12, gain: 0.05, decay: 1.2, pos });
  },
  starFall(x, y, z) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = osc('sine', 2400, t, 3);
    o.frequency.exponentialRampToValueAtTime(500, t + 3);
    const g = envGain(t, 0.4, 2.6, 0.12);
    o.connect(g);
    route(g, { pan: 0, rev: 0.6 });
    noise({ t, type: 'bandpass', freq: 4000, q: 2, attack: 1, decay: 2, gain: 0.1, sweep: 0.3, pos: P(x, y + 8, z) });
  },
  starLand(x, y, z) {
    if (!ctx) return;
    const pos = P(x, y, z);
    tone(48, { decay: 1, gain: 0.4, slide: 0.6, pos });
    noise({ type: 'lowpass', freq: 1500, decay: 0.8, gain: 0.3, sweep: 0.2, pos });
    [24, 31, 36].forEach((s, i) => bell(hz(s + 12), { t: ctx.currentTime + 0.05 + i * 0.05, gain: 0.07, decay: 2.5, pos }));
  },
  starCatch() {
    if (!ctx) return;
    this.duck(0.5, 2);
    const t = ctx.currentTime;
    for (let k = 0; k < 10; k++) bell(hz(12 + k * 3), { t: t + k * 0.04, gain: 0.05, decay: 1.2, index: 1 });
    choir(hz(24), { t, dur: 1.6, gain: 0.04 });
  },
  // Messhilfe für automatische Tests: RMS-Pegel am Master
  _level() {
    if (!ctx) return -1;
    if (!this._an) {
      this._an = ctx.createAnalyser();
      this._an.fftSize = 2048;
      master.connect(this._an);
    }
    const d = new Float32Array(this._an.fftSize);
    this._an.getFloatTimeDomainData(d);
    let s = 0;
    for (const v of d) s += v * v;
    return Math.sqrt(s / d.length);
  },
  starLost(x, y, z) {
    if (!ctx) return;
    noise({ type: 'highpass', freq: 2500, decay: 1.2, gain: 0.08, sweep: 0.3, pos: P(x, y, z) });
  },
};
