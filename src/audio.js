// Kleine prozedurale Klänge via WebAudio – keine Audiodateien nötig.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('filatura.muted') === '1';
    } catch {
      /* Speicher nicht verfügbar */
    }
  }

  // AudioContext erst nach einer Nutzerinteraktion starten
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.noise = this._noiseBuffer();
    // Dauerton für das Ziehen eines Fadens
    this.stretchGain = this.ctx.createGain();
    this.stretchGain.gain.value = 0;
    this.stretchFilter = this.ctx.createBiquadFilter();
    this.stretchFilter.type = 'bandpass';
    this.stretchFilter.frequency.value = 400;
    this.stretchFilter.Q.value = 6;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(this.stretchFilter).connect(this.stretchGain).connect(this.master);
    src.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('filatura.muted', this.muted ? '1' : '0');
    } catch {
      /* egal */
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(node, t, a, peak, dur) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  _tone(freq, dur, { type = 'sine', peak = 0.3, slide = 1, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    this._env(g, t, 0.01, peak, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _burst(freq, q, dur, peak, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, peak, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Ziehgeräusch: Lautstärke und Tonhöhe folgen der Ziehgeschwindigkeit
  stretch(speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 12);
    this.stretchGain.gain.setTargetAtTime(v * 0.35, t, 0.05);
    this.stretchFilter.frequency.setTargetAtTime(250 + v * 700, t, 0.05);
  }

  attach() {
    this._tone(220, 0.12, { type: 'triangle', peak: 0.25, slide: 0.6 });
    this._burst(900, 2, 0.08, 0.2);
  }

  snap(cold) {
    if (cold) {
      this._burst(3200, 1.2, 0.07, 0.6);
      this._burst(1400, 3, 0.12, 0.3, 0.01);
    } else {
      this._tone(330, 0.18, { type: 'sine', peak: 0.35, slide: 0.35 });
      this._burst(600, 4, 0.15, 0.25);
    }
  }

  release() {
    this._tone(520, 0.12, { type: 'sine', peak: 0.25, slide: 1.6 });
  }

  win() {
    this._burst(1800, 1, 0.25, 0.25);
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.35, { type: 'triangle', peak: 0.22, delay: 0.08 + i * 0.09 }));
  }

  lose() {
    this._tone(330, 0.5, { type: 'triangle', peak: 0.25, slide: 0.5 });
    this._tone(247, 0.6, { type: 'triangle', peak: 0.2, slide: 0.5, delay: 0.15 });
  }
}
