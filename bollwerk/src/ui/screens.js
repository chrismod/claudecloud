// Menüs: Kartenwahl, Almanach, Endbildschirm.
import { MAPS, buildMap } from '../game/maps.js';
import { TOWERS, TOWER_ORDER, ENEMIES, ENEMY_UNLOCK, DAMAGE_TYPES, TILE_BONUS } from '../game/data.js';
import { THEMES } from '../render/stage.js';
import { unlockMapOf } from './hud.js';

const $ = (id) => document.getElementById(id);

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
      const t = map.tileAt(x, y);
      if (!map.isBuildable(x, y)) continue;
      g.fillStyle = t === '#' ? th.stone : TILE_BONUS[t].color;
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

export function renderMapList(progress, onPick, onHover) {
  const box = $('map-list');
  box.innerHTML = '';
  MAPS.forEach((m, i) => {
    const rec = progress.maps[m.id] || {};
    const unlocked = progress.unlockAll || i === 0 || progress.maps[MAPS[i - 1].id]?.won;
    const b = document.createElement('button');
    b.className = 'map-card' + (unlocked ? '' : ' locked');
    const cv = document.createElement('canvas');
    drawMapPreview(cv, m);
    b.appendChild(cv);
    const info = document.createElement('div');
    const status = rec.won ? `<span class="won">★ geschafft</span>` : unlocked ? `<span>Ziel: ${m.goal} Wellen</span>` : `<span>🔒 erst „${MAPS[i - 1].name}“ schaffen</span>`;
    info.innerHTML = `<h3>${i + 1}. ${m.name}</h3><p>${m.desc}</p><div class="meta">${status}<span>${rec.best ? `Rekord: Welle ${rec.best}` : `${m.paths.length} ${m.paths.length > 1 ? 'Portale' : 'Portal'}`}</span></div>`;
    b.append(...info.childNodes);
    b.disabled = !unlocked;
    b.addEventListener('click', () => unlocked && onPick(m));
    b.addEventListener('pointerenter', () => unlocked && onHover?.(m));
    box.appendChild(b);
  });
}

