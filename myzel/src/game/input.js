// Eingabe: bis zu zwei Gamepads (Standard-Belegung) und zwei Tastatur-Hälften als Ersatz.
//
// Gamepad                     Tastatur Spieler 1     Tastatur Spieler 2
//  Linker Stick  bewegen       WASD                   Pfeiltasten
//  Ⓐ             Sporenpuls    Leertaste              Enter / Num0
//  RT (halten)   Weben         Shift links            Shift rechts / Num1
//  Ⓧ (halten)    Zersetzen     E                      Ü / # / Num2  (bzw. ' oder /)
//  LT / Ⓑ        Gleiten       Q                      . / Num3
//  Ⓨ             Rufen         R                      , / Num4
//  Rechter Stick Kamera drehen –                      –
//  Start         Pause         Esc                    Backspace

const KB = {
  kb1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    pulse: ['Space'], weave: ['ShiftLeft'], decompose: ['KeyE'], boost: ['KeyQ'], ping: ['KeyR'], start: ['Escape'],
    camL: ['KeyZ', 'KeyY'], camR: ['KeyC'],
  },
  kb2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    pulse: ['Enter', 'NumpadEnter', 'Numpad0'], weave: ['ShiftRight', 'Numpad1'],
    decompose: ['BracketLeft', 'Backslash', 'Quote', 'Slash', 'Numpad2'], boost: ['Period', 'Numpad3'], ping: ['Comma', 'Numpad4'],
    start: ['Backspace'], camL: ['Numpad7'], camR: ['Numpad9'],
  },
};

const DEAD = 0.18;
function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0];
  const s = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return [x * s, y * s];
}

