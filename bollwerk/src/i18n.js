// Mehrsprachigkeit: Englisch ist Standard, Deutsch in den Einstellungen wählbar.
import en from './lang/en.js';
import de from './lang/de.js';

const LANGS = { en, de };
let lang = 'en';

export function setLang(l) {
  lang = LANGS[l] ? l : 'en';
  document.documentElement.lang = lang;
}
export function getLang() {
  return lang;
}

function lookup(dict, path) {
  let o = dict;
  for (const k of path.split('.')) {
    if (o == null) return undefined;
    o = o[k];
  }
  return o;
}

// t('ui.menu.codex') · t('reason.coins') · t('research.node.lives.desc', { v: 4 })
export function t(path, vars) {
  let s = lookup(LANGS[lang], path);
  if (s === undefined) s = lookup(en, path);
  if (s === undefined) return path;
  if (typeof s !== 'string') return s;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s;
}

// Kurzwege für Spieldaten
export const tower = (type) => t(`tower.${type}`);
export const enemy = (type) => t(`enemy.${type}`);
export const mapText = (id) => t(`map.${id}`);

// Zahlen im Sprachformat
export function num(n, d = 1) {
  if (Math.abs(n) >= 1000) return fmt(n);
  let s = n.toFixed(d);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return lang === 'de' ? s.replace('.', ',') : s;
}
export function fmt(n) {
  if (n >= 10000) {
    const s = (n / 1000).toFixed(n >= 100000 ? 0 : 1);
    return (lang === 'de' ? s.replace('.', ',') : s) + 'k';
  }
  return String(Math.floor(n));
}
export function pct(x) {
  return lang === 'de' ? `${Math.round(x * 100)} %` : `${Math.round(x * 100)}%`;
}

// Statische Texte im HTML: data-i18n (Text), data-i18n-html, data-i18n-title
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  }
}
