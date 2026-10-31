// SVG-Symbole für Gegenstände und Anzeige
const holes = (list) => list.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.85}" fill="#c98f1c"/>`).join('');

const wheel = (cx = 50, cy = 50, r = 34) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#d99a20"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="#ffd34d"/>
  ${holes([
    [cx - r * 0.35, cy - r * 0.3, r * 0.17],
    [cx + r * 0.3, cy - r * 0.1, r * 0.22],
    [cx - r * 0.1, cy + r * 0.4, r * 0.14],
    [cx + r * 0.42, cy + r * 0.42, r * 0.1],
  ])}
  <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="none" stroke="#fff6c9" stroke-width="${r * 0.06}" stroke-dasharray="${r * 0.6} ${r * 4}" opacity="0.8"/>`;

const wedge = (fill = '#ffd34d', side = '#e8a623') => `
  <path d="M14 70 L86 70 L86 42 Z" fill="${side}"/>
  <path d="M14 70 L86 42 L60 26 Z" fill="${fill}"/>
  <path d="M86 70 L86 42 L60 26 L60 54 Z" fill="${side}" opacity="0.0"/>
  ${holes([
    [46, 46, 5],
    [64, 40, 4],
    [70, 60, 6],
    [52, 63, 3.5],
  ])}`;

export const ICONS = {
  wheel: `<svg viewBox="0 0 100 100">${wheel()}</svg>`,
  triple: `<svg viewBox="0 0 100 100">${wheel(30, 62, 20)}${wheel(70, 62, 20)}${wheel(50, 30, 20)}</svg>`,
  fondue: `<svg viewBox="0 0 100 100">
    <path d="M16 46 Q50 36 84 46 L78 80 Q50 92 22 80 Z" fill="#b8321f"/>
    <path d="M16 46 Q50 36 84 46 Q50 58 16 46 Z" fill="#ffcf3a"/>
    <circle cx="40" cy="45" r="4" fill="#ffe680"/><circle cx="58" cy="47" r="3" fill="#ffe680"/>
    <path d="M62 44 L82 12" stroke="#ddd" stroke-width="4" stroke-linecap="round"/>
    <circle cx="82" cy="12" r="5" fill="#ffd34d"/>
    <path d="M30 86 L26 96 M70 86 L74 96" stroke="#555" stroke-width="5"/></svg>`,
  rocket: `<svg viewBox="0 0 100 100">
    <path d="M18 82 Q10 92 6 96 Q14 88 22 86 Z" fill="#ff9a1a"/>
    <path d="M24 76 L70 30 Q84 18 92 10 Q86 22 72 34 L28 80 Z" fill="#d23a2a"/>
    <path d="M72 34 Q84 18 92 10 Q76 16 66 28 Z" fill="#ffd34d"/>
    <path d="M30 62 L18 66 L28 76 M40 72 L36 84 L26 78" fill="#ffd34d" stroke="#ffd34d" stroke-width="3"/>
    <circle cx="20" cy="84" r="9" fill="#ffb347" opacity="0.8"/></svg>`,
  stink: `<svg viewBox="0 0 100 100">
    <g fill="#8fd14f" opacity="0.92"><circle cx="34" cy="52" r="20"/><circle cx="56" cy="40" r="22"/><circle cx="70" cy="58" r="18"/><circle cx="48" cy="64" r="18"/></g>
    <path d="M30 40 q8 -10 0 -20 M52 22 q8 -10 0 -18 M74 34 q8 -10 0 -20" stroke="#5a9a2a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="52" r="4" fill="#2a4a10"/><circle cx="60" cy="52" r="4" fill="#2a4a10"/>
    <path d="M42 64 q10 -6 20 0" stroke="#2a4a10" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  turbo: `<svg viewBox="0 0 100 100">
    <path d="M4 40 L30 40 M0 54 L28 54 M8 68 L30 68" stroke="#ff8a1a" stroke-width="6" stroke-linecap="round"/>
    <g transform="translate(8 2)">${wedge('#ffb52e', '#e07a10')}</g>
    <path d="M60 30 L50 52 L60 52 L52 74 L74 44 L62 44 L70 30 Z" fill="#fff" opacity="0.95"/></svg>`,
  shield: `<svg viewBox="0 0 100 100">
    <path d="M50 8 L86 20 Q86 64 50 92 Q14 64 14 20 Z" fill="#f4e3a6" stroke="#d9a326" stroke-width="5"/>
    <g fill="#d9b860">${Array.from({ length: 18 }, (_, i) => `<circle cx="${28 + ((i * 37) % 46)}" cy="${26 + ((i * 23) % 50)}" r="${1.6 + (i % 3)}"/>`).join('')}</g>
    <path d="M50 18 L76 27 Q76 60 50 82" fill="none" stroke="#fff" stroke-width="4" opacity="0.6"/></svg>`,
  golden: `<svg viewBox="0 0 100 100">
    <defs><radialGradient id="gg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6b0"/><stop offset="1" stop-color="#ffb800" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="52" r="46" fill="url(#gg)"/>
    <g transform="translate(0 4)">${wedge('#ffd700', '#e0a800')}</g>
    <path d="M24 22 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z M80 14 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 l6 -3 z" fill="#fff"/></svg>`,
  cheese: `<svg viewBox="0 0 100 100">${wedge()}</svg>`,
  gamepad: `<svg viewBox="0 0 100 60"><path d="M22 6 H78 Q96 6 98 34 Q100 58 84 56 Q74 54 68 42 H32 Q26 54 16 56 Q0 58 2 34 Q4 6 22 6 Z" fill="currentColor"/><circle cx="74" cy="22" r="5" fill="#000" opacity=".35"/><circle cx="84" cy="32" r="5" fill="#000" opacity=".35"/><path d="M20 28 h16 M28 20 v16" stroke="#000" stroke-width="6" opacity=".35"/></svg>`,
};

export const ITEM_ORDER = ['wheel', 'triple', 'fondue', 'rocket', 'stink', 'turbo', 'shield', 'golden'];