export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // in diesem Frame neu gedrückt
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const prevPad = new Map(); // index → buttons pressed array
  let pads = [];

  const any = (list) => list.some((k) => keys.has(k));
  const anyPressed = (list) => list.some((k) => pressed.has(k));

  function poll() {
    pads = [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected !== false);
  }

  function padState(index) {
    const p = pads.find((q) => q.index === index);
    if (!p) return null;
    const prev = prevPad.get(index) || [];
    const b = (i) => !!p.buttons[i]?.pressed;
    const v = (i) => p.buttons[i]?.value ?? 0;
    const edge = (i) => b(i) && !prev[i];
    let [mx, my] = stick(p.axes[0] ?? 0, p.axes[1] ?? 0);
    mx += (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    my += (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    const [rx] = stick(p.axes[2] ?? 0, p.axes[3] ?? 0);
    return {
      mx, my, rx,
      pulse: b(0), pulseDown: edge(0),
      weave: Math.max(v(7), b(5) ? 1 : 0),
      decompose: b(2),
      boost: Math.max(v(6), b(1) ? 1 : 0, b(4) ? 1 : 0),
      pingDown: edge(3),
      startDown: edge(9),
      backDown: edge(8),
      confirmDown: edge(0),
      cancelDown: edge(1),
      navX: (edge(15) ? 1 : 0) - (edge(14) ? 1 : 0),
      navY: (edge(13) ? 1 : 0) - (edge(12) ? 1 : 0),
      pad: p,
    };
  }

  function kbState(id) {
    const s = KB[id];
    let mx = (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0);
    let my = (any(s.down) ? 1 : 0) - (any(s.up) ? 1 : 0);
    const m = Math.hypot(mx, my);
    if (m > 1) (mx /= m), (my /= m);
    return {
      mx, my,
      rx: (any(s.camR) ? 1 : 0) - (any(s.camL) ? 1 : 0),
      pulse: any(s.pulse), pulseDown: anyPressed(s.pulse),
      weave: any(s.weave) ? 1 : 0,
      decompose: any(s.decompose),
      boost: any(s.boost) ? 1 : 0,
      pingDown: anyPressed(s.ping),
      startDown: anyPressed(s.start),
      backDown: anyPressed(['Tab']) && id === 'kb1',
      confirmDown: anyPressed(s.pulse),
      cancelDown: false,
      navX: (anyPressed(s.right) ? 1 : 0) - (anyPressed(s.left) ? 1 : 0),
      navY: (anyPressed(s.down) ? 1 : 0) - (anyPressed(s.up) ? 1 : 0),
      pad: null,
    };
  }

  // Bindung: { type: 'pad', index } | { type: 'kb', id: 'kb1'|'kb2' }
  function read(binding) {
    if (!binding) return null;
    if (binding.type === 'pad') return padState(binding.index) ?? idle();
    return kbState(binding.id);
  }

  const idle = () => ({ mx: 0, my: 0, rx: 0, pulse: false, pulseDown: false, weave: 0, decompose: false, boost: 0, pingDown: false, startDown: false, backDown: false, confirmDown: false, cancelDown: false, navX: 0, navY: 0, pad: null });

  // Wer möchte beitreten? Gibt neue Bindungen zurück, die gerade Ⓐ / Leertaste / Enter drücken.
  function joinRequests(taken) {
    const out = [];
    const isTaken = (b) => taken.some((t) => t && t.type === b.type && (t.index ?? t.id) === (b.index ?? b.id));
    for (const p of pads) {
      const b = { type: 'pad', index: p.index };
      const prev = prevPad.get(p.index) || [];
      if ((p.buttons[0]?.pressed && !prev[0]) || (p.buttons[9]?.pressed && !prev[9])) if (!isTaken(b)) out.push(b);
    }
    for (const id of ['kb1', 'kb2']) {
      const b = { type: 'kb', id };
      if (anyPressed(KB[id].pulse) && !isTaken(b)) out.push(b);
    }
    return out;
  }

  // Irgendeine Eingabe für Menüs (alle Quellen zusammen)
  function menu() {
    const states = [...pads.map((p) => padState(p.index)), kbState('kb1'), kbState('kb2')].filter(Boolean);
    const r = { navX: 0, navY: 0, confirm: false, cancel: false, start: false, back: false };
    for (const s of states) {
      r.navX += s.navX;
      r.navY += s.navY;
      r.confirm ||= s.confirmDown;
      r.cancel ||= s.cancelDown;
      r.start ||= s.startDown;
      r.back ||= s.backDown;
    }
    // Analogsticks im Menü: Flanken
    for (const p of pads) {
      const prev = prevPad.get(p.index);
      const y = p.axes[1] ?? 0;
      const py = prev?.axisY ?? 0;
      if (y > 0.6 && py <= 0.6) r.navY += 1;
      if (y < -0.6 && py >= -0.6) r.navY -= 1;
      const x = p.axes[0] ?? 0;
      const px = prev?.axisX ?? 0;
      if (x > 0.6 && px <= 0.6) r.navX += 1;
      if (x < -0.6 && px >= -0.6) r.navX -= 1;
    }
    if (pressed.has('ArrowDown') || pressed.has('KeyS')) r.navY = Math.max(r.navY, 1);
    if (pressed.has('Enter') || pressed.has('Space')) r.confirm = true;
    if (pressed.has('Escape')) r.start = true;
    return r;
  }

  // Am Ende jedes Frames aufrufen
  function endFrame() {
    pressed.clear();
    for (const p of pads) {
      const arr = p.buttons.map((b) => b.pressed);
      arr.axisX = p.axes[0] ?? 0;
      arr.axisY = p.axes[1] ?? 0;
      prevPad.set(p.index, arr);
    }
  }

  function rumble(binding, strong, weak, ms) {
    if (!binding || binding.type !== 'pad') return;
    const p = pads.find((q) => q.index === binding.index);
    try {
      p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    } catch {
      /* nicht unterstützt */
    }
  }

  return {
    poll,
    read,
    endFrame,
    joinRequests,
    menu,
    rumble,
    get padCount() {
      return pads.length;
    },
    padName(index) {
      return pads.find((p) => p.index === index)?.id ?? '';
    },
  };
}
