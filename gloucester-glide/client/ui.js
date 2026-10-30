// DOM-Teile: Menü, Bestenliste, HUD-Texte
import { CHEESES } from '../shared/cheeses.js';

export const $ = (s) => document.querySelector(s);

export function fmt(ms, { sign = false } = {}) {
  if (ms == null) return '–';
  const neg = ms < 0;
  const a = Math.abs(Math.round(ms));
  const m = Math.floor(a / 60000);
  const s = Math.floor((a % 60000) / 1000);
  const c = Math.floor((a % 1000) / 10);
  const body = m > 0 ? `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}` : `${s}.${String(c).padStart(2, '0')}`;
  return sign ? `${neg ? '−' : '+'}${body}` : `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderTracks(el, tracks, selected, localBest, onPick) {
  el.innerHTML = '';
  for (const t of tracks) {
    const b = document.createElement('button');
    b.className = `card-opt${t.id === selected ? ' selected' : ''}`;
    const mine = localBest(t.id);
    b.innerHTML = `
      <span><strong>${esc(t.name)}</strong>${t.daily ? '<span class="tag">Heute</span>' : ''}${t.theme === 'everest' ? '<span class="tag expedition">Expedition</span>' : ''}</span>
      <span class="best">${fmt(t.bestMs)}<em>${t.bestMs ? 'Rekord' : 'noch kein Rekord'}${mine ? ` · du ${fmt(mine.timeMs)}` : ''}</em></span>
      <small>${esc(t.tagline)} · ${t.length >= 1000 ? `${(t.length / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : `${t.length} m`}</small>`;
    b.onclick = () => onPick(t.id);
    el.appendChild(b);
  }
}

const STATS = {
  gloucester: { tempo: 0.7, lenken: 0.65, stabil: 0.7, robust: 0.55 },
  emmentaler: { tempo: 0.85, lenken: 0.5, stabil: 0.6, robust: 0.3 },
  camembert: { tempo: 0.5, lenken: 0.95, stabil: 0.4, robust: 0.7 },
  parmigiano: { tempo: 0.95, lenken: 0.35, stabil: 0.95, robust: 0.95 },
};

// picks: gewählte Sorte je Spieler (Index 0/1); active: welcher Spieler gerade wählt
export function renderCheeses(el, picks, active, onPick) {
  el.innerHTML = '';
  const selected = picks[active];
  for (const C of Object.values(CHEESES)) {
    const s = STATS[C.id];
    const b = document.createElement('button');
    b.className = `cheese-opt${C.id === selected ? ' selected' : ''}`;
    const who = picks.length > 1 ? picks.map((p, i) => (p === C.id ? `<b class="p${i + 1}">P${i + 1}</b>` : '')).join('') : '';
    b.title = C.blurb;
    b.innerHTML = `
      <span class="who">${who}</span>
      <span class="wheel wheel-${C.id}" style="--rind:${C.rind}; --paste:${C.paste}"></span>
      <strong>${esc(C.name)}</strong>
      <span class="stat">Tempo<i><b style="width:${s.tempo * 100}%"></b></i></span>
      <span class="stat">Lenkung<i><b style="width:${s.lenken * 100}%"></b></i></span>
      <span class="stat">Stabil<i><b style="width:${s.stabil * 100}%"></b></i></span>
      <span class="stat">Robust<i><b style="width:${s.robust * 100}%"></b></i></span>`;
    b.onclick = () => onPick(C.id);
    el.appendChild(b);
  }
  const blurb = document.getElementById('cheese-blurb');
  if (blurb) blurb.textContent = CHEESES[selected]?.blurb ?? '';
}

export function renderBoard(el, entries, { me, onGhost, limit = 10, personalBestMs } = {}) {
  el.innerHTML = '';
  const mine = new Set([].concat(me ?? []));
  const shown = entries.slice(0, limit);
  shown.forEach((e, i) => el.appendChild(row(e, i + 1, mine, onGhost)));
  const mineIdx = entries.findIndex((e) => mine.has(e.name));
  if (mineIdx >= limit) {
    const gap = document.createElement('li');
    gap.className = 'gap';
    gap.textContent = '···';
    el.appendChild(gap);
    el.appendChild(row(entries[mineIdx], mineIdx + 1, mine, onGhost));
  } else if (mineIdx < 0 && personalBestMs != null) {
    const gap = document.createElement('li');
    gap.className = 'gap';
    gap.textContent = `Deine Bestzeit: ${fmt(personalBestMs)}`;
    el.appendChild(gap);
  }
}

function row(e, rank, mine, onGhost) {
  const li = document.createElement('li');
  if (mine.has(e.name)) li.className = 'me';
  const C = CHEESES[e.cheese];
  const integ = e.integrity != null ? `<small class="integ" title="Laib-Integrität im Ziel">${e.integrity} %</small>` : '';
  li.innerHTML = `<span class="rank">${rank}.</span><span class="dot" title="${esc(C?.name ?? '')}" style="background:${C?.rind ?? '#999'}"></span><span class="who">${esc(e.name)}${integ}</span><span class="t">${fmt(e.timeMs)}</span>`;
  if (onGhost) {
    const b = document.createElement('button');
    b.className = 'watch';
    b.textContent = 'Ghost';
    b.title = 'Gegen diesen Lauf fahren';
    b.onclick = (ev) => (ev.stopPropagation(), onGhost(e));
    li.appendChild(b);
  } else li.appendChild(document.createElement('span'));
  return li;
}

export function toast(el, text, ms = 1400) {
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms);
}

export function center(big, small = '') {
  $('#hud-center').innerHTML = big ? `<span class="pop">${esc(big)}</span>${small ? `<small>${esc(small)}</small>` : ''}` : '';
}

export function show(id, on = true) {
  $(id).classList.toggle('hidden', !on);
}
