// Eingabe: zwei Spieler mit Gamepad (Standard-Belegung) und Tastatur, dazu Menünavigation
//
// Gamepad: A / RT = Gas, B / LT = Bremse & rückwärts, RB / LB = Hüpfen & Driften, X = Gegenstand
//          (Stick nach unten + X = nach hinten werfen), Y = Rückspiegel, Start = Pause
// Tastatur Spieler 1: W A S D, Drift Shift links, Gegenstand Leertaste, Rückspiegel Q
// Tastatur Spieler 2: Pfeiltasten, Drift Shift rechts / Strg rechts, Gegenstand Enter / Numpad 0, Rückspiegel Ende

const KEYS = {
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drift: ['ShiftLeft', 'KeyK'], item: ['Space', 'KeyJ', 'KeyE'], look: ['KeyQ'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drift: ['ShiftRight', 'ControlRight', 'Numpad1'], item: ['Enter', 'NumpadEnter', 'Numpad0'], look: ['End', 'Numpad2'] },
};
const merged = Object.fromEntries(Object.keys(KEYS.p1).map((k) => [k, [...KEYS.p1[k], ...KEYS.p2[k]]]));

const DEAD = 0.18;

export function createInput() {
  const keys = new Set();
  const pressedOnce = new Set(); // für Menüs: Tastendrücke seit dem letzten Abholen
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressedOnce.add(e.code);
    else pressedOnce.add('repeat:' + e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  let padOrder = []; // Gamepad-Indizes in Verbindungsreihenfolge
  window.addEventListener('gamepadconnected', (e) => {
    if (!padOrder.includes(e.gamepad.index)) padOrder.push(e.gamepad.index);
    onPadChange?.();
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    padOrder = padOrder.filter((i) => i !== e.gamepad.index);
    onPadChange?.();
  });
  let onPadChange = null;

  function pads() {
    const list = navigator.getGamepads?.() ?? [];
    // auch Pads, die vor dem Laden schon verbunden waren
    for (const p of list) if (p && !padOrder.includes(p.index)) padOrder.push(p.index);
    return padOrder.map((i) => list[i]).filter(Boolean);
  }

  const prevPadButtons = new Map();
  const prevPadNav = new Map();

  // Steuerung im Rennen für Spieler i (0/1); players = Anzahl menschlicher Spieler
  function raceInput(i, players) {
    const set = players === 1 ? merged : i === 0 ? KEYS.p1 : KEYS.p2;
    const has = (list) => list.some((k) => keys.has(k));
    let steer = (has(set.right) ? 1 : 0) - (has(set.left) ? 1 : 0);
    let throttle = has(set.up) ? 1 : 0;
    let brake = has(set.down) ? 1 : 0;
    let drift = has(set.drift);
    let item = has(set.item);
    let look = has(set.look);
    let back = has(set.down);
    const p = pads()[i] ?? (players === 1 ? pads()[0] : null);
    if (p) {
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (Math.abs(ax) > DEAD) steer += Math.sign(ax) * ((Math.abs(ax) - DEAD) / (1 - DEAD)) ** 1.3;
      if (p.buttons[14]?.pressed) steer -= 1;
      if (p.buttons[15]?.pressed) steer += 1;
      const rt = p.buttons[7]?.value ?? 0;
      const lt = p.buttons[6]?.value ?? 0;
      throttle = Math.max(throttle, p.buttons[0]?.pressed ? 1 : 0, rt > 0.1 ? rt : 0);
      brake = Math.max(brake, p.buttons[1]?.pressed ? 1 : 0, lt > 0.1 ? lt : 0);
      drift = drift || !!p.buttons[5]?.pressed || !!p.buttons[4]?.pressed;
      item = item || !!p.buttons[2]?.pressed;
      look = look || !!p.buttons[3]?.pressed;
      back = back || ay > 0.6;
    }
    return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake, drift, item, back, look };
  }

  // Menüereignisse je Spieler: up/down/left/right/ok/back/start, mit Wiederholung beim Halten
  const navHold = new Map();
  function menuEvents(players = 2) {
    const out = [];
    const take = (code) => {
      const hit = pressedOnce.has(code) || pressedOnce.has('repeat:' + code);
      return hit;
    };
    const kb = [
      { p: 0, up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], ok: ['Space', 'KeyE', 'KeyJ'], back: ['KeyQ'] },
      { p: 1, up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], ok: ['Enter', 'NumpadEnter'], back: ['Backspace', 'Escape'] },
    ];
    for (const m of kb) {
      const player = players === 1 ? 0 : m.p;
      for (const a of ['up', 'down', 'left', 'right', 'ok', 'back']) if (m[a].some(take)) out.push({ player, action: a, source: 'key' });
    }
    if (pressedOnce.has('Escape')) out.push({ player: 0, action: 'start', source: 'key' });
    pressedOnce.clear();

    const now = performance.now();
    pads().forEach((p, idx) => {
      const player = players === 1 ? 0 : Math.min(idx, 1);
      const prev = prevPadButtons.get(p.index) ?? [];
      const btn = (b) => !!p.buttons[b]?.pressed;
      const edge = (b) => btn(b) && !prev[b];
      if (edge(0)) out.push({ player, action: 'ok', source: 'pad' });
      if (edge(1)) out.push({ player, action: 'back', source: 'pad' });
      if (edge(9)) out.push({ player, action: 'start', source: 'pad' });
      prevPadButtons.set(
        p.index,
        p.buttons.map((b) => b.pressed),
      );
      // Richtung aus Steuerkreuz oder Stick, mit Wiederholung
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      let dir = null;
      if (btn(12) || ay < -0.55) dir = 'up';
      else if (btn(13) || ay > 0.55) dir = 'down';
      else if (btn(14) || ax < -0.55) dir = 'left';
      else if (btn(15) || ax > 0.55) dir = 'right';
      const prevDir = prevPadNav.get(p.index);
      if (dir && dir !== prevDir) {
        out.push({ player, action: dir, source: 'pad' });
        navHold.set(p.index, now + 380);
      } else if (dir && now > (navHold.get(p.index) ?? Infinity)) {
        out.push({ player, action: dir, source: 'pad' });
        navHold.set(p.index, now + 110);
      }
      prevPadNav.set(p.index, dir);
    });
    return out;
  }

  // Rumble (wo unterstützt)
  function rumble(i, strong = 0.5, weak = 0.5, ms = 150) {
    const p = pads()[i];
    const act = p?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }

  return {
    raceInput,
    menuEvents,
    rumble,
    pads,
    padCount: () => pads().length,
    set onPadChange(fn) {
      onPadChange = fn;
    },
    anyKey() {
      return pressedOnce.size > 0;
    },
  };
}
