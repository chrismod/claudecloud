// Menüs: Kartenwahl, Forschung, Almanach, Endbildschirm, Hilfe.
import { MAPS, CHAPTERS, buildMap } from '../game/maps.js';
import { TOWERS, TOWER_ORDER, ENEMIES, ENEMY_UNLOCK, TILE_BONUS } from '../game/data.js';
import { RESEARCH, BRANCHES, RESEARCH_BY_ID, parentOf, canResearch, spentOn } from '../game/research.js';
import { THEMES } from '../render/stage.js';
import { unlockMapOf } from './hud.js';
import { t, tower, enemy, num } from '../i18n.js';

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
function effectText(r, level) {
  if (level <= 0) return '—';
  const v = level * r.per;
  const percent = !['lives', 'veteran', 'barrier', 'blizzard', 'overdrive', 'medic', 'interest'].includes(r.id);
  const vars = { v: percent ? Math.round(v * 100) : num(v), w: num(level * 1.5), cap: 30 * level };
  if (r.id === 'interest') vars.v = level;
  return t(`research.node.${r.id}.desc`, vars);
}

export function renderResearch(progress, onBuy) {
  const levels = progress.research;
  $('research-crystals').textContent = progress.crystals;
  $('research-spent').textContent = t('ui.research.spent', { n: spentOn(levels) });
  const tree = $('tree');
  tree.innerHTML = '';
  for (const br of BRANCHES) {
    const col = document.createElement('div');
    col.className = `branch b-${br}`;
    col.innerHTML = `<header><h3>${t(`research.branch.${br}.name`)}</h3><p>${t(`research.branch.${br}.desc`)}</p></header>`;
    for (const r of RESEARCH.filter((x) => x.branch === br)) {
      const lv = levels[r.id] || 0;
      const chk = canResearch(levels, progress.crystals, r.id);
      const parent = parentOf(r.id);
      const locked = chk.reason === 'locked';
      const maxed = lv >= r.max;
      const node = document.createElement('div');
      node.className = `node${lv ? ' has' : ''}${maxed ? ' maxed' : ''}${locked ? ' locked' : ''}`;
      const pips = Array.from({ length: r.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const now = effectText(r, lv);
      const next = maxed ? '' : effectText(r, lv + 1);
      node.innerHTML = `<div class="node-top"><b>${t(`research.node.${r.id}.name`)}</b><span class="pips">${pips}</span></div>
        <div class="eff">${lv ? `<span class="lbl">${t('ui.research.now')}</span> ${now}` : next}</div>
        ${lv && !maxed ? `<div class="eff next"><span class="lbl">${t('ui.research.next')}</span> ${next}</div>` : ''}
        ${locked ? `<div class="needs">${t('ui.research.needs', { name: t(`research.node.${parent}.name`) })}</div>` : ''}`;
      const btn = document.createElement('button');
      btn.className = 'buy';
      if (maxed) {
        btn.textContent = t('ui.research.maxed');
        btn.disabled = true;
      } else {
        btn.innerHTML = `<span class="ico crystal"></span>${r.cost[lv]}`;
        btn.disabled = !chk.ok;
        btn.onclick = () => onBuy(r.id);
      }
      node.appendChild(btn);
      col.appendChild(node);
    }
    tree.appendChild(col);
  }
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
      return `<div class="entry"><img alt="" src="${thumbs.towers[type] || ''}"><div><h4>${tx.name}</h4><p>${tx.blurb}</p><div class="facts">${t('ui.codex.coins', { c: d.cost })} · ${d.dmgType ? t(`dmg.${d.dmgType}`) : t('ui.codex.noDamage')} · ${targets} · ${t('ui.codex.fromMap', { map: mapName(unlockMapOf(type)?.id) })}</div><ul>${tx.mods.map(([n, ds]) => `<li><b>${n}:</b> ${ds}</li>`).join('')}<li><b>${t('ui.codex.level10')} · ${tx.master[0]}:</b> ${tx.master[1]}</li></ul></div></div>`;
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

export { RESEARCH_BY_ID };
