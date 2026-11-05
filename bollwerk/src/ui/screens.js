// Menüs: Kartenwahl, Forschung, Almanach, Endbildschirm, Hilfe.
import { MAPS, CHAPTERS, buildMap } from '../game/maps.js';
import { TOWERS, TOWER_ORDER, ENEMIES, ENEMY_UNLOCK, TILE_BONUS, BASE_MAX_LEVEL, BASE_MAX_XP } from '../game/data.js';
import { RESEARCH, BRANCHES, RESEARCH_BY_ID, canResearch, spentOn, levelOf, reqsMet } from '../game/research.js';
import { THEMES } from '../render/stage.js';
import { unlockMapOf } from './hud.js';
import { t, tower, enemy, num, fmt } from '../i18n.js';

const $ = (id) => document.getElementById(id);
const mapName = (id) => t(`map.${id}.name`);

// Minikarte als 2D-Zeichnung
export function drawMapPreview(cv, def) {
  const map = buildMap(def);
  const th = THEMES[def.theme] || THEMES.meadow;
  const W = (cv.width = 320);
  const H = (cv.height = 200);
  const g = cv.getContext('2d');
  const s = Math.min((W - 16) / map.W, (H - 16) / map.H);
  const ox = (W - s * map.W) / 2;
  const oy = (H - s * map.H) / 2;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, th.skyTop);
  grd.addColorStop(1, th.skyBottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = th.earth;
  g.beginPath();
  g.roundRect(ox - s * 0.3, oy - s * 0.3 + 4, s * (map.W + 0.6), s * (map.H + 0.6), s * 0.4);
  g.fill();
  g.fillStyle = th.grass[0];
  g.beginPath();
  g.roundRect(ox - s * 0.3, oy - s * 0.3, s * (map.W + 0.6), s * (map.H + 0.6), s * 0.4);
  g.fill();
  for (let y = 0; y < map.H; y++) {
    for (let x = 0; x < map.W; x++) {
      const tl = map.tileAt(x, y);
      if (!map.isBuildable(x, y)) continue;
      g.fillStyle = tl === '#' ? th.stone : TILE_BONUS[tl].color;
      g.beginPath();
      g.roundRect(ox + x * s + s * 0.08, oy + y * s + s * 0.08, s * 0.84, s * 0.84, s * 0.15);
      g.fill();
    }
  }
  g.strokeStyle = th.road;
  g.lineWidth = s * 0.7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of map.paths) {
    g.beginPath();
    p.pts.forEach((q, i) => (i ? g.lineTo(ox + q.x * s, oy + q.y * s) : g.moveTo(ox + q.x * s, oy + q.y * s)));
    g.stroke();
  }
  for (const sp of map.spawns) {
    g.fillStyle = '#b67cff';
    g.beginPath();
    g.arc(ox + (sp.x + 0.5) * s, oy + (sp.y + 0.5) * s, s * 0.42, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#38d6ff';
  g.beginPath();
  g.arc(ox + (map.base.x + 0.5) * s, oy + (map.base.y + 0.5) * s, s * 0.45, 0, Math.PI * 2);
  g.fill();
}

export function mapUnlocked(progress, i) {
  return progress.unlockAll || i === 0 || !!progress.maps[MAPS[i - 1].id]?.won;
}

// Besonderheiten eines Levels als kurze Etiketten
export function mapTags(m) {
  const tags = [];
  if (m.bias) {
    const top = Object.entries(m.bias).sort((x, y) => y[1] - x[1])[0][0];
    tags.push(t(`mod.bias.${top}`));
  }
  if (m.bossEvery) tags.push(t('mod.bossEvery', { n: m.bossEvery }));
  if (m.lives < 20) tags.push(t('mod.lives', { n: m.lives }));
  return tags;
}

let shownChapter = null;

export function renderMapList(progress, onPick, onHover) {
  // Standard: Kapitel des ersten noch nicht geschafften, freigeschalteten Levels
  if (shownChapter == null) {
    const next = MAPS.find((m, i) => mapUnlocked(progress, i) && !progress.maps[m.id]?.won) || MAPS[0];
    shownChapter = next.chapter;
  }
  const tabs = $('chapter-tabs');
  tabs.innerHTML = '';
  CHAPTERS.forEach((ch, ci) => {
    const maps = MAPS.filter((m) => m.chapter === ci);
    const won = maps.filter((m) => progress.maps[m.id]?.won).length;
    const open = mapUnlocked(progress, maps[0].index);
    const b = document.createElement('button');
    b.className = `chapter th-${ch.theme}${ci === shownChapter ? ' on' : ''}${open ? '' : ' locked'}`;
    b.innerHTML = `<small>${t('ui.menu.chapter', { n: ci + 1 })}</small><b>${open ? '' : '🔒 '}${t(`chapter.${ch.id}.name`)}</b><span>${won ? '★ ' : ''}${t('ui.menu.chapterDone', { n: won })}</span>`;
    b.title = t(`chapter.${ch.id}.desc`);
    b.onclick = () => {
      shownChapter = ci;
      renderMapList(progress, onPick, onHover);
      const firstOpen = maps.find((m) => mapUnlocked(progress, m.index));
      if (firstOpen) onHover?.(firstOpen);
    };
    tabs.appendChild(b);
  });

  const box = $('map-list');
  box.innerHTML = '';
  for (const m of MAPS.filter((x) => x.chapter === shownChapter)) {
    const i = m.index;
    const rec = progress.maps[m.id] || {};
    const unlocked = mapUnlocked(progress, i);
    const b = document.createElement('button');
    b.className = 'map-card' + (unlocked ? '' : ' locked');
    const cv = document.createElement('canvas');
    drawMapPreview(cv, m);
    b.appendChild(cv);
    const info = document.createElement('div');
    const status = rec.won ? `<span class="won">${t('ui.menu.won')}</span>` : unlocked ? `<span>${t('ui.menu.goal', { n: m.goal })}</span>` : `<span>${t('ui.menu.locked', { name: mapName(MAPS[i - 1].id) })}</span>`;
    const portals = m.paths.length > 1 ? t('ui.menu.portalN', { n: m.paths.length }) : t('ui.menu.portal1');
    const tags = mapTags(m)
      .map((x) => `<i class="tag">${x}</i>`)
      .join('');
    info.innerHTML = `<h3>${i + 1}. ${mapName(m.id)}</h3><p>${t(`map.${m.id}.desc`)}</p>${tags ? `<div class="tags">${tags}</div>` : ''}<div class="meta">${status}<span>${rec.best ? t('ui.menu.record', { n: rec.best }) : portals}</span></div>`;
    b.append(...info.childNodes);
    b.disabled = !unlocked;
    b.addEventListener('click', () => unlocked && onPick(m));
    b.addEventListener('pointerenter', () => unlocked && onHover?.(m));
    box.appendChild(b);
  }
}

// ---------- Forschung ----------
const UX = 100;
const UY = 92;
const PAD = 70;
const view = { x: null, y: 0, s: 0.9, sel: 'hub' };
const SYM = { eco: '¤', arms: '⚔', fort: '⛨', cmd: '✦', tupg: '⇧', trange: '◎', trate: '»', tcost: '%', txp: '✚', txpcap: '⬆', tult: '♛', endless: '∞', hub: '◈' };
const PERCENT_SPECIAL = { bolt: 3, mortar: 4, frost: 2, acid: 8, flame: 10, amp: 1, mint: 6 };
const FLAT_SPECIAL = { tesla: 0.4, sniper: 0.2, laser: 0.2, missile: 0.1 };
const NON_PERCENT = new Set(['lives', 'veteran', 'barrier', 'blizzard', 'overdrive', 'medic', 'interest', 'e.lives', 'e.xpcap']);

function nodeName(r) {
  if (r.tower) {
    const k = r.kind.startsWith('ts.') ? `research.special.${r.tower}.name` : `research.tnode.${r.kind}.name`;
    return t(k);
  }
  return t(`research.node.${r.id}.name`);
}

// Wirkung bei Stufe L als Text
function nodeEffect(r, L) {
  if (r.kind === 'hub') return t('research.node.hub.desc');
  if (L <= 0) return '—';
  if (r.tower) {
    const support = TOWERS[r.tower].kind === 'support' || TOWERS[r.tower].kind === 'economy';
    if (r.kind.startsWith('ts.')) {
      const v = PERCENT_SPECIAL[r.tower] ? PERCENT_SPECIAL[r.tower] * L : num(FLAT_SPECIAL[r.tower] * L, 2);
      return t(`research.special.${r.tower}.desc`, { v });
    }
    const vars = { v: Math.round(r.per * L * 100), ult: tower(r.tower).ult[0] };
    if (r.kind === 'tupg') vars.v = BASE_MAX_LEVEL + L;
    if (r.kind === 'txpcap') vars.v = BASE_MAX_XP + r.per * L;
    const key = `research.tnode.${r.kind}`;
    return t(support && t(`${key}.descSupport`) !== `${key}.descSupport` ? `${key}.descSupport` : `${key}.desc`, vars);
  }
  const v = r.per * L;
  const vars = { v: NON_PERCENT.has(r.id) ? num(v) : num(v * 100, 1), w: num(L * 1.5), cap: 30 * L };
  return t(`research.node.${r.id}.desc`, vars);
}

function nodeLevelText(r, lv) {
  return r.max == null ? t('ui.research.levelOf', { l: lv }) : t('ui.research.levelOfMax', { l: lv, m: r.max });
}

export function renderResearch(progress, thumbs, onBuy) {
  const levels = progress.research;
  const wallet = { c: progress.crystals, d: progress.dust };
  $('research-crystals').textContent = fmt(progress.crystals);
  $('research-dust').textContent = fmt(progress.dust);
  const spent = spentOn(levels);
  $('research-spent').textContent = t('ui.research.spent', { n: spent.c + (spent.d ? ` + ${spent.d}` : '') });

  const xs = RESEARCH.map((r) => r.x);
  const ys = RESEARCH.map((r) => r.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const W = (Math.max(...xs) - minX) * UX + PAD * 2;
  const H = (Math.max(...ys) - minY) * UY + PAD * 2 + 30;
  const px = (r) => (r.x - minX) * UX + PAD;
  const py = (r) => (r.y - minY) * UY + PAD + 30;

  const plane = $('rplane');
  plane.style.width = `${W}px`;
  plane.style.height = `${H}px`;
  let html = `<svg class="redges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for (const r of RESEARCH) {
    for (const [rid, need] of r.req) {
      const q = RESEARCH_BY_ID[rid];
      const ok = levelOf(levels, rid) >= need;
      if (rid === 'hub' && r.branch === 'endless') continue; // Endlos-Kette beginnt ohne Linie
      // Vom Zentrum aus rechtwinklig über eine Sammelschiene, sonst gerade
      const d = rid === 'hub' ? `M${px(q)} ${py(q)} V${py(q) + 34} H${px(r)} V${py(r)}` : `M${px(q)} ${py(q)} L${px(r)} ${py(r)}`;
      html += `<path d="${d}" class="${ok ? 'on' : ''} b-${r.branch || 'hub'}"/>`;
    }
  }
  html += `</svg>`;
  // Überschriften der Zweige
  BRANCHES.forEach((br) => {
    const first = RESEARCH.find((r) => r.branch === br);
    html += `<div class="rlabel b-${br}" style="left:${px(first)}px;top:${py(first) - 54}px">${t(`research.branch.${br}.name`)}</div>`;
  });
  for (const tt of TOWER_ORDER) {
    const first = RESEARCH_BY_ID[`${tt}.dmg`];
    html += `<div class="rlabel b-tower" style="left:${px(first)}px;top:${py(first) - 54}px">${tower(tt).name}</div>`;
  }
  const firstEndless = RESEARCH.find((r) => r.branch === 'endless');
  html += `<div class="rlabel b-endless" style="left:${px(firstEndless) + 1.5 * UX}px;top:${py(firstEndless) - 54}px">${t('research.branch_extra.endless')} · ${t('ui.research.dust')}</div>`;

  for (const r of RESEARCH) {
    const lv = levelOf(levels, r.id);
    const maxed = r.max != null && lv >= r.max;
    const met = reqsMet(levels, r.id);
    const chk = canResearch(levels, wallet, r.id);
    const cls = ['rnode', `b-${r.branch || 'hub'}`, r.cur === 'd' ? 'dustnode' : '', lv > 0 ? 'has' : '', maxed ? 'maxed' : '', !met ? 'locked' : '', chk.ok ? 'afford' : '', view.sel === r.id ? 'sel' : '', r.kind === 'tult' ? 'ult' : ''].filter(Boolean).join(' ');
    let icon;
    if (r.kind === 'tdmg') icon = `<img alt="" src="${thumbs.towers[r.tower] || ''}">`;
    else if (r.kind.startsWith('ts.')) icon = '★';
    else icon = SYM[r.kind] || SYM[r.branch] || '•';
    const badge = r.kind === 'hub' ? '' : `<i>${r.max == null ? lv : `${lv}/${r.max}`}</i>`;
    html += `<button class="${cls}" data-id="${r.id}" style="left:${px(r)}px;top:${py(r)}px" title="${nodeName(r)}"><span>${icon}</span>${badge}</button>`;
  }
  plane.innerHTML = html;

  const graph = $('rgraph');
  if (view.x == null) {
    // Start: Zentrum oben in der Mitte
    const hub = RESEARCH_BY_ID.hub;
    view.s = Math.min(1, Math.max(0.5, graph.clientWidth / (W * 0.75)));
    view.x = graph.clientWidth / 2 - px(hub) * view.s;
    view.y = 20;
  }
  applyView();
  for (const b of plane.querySelectorAll('.rnode')) {
    b.onclick = (e) => {
      if (graph.dataset.dragged === '1') return;
      e.stopPropagation();
      view.sel = b.dataset.id;
      for (const o of plane.querySelectorAll('.rnode.sel')) o.classList.remove('sel');
      b.classList.add('sel');
      renderDetail(progress, onBuy);
    };
  }
  bindGraph(graph);
  renderDetail(progress, onBuy);
}

function applyView() {
  $('rplane').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
}

export function centerResearch() {
  view.x = null;
}

// Ziehen, Mausrad und Zwei-Finger-Zoom
function bindGraph(graph) {
  if (graph.dataset.bound) return;
  graph.dataset.bound = '1';
  const pts = new Map();
  let last = null;
  let start = null;
  let pinch = null;
  graph.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    graph.dataset.dragged = '0';
    last = start = { x: e.clientX, y: e.clientY };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s };
    }
  });
  graph.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const rect = graph.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
      graph.dataset.dragged = '1';
      return;
    }
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) graph.dataset.dragged = '1';
    view.x += e.clientX - last.x;
    view.y += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    applyView();
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    setTimeout(() => (graph.dataset.dragged = '0'), 0);
  };
  graph.addEventListener('pointerup', up);
  graph.addEventListener('pointercancel', up);
  graph.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = graph.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, view.s * Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );
}

function zoomAt(cx, cy, s) {
  s = Math.max(0.35, Math.min(1.8, s));
  view.x = cx - ((cx - view.x) * s) / view.s;
  view.y = cy - ((cy - view.y) * s) / view.s;
  view.s = s;
  applyView();
}

function renderDetail(progress, onBuy) {
  const levels = progress.research;
  const r = RESEARCH_BY_ID[view.sel] || RESEARCH_BY_ID.hub;
  const lv = levelOf(levels, r.id);
  const box = $('rdetail');
  const chk = canResearch(levels, { c: progress.crystals, d: progress.dust }, r.id);
  const maxed = r.max != null && lv >= r.max;
  const branch = r.tower ? tower(r.tower).name : r.branch === 'endless' ? t('research.branch_extra.endless') : r.branch && r.branch !== 'hub' ? t(`research.branch.${r.branch}.name`) : '';
  let html = `<div class="rd-branch b-${r.branch || 'hub'}">${branch}</div><h3>${nodeName(r)}</h3>`;
  if (r.kind !== 'hub') html += `<div class="rd-level">${nodeLevelText(r, lv)}</div>`;
  if (lv > 0 || r.kind === 'hub') html += `<div class="rd-eff"><span class="lbl">${t('ui.research.now')}</span>${nodeEffect(r, Math.max(lv, 1))}</div>`;
  if (!maxed && r.kind !== 'hub') html += `<div class="rd-eff next"><span class="lbl">${t('ui.research.next')}</span>${nodeEffect(r, lv + 1)}</div>`;
  if (r.req.length && r.kind !== 'hub') {
    html += `<div class="rd-req"><span class="lbl">${t('ui.research.requires')}</span>`;
    for (const [rid, need] of r.req) {
      const q = RESEARCH_BY_ID[rid];
      const ok = levelOf(levels, rid) >= need;
      html += `<div class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${nodeName(q)}${need > 1 ? ` ${need}` : ''}</div>`;
    }
    html += `</div>`;
  }
  if (r.cur === 'd') html += `<p class="rd-note">${t('ui.research.endless')}</p>`;
  if (r.kind !== 'hub') {
    if (maxed) html += `<div class="rd-max">${t('ui.research.maxed')}</div>`;
    else {
      const cost = r.cost(lv);
      const curName = r.cur === 'd' ? t('ui.research.dust') : t('ui.menu.crystals');
      html += `<button class="primary ${r.cur === 'd' ? 'gold' : 'violet'} rd-buy" ${chk.ok ? '' : 'disabled'}>${t('ui.research.buy')} · <span class="ico ${r.cur === 'd' ? 'dust' : 'crystal'}"></span>${cost}</button>`;
      if (chk.reason === 'funds') html += `<div class="rd-hint">${t('ui.research.notEnough', { cur: curName })}</div>`;
    }
  }
  box.innerHTML = html;
  const buy = box.querySelector('.rd-buy');
  if (buy) buy.onclick = () => onBuy(r.id);
}

// ---------- Almanach ----------
export function renderCodex(tab, thumbs) {
  const box = $('codex-body');
  for (const b of $('codex-tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
  if (tab === 'towers') {
    box.innerHTML = TOWER_ORDER.map((type) => {
      const d = TOWERS[type];
      const tx = tower(type);
      const targets = d.kind === 'support' || d.kind === 'economy' ? t('ui.codex.support') : [d.ground && t('ui.insp.ground'), d.air && t('ui.insp.air')].filter(Boolean).join(' + ');
      return `<div class="entry"><img alt="" src="${thumbs.towers[type] || ''}"><div><h4>${tx.name}</h4><p>${tx.blurb}</p><div class="facts">${t('ui.codex.coins', { c: d.cost })} · ${d.dmgType ? t(`dmg.${d.dmgType}`) : t('ui.codex.noDamage')} · ${targets} · ${t('ui.codex.fromMap', { map: mapName(unlockMapOf(type)?.id) })}</div><ul>${tx.mods.map(([n, ds]) => `<li><b>${n}:</b> ${ds}</li>`).join('')}<li><b>${t('ui.codex.level10')} · ${tx.master[0]}:</b> ${tx.master[1]}</li><li><b>${t('ui.codex.level20')} · ${tx.ult[0]}:</b> ${tx.ult[1]}</li></ul></div></div>`;
    }).join('');
  } else if (tab === 'enemies') {
    box.innerHTML = Object.entries(ENEMIES)
      .map(([type, d]) => {
        const en = enemy(type);
        const from = ENEMY_UNLOCK[type] ? t('ui.codex.fromWave', { n: ENEMY_UNLOCK[type] }) : d.boss ? t('ui.codex.bossWave') : d.child ? t('ui.codex.spawned') : '';
        const res = Object.entries(d.resist || {})
          .map(([k, v]) => `${t(`dmg.${k}`)} ${v < 1 ? '−' : '+'}${Math.round(Math.abs(1 - v) * 100)}%`)
          .join(', ');
        const facts = [t('ui.codex.hp', { v: d.hp }) + (d.shield ? t('ui.codex.shield', { v: d.shield }) : ''), t('ui.codex.speed', { v: num(d.speed, 2) }), d.armor ? t('ui.codex.armor', { v: d.armor }) : null, d.flying ? t('ui.codex.flies') : null, from, t('ui.codex.leak', { v: d.leak })].filter(Boolean).join(' · ');
        const ab = en.ability ? `<br><b class="ab">${t('ui.codex.ability')}: ${en.ability}</b>` : '';
        return `<div class="entry${d.boss ? ' boss' : ''}"><img alt="" src="${thumbs.enemies[type] || ''}"><div><h4>${en.name}</h4><p>${en.blurb}</p><div class="facts">${facts}${res ? `<br>${res}` : ''}${ab}</div></div></div>`;
      })
      .join('');
  } else {
    const tiles = Object.keys(TILE_BONUS)
      .map((k) => `<b style="color:${TILE_BONUS[k].color}">${t(`tile.${k}.name`)}</b>: ${t(`tile.${k}.desc`)}`)
      .join(' · ');
    box.innerHTML = `<div class="rules">${t('ui.codex.rulesHtml')}<h4>${t('tile.D.name')} · ${t('tile.R.name')} · ${t('tile.X.name')} · ${t('tile.C.name')}</h4><p>${tiles}</p></div>`;
  }
}

export function renderHelp() {
  $('help-table').innerHTML = t('ui.help.rows')
    .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
    .join('');
}

export function showEnd(kind, game, def, extra, crystals, actions) {
  $('end').classList.remove('hidden');
  $('end-title').textContent = kind === 'victory' ? t('ui.end.victory') : t('ui.end.defeat');
  const map = mapName(def.id);
  $('end-text').innerHTML = (kind === 'victory' ? t('ui.end.victoryText', { n: game.goal, map }) : t('ui.end.defeatText', { n: Math.max(0, game.wave - 1), map })) + (extra ? `<br>${extra}` : '');
  $('end-stats').innerHTML = `<div><b>${game.stats.kills}</b><span>${t('ui.end.kills')}</span></div><div><b>${game.towers.length}</b><span>${t('ui.end.towers')}</span></div><div><b>${kind === 'victory' ? game.lives : game.wave}</b><span>${kind === 'victory' ? t('ui.end.livesLeft') : t('ui.end.wave')}</span></div>`;
  $('end-crystals').innerHTML = crystals;
  const row = $('end-actions');
  row.innerHTML = '';
  for (const [label, cls, fn] of actions) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.onclick = fn;
    row.appendChild(b);
  }
}

