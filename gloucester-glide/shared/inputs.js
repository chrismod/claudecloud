// Kompakte Kodierung der Eingaben eines Laufs: Lauflängen von (Lenkung, Flags), als Base64.
// Pro Abschnitt 4 Bytes: Anzahl Ticks (uint16), Lenkung (int8), Flags (uint8).

export function encodeInputs(ticks) {
  const runs = [];
  for (const t of ticks) {
    const last = runs[runs.length - 1];
    if (last && last.steer === t.steer && last.flags === t.flags && last.n < 65535) last.n++;
    else runs.push({ n: 1, steer: t.steer, flags: t.flags });
  }
  const bytes = new Uint8Array(runs.length * 4);
  const view = new DataView(bytes.buffer);
  runs.forEach((r, i) => {
    view.setUint16(i * 4, r.n, true);
    view.setInt8(i * 4 + 2, Math.max(-100, Math.min(100, Math.round(r.steer))));
    view.setUint8(i * 4 + 3, r.flags & 0xff);
  });
  return toBase64(bytes);
}

export function decodeInputs(b64, maxTicks = Infinity) {
  const bytes = fromBase64(b64);
  if (bytes.length % 4 !== 0) throw new Error('Ungültige Eingabedaten');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ticks = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const n = view.getUint16(i, true);
    const steer = view.getInt8(i + 2);
    const flags = view.getUint8(i + 3) & 3;
    if (steer < -100 || steer > 100) throw new Error('Ungültige Lenkung');
    for (let k = 0; k < n; k++) {
      ticks.push({ steer, flags });
      if (ticks.length > maxTicks) throw new Error('Lauf zu lang');
    }
  }
  return ticks;
}

function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Ghost-Frames (Float32: x,y,z,qx,qy,qz,qw je Frame) ↔ Base64
export function encodeFrames(frames) {
  return toBase64(new Uint8Array(new Float32Array(frames).buffer));
}

export function decodeFrames(b64) {
  const bytes = fromBase64(b64);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}