export function renderCodex(tab, thumbs) {
  const box = $('codex-body');
  for (const b of $('codex-tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
  if (tab === 'towers') {
    box.innerHTML = TOWER_ORDER.map((type) => {
      const d = TOWERS[type];
      const targets = d.kind === 'support' || d.kind === 'economy' ? 'Unterstützung' : [d.ground && 'Boden', d.air && 'Luft'].filter(Boolean).join(' + ');
      return `<div class="entry"><img alt="" src="${thumbs.towers[type] || ''}"><div><h4>${d.name}</h4><p>${d.blurb}</p><div class="facts">${d.cost} Münzen · ${d.dmgType ? DAMAGE_TYPES[d.dmgType].name : 'kein Schaden'} · ${targets} · ab „${unlockMapOf(type)?.name}“</div><ul>${d.modules.map((m) => `<li><b>${m.name}:</b> ${m.desc}</li>`).join('')}<li><b>Stufe 10 · ${d.master.name}:</b> ${d.master.desc}</li></ul></div></div>`;
    }).join('');
  } else if (tab === 'enemies') {
    box.innerHTML = Object.entries(ENEMIES)
      .map(([type, d]) => {
        const from = ENEMY_UNLOCK[type] ? `ab Welle ${ENEMY_UNLOCK[type]}` : d.boss ? 'jede 10. Welle' : d.child ? 'entsteht unterwegs' : '';
        const res = Object.entries(d.resist || {})
          .map(([k, v]) => `${DAMAGE_TYPES[k].name} ${v < 1 ? '−' : '+'}${Math.round(Math.abs(1 - v) * 100)} %`)
          .join(', ');
        const facts = [`Leben ${d.hp}${d.shield ? ` + Schild ${d.shield}` : ''}`, `Tempo ${String(d.speed).replace('.', ',')}`, d.armor ? `Panzerung ${d.armor}` : null, d.flying ? 'fliegt' : null, from, `Schaden am Kern ${d.leak}`].filter(Boolean).join(' · ');
        return `<div class="entry"><img alt="" src="${thumbs.enemies[type] || ''}"><div><h4>${d.name}</h4><p>${d.blurb}</p><div class="facts">${facts}${res ? `<br>${res}` : ''}</div></div></div>`;
      })
      .join('');
  } else {
    box.innerHTML = `<div class="rules">
      <h4>Ziel</h4><p>Gegner strömen aus den Portalen den Weg entlang zum Kern. Jeder, der ankommt, kostet Lebenspunkte. Überstehe die geforderte Zahl an Wellen, um die nächste Karte freizuschalten – danach geht es im Endlosmodus weiter, so weit du kommst.</p>
      <h4>Münzen</h4><p>Jeder besiegte Gegner bringt Kopfgeld, jede Welle ein Grundeinkommen. Wer die nächste Welle früher ruft, bekommt einen Bonus für die gesparte Zeit. Verkaufen bringt 70 % zurück – ein Turm, der noch keinen Schuss abgegeben hat, wird voll erstattet.</p>
      <h4>Aufrüsten, Module, Meisterstufe</h4><p>Türme lassen sich bis Stufe 10 verbessern. Auf Stufe 5 wählst du eines von zwei Modulen, das die Spielweise des Turms verändert. Auf Stufe 10 kommt die Meisterfähigkeit dazu.</p>
      <h4>Erfahrung</h4><p>Türme sammeln mit jedem Schadenspunkt Erfahrung und steigen bis zu zehn Ränge auf. Jeder Rang gibt +4 % Schaden und +1,5 % Reichweite.</p>
      <h4>Schadensarten und Panzerung</h4><p>Panzerung zieht von jedem direkten Treffer einen festen Betrag ab (mindestens 20 % kommen durch). Viele kleine Treffer leiden darunter, große Treffer kaum. Dauerschaden (Feuer, Gift, Laserstrahl, Frost) ignoriert Panzerung. Säure zersetzt sie. Energie wirkt doppelt auf Schilde.</p>
      <h4>Statuseffekte</h4><p>Verlangsamung und Einfrieren halten Gegner länger im Feuer – Bosse sind nur halb so anfällig. Brand und Gift schaden über Zeit, Sprödigkeit und Markierung erhöhen jeden weiteren Schaden.</p>
      <h4>Sonderplattformen</h4><p>${Object.values(TILE_BONUS)
        .map((t) => `<b style="color:${t.color}">${t.name}</b>: ${t.desc}`)
        .join(' · ')}</p>
      <h4>Fähigkeiten</h4><p>Orbitalschlag, Kälteeinbruch und Überlast laden sich mit der Zeit wieder auf – heb sie dir für Bosse und brenzlige Momente auf.</p>
    </div>`;
  }
}

export function showEnd(kind, game, def, extra, actions) {
  $('end').classList.remove('hidden');
  $('end-title').textContent = kind === 'victory' ? 'Sieg!' : 'Der Kern ist gefallen';
  $('end-text').innerHTML =
    kind === 'victory'
      ? `Alle ${game.goal} Wellen auf „${def.name}“ überstanden.${extra ? `<br>${extra}` : ''}`
      : `Du hast ${Math.max(0, game.wave - 1)} Wellen auf „${def.name}“ überstanden.${extra ? `<br>${extra}` : ''}`;
  $('end-stats').innerHTML = `<div><b>${game.stats.kills}</b><span>Gegner besiegt</span></div><div><b>${game.towers.length}</b><span>Türme</span></div><div><b>${kind === 'victory' ? game.lives : game.wave}</b><span>${kind === 'victory' ? 'Leben übrig' : 'Welle'}</span></div>`;
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
