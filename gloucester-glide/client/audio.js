// Prozeduraler Ton: Rollgeräusch, Wind, Aufprall, Publikum, Startruf
let ctx = null;
let master;
let roll;
let wind;
let crowd;
let noiseBuf;

function noiseBuffer(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    // leicht gefärbtes Rauschen
    last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
    d[i] = last;
  }
  return b;
}

function loop(filterType, freq, q = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start();
  return { f, g };
}

export const audio = {
  enabled: true,
  unlock() {
    if (ctx) return ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = noiseBuffer();
    roll = loop('lowpass', 200, 0.7);
    wind = loop('highpass', 1200, 0.5);
    crowd = loop('bandpass', 900, 0.6);
  },
  update({ speed = 0, grounded = false, crowdLevel = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = Math.min(1, speed / 28);
    roll.g.gain.setTargetAtTime(grounded ? 0.15 + s * 0.65 : 0.02, t, 0.05);
    roll.f.frequency.setTargetAtTime(90 + s * 380, t, 0.1);
    wind.g.gain.setTargetAtTime(s * s * 0.22, t, 0.2);
    wind.f.frequency.setTargetAtTime(800 + s * 1800, t, 0.2);
    crowd.g.gain.setTargetAtTime(0.03 + crowdLevel * 0.25, t, 0.4);
    crowd.f.frequency.setTargetAtTime(700 + crowdLevel * 500 + Math.sin(t * 3.1) * 120, t, 0.2);
  },
  silence() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const n of [roll, wind]) n.g.gain.setTargetAtTime(0, t, 0.1);
  },
  impact(strength) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.min(1, strength / 12);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 + v * 60, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * v + 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.4 * v, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(f).connect(ng).connect(master);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  },
  // Bruch: trockenes Knacken, bei schwerem Schaden mehrere Risse
  crack(amount) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = 1 + Math.min(4, Math.floor(amount * 20));
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.025 + Math.random() * 0.03);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800 + Math.random() * 1600;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.25 + Math.min(0.4, amount * 2), s + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.06);
      src.connect(f).connect(g).connect(master);
      src.start(s, Math.random());
      src.stop(s + 0.08);
    }
  },
  whoosh() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2000, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(f).connect(g).connect(master);
    n.start(t, Math.random());
    n.stop(t + 0.4);
  },
  beep(high = false) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = high ? 880 : 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.6 : 0.25));
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.7);
  },
  // Jubel: kurzer Anstieg des Publikumsrauschens plus ein paar Pfiffe
  cheer(amount = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    crowd.g.gain.cancelScheduledValues(t);
    crowd.g.gain.setValueAtTime(crowd.g.gain.value, t);
    crowd.g.gain.linearRampToValueAtTime(0.35 * amount + 0.1, t + 0.3);
    crowd.g.gain.setTargetAtTime(0.05, t + 1.5, 0.8);
    for (let i = 0; i < 4 * amount; i++) {
      const o = ctx.createOscillator();
      const s = t + 0.1 + Math.random() * 1.2;
      const f0 = 1400 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, s);
      o.frequency.linearRampToValueAtTime(f0 * 1.3, s + 0.12);
      o.frequency.linearRampToValueAtTime(f0, s + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.35);
    }
  },
};
