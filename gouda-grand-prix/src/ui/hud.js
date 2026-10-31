// Anzeige im Rennen: je Spieler Gegenstand, Runde, Zeit, Platz, Käse-Level, Meldungen; dazu Minikarte
import { ICONS, ITEM_ORDER } from './icons.js';
import { ITEMS, MAX_CHEESE } from '../sim/config.js';

export function fmtTime(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function createHud(root) {
  root.innerHTML = '';
  const panels = [];
  let mini = null;
  let miniCtx = null;
  let miniTrack = null;
  let rankList = null;

  function build(race, humans, portraits) {
    root.innerHTML = '';
    panels.length = 0;
    root.classList.toggle('split', humans.length === 2);
    humans.forEach((k, i) => {
      const el = document.createElement('div');
      el.className = `hud-panel p${i + 1}`;
      el.innerHTML = `
        <div class="hud-item"><div class="slot"><div class="icon"></div><div class="charges"></div></div><div class="item-name"></div></div>
        <div class="hud-lap"><span class="lbl">Runde</span><b class="lap">1</b><span class="of">/${race.laps}</span><div class="time">0:00.00</div></div>
        <div class="hud-pos"><span class="num">8</span><span class="suf">.</span></div>
        <div class="hud-cheese"><div class="ic">${ICONS.cheese}</div><b class="cnt">0</b><div class="bar"><i></i></div></div>
        <div class="hud-drift"><i></i><i></i><i></i></div>
        <div class="hud-msg"></div>
        <div class="hud-sub"></div>
        <div class="hud-count"></div>
        <div class="hud-wrong">Falsche Richtung!</div>
        <div class="hud-tag">${humans.length > 1 ? `Spieler ${i + 1}` : ''}</div>`;
      root.appendChild(el);
      panels.push({
        el,
        k,
        icon: el.querySelector('.icon'),
        charges: el.querySelector('.charges'),
        itemName: el.querySelector('.item-name'),
        lap: el.querySelector('.lap'),
        time: el.querySelector('.time'),
        pos: el.querySelector('.hud-pos'),
        num: el.querySelector('.num'),
        cnt: el.querySelector('.cnt'),
        bar: el.querySelector('.hud-cheese .bar i'),
        drift: el.querySelector('.hud-drift'),
        msg: el.querySelector('.hud-msg'),
        sub: el.querySelector('.hud-sub'),
        count: el.querySelector('.hud-count'),
        wrong: el.querySelector('.hud-wrong'),
        lastItem: undefined,
        lastRank: -1,
        lastCheese: -1,
        msgT: 0,
        subT: 0,
        rollT: 0,
        wrongT: 0,
      });
    });
    // Minikarte
    mini = document.createElement('canvas');
    mini.className = 'minimap';
    mini.width = 360;
    mini.height = 360;
    root.appendChild(mini);
    miniCtx = mini.getContext('2d');
    miniTrack = trackPath(race.track, 360, 26);
    // Platzierungsliste mit Porträts (nur Einzelspieler)
    rankList = null;
    if (humans.length === 1) {
      rankList = document.createElement('div');
      rankList.className = 'ranklist';
      rankList.innerHTML = race.karts.map((k) => `<div class="rk" data-i="${k.idx}"><img src="${portraits?.[k.driver.id] ?? ''}" alt=""/><span></span></div>`).join('');
      root.appendChild(rankList);
    }
  }

  function message(i, text, { sub = '', dur = 1.6, cls = '' } = {}) {
    const p = panels[i];
    if (!p) return;
    p.msg.textContent = text;
    p.msg.className = 'hud-msg show ' + cls;
    p.msgT = dur;
    // Animation neu starten
    void p.msg.offsetWidth;
    p.msg.classList.add('pop');
    if (sub) {
      p.sub.textContent = sub;
      p.sub.classList.add('show');
      p.subT = dur;
    }
  }
  function countdown(text, cls = '') {
    for (const p of panels) {
      p.count.textContent = text;
      p.count.className = 'hud-count show ' + cls;
      void p.count.offsetWidth;
      p.count.classList.add('pop');
      p.countT = text ? 0.9 : 0;
    }
  }

  function update(race, dt, time) {
    for (const p of panels) {
      const k = p.k;
      // Gegenstand / Roulette
      if (k.rollT > 0) {
        p.rollT += dt;
        if (p.rollT > 0.07) {
          p.rollT = 0;
          const it = ITEM_ORDER[Math.floor(Math.random() * ITEM_ORDER.length)];
          p.icon.innerHTML = ICONS[it];
          p.icon.className = 'icon rolling';
          p.onRoll?.();
        }
        p.lastItem = 'roll';
        p.itemName.textContent = '';
      } else if (k.item !== p.lastItem) {
        p.lastItem = k.item;
        p.icon.innerHTML = k.item ? ICONS[k.item] : '';
        p.icon.className = 'icon' + (k.item ? ' got' : '');
        p.itemName.textContent = k.item ? ITEMS[k.item].name : '';
        p.el.querySelector('.slot').classList.toggle('attack', ITEMS[k.item]?.kind === 'attack');
        p.el.querySelector('.slot').classList.toggle('upgrade', ITEMS[k.item]?.kind === 'upgrade');
      }
      p.charges.textContent = k.item && (k.item === 'turbo' || k.item === 'triple') ? `×${k.itemCharges}` : '';
      // Runde und Zeit
      const lapNo = Math.max(1, Math.min(race.laps, k.lap + 1));
      p.lap.textContent = k.finished ? race.laps : lapNo;
      p.time.textContent = fmtTime(k.finished ? k.finishTime : Math.max(0, race.time));
      // Platz
      if (k.rank !== p.lastRank) {
        p.num.textContent = k.rank + 1;
        p.pos.className = 'hud-pos r' + (k.rank + 1) + (p.lastRank >= 0 ? (k.rank < p.lastRank ? ' up' : ' down') : '');
        void p.pos.offsetWidth;
        p.pos.classList.add('bump');
        p.lastRank = k.rank;
      }
      // Käse-Level
      if (k.cheese !== p.lastCheese) {
        p.cnt.textContent = k.cheese;
        p.bar.style.width = `${(k.cheese / MAX_CHEESE) * 100}%`;
        p.el.querySelector('.hud-cheese').classList.toggle('max', k.cheese >= MAX_CHEESE);
        if (p.lastCheese >= 0) {
          const c = p.el.querySelector('.hud-cheese');
          c.classList.remove('gain', 'loss');
          void c.offsetWidth;
          c.classList.add(k.cheese > p.lastCheese ? 'gain' : 'loss');
        }
        p.lastCheese = k.cheese;
      }
      // Drift-Ladung
      p.drift.className = 'hud-drift' + (k.drift ? ' on l' + k.driftLevel : '');
      // Meldungen ausblenden
      if (p.msgT > 0 && (p.msgT -= dt) <= 0) p.msg.classList.remove('show');
      if (p.subT > 0 && (p.subT -= dt) <= 0) p.sub.classList.remove('show');
      if (p.countT > 0 && (p.countT -= dt) <= 0) p.count.classList.remove('show');
      // Falsche Richtung
      const tdot = (k.vx * k.loc.tx + k.vz * k.loc.tz) / Math.max(1, Math.hypot(k.vx, k.vz));
      const fdot = Math.sin(k.heading) * k.loc.tx + Math.cos(k.heading) * k.loc.tz;
      if (!k.finished && race.time > 0 && fdot < -0.4 && (Math.hypot(k.vx, k.vz) < 3 || tdot < -0.3)) p.wrongT += dt;
      else p.wrongT = 0;
      p.wrong.classList.toggle('show', p.wrongT > 1.2);
      p.el.classList.toggle('golden', k.goldenT > 0);
    }
    drawMini(race, time);
    if (rankList) {
      const order = race.kartsByRank();
      const items = rankList.children;
      const step = Math.max(30, Math.min(50, (window.innerHeight - 320) / 8));
      rankList.style.setProperty('--rk', `${step - 6}px`);
      order.forEach((k, i) => {
        const el = items[k.idx];
        el.style.transform = `translateY(${i * step}px)`;
        el.querySelector('span').textContent = i + 1;
        el.classList.toggle('me', k.human >= 0);
        el.classList.toggle('fin', k.finished);
      });
    }
  }

  function drawMini(race, time) {
    if (!miniCtx) return;
    const g = miniCtx;
    const { path, map } = miniTrack;
    g.clearRect(0, 0, 360, 360);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 20;
    g.stroke(path);
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 11;
    g.stroke(path);
    g.strokeStyle = 'rgba(70,70,80,0.9)';
    g.lineWidth = 7;
    g.stroke(path);
    // Start
    const s0 = map(race.track.x[0], race.track.z[0]);
    g.fillStyle = '#fff';
    g.fillRect(s0[0] - 6, s0[1] - 6, 12, 12);
    // Käsekisten
    g.fillStyle = 'rgba(255,190,60,0.9)';
    for (const b of race.boxes) {
      if (b.respawn > 0) continue;
      const [x, y] = map(b.x, b.z);
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const p of race.projectiles) {
      const [x, y] = map(p.x, p.z);
      g.fillStyle = p.type === 'rocket' ? '#ff3a2a' : '#ffd34d';
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
    // Karts (Menschen zuletzt, größer)
    const ks = [...race.karts].sort((a, b) => (a.human >= 0) - (b.human >= 0));
    for (const k of ks) {
      const [x, y] = map(k.x, k.z);
      const me = k.human >= 0;
      g.fillStyle = k.driver.kart;
      g.strokeStyle = me ? '#fff' : 'rgba(0,0,0,0.7)';
      g.lineWidth = me ? 4 : 2;
      g.beginPath();
      g.arc(x, y, me ? 11 : 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (me) {
        g.fillStyle = '#111';
        g.font = '900 13px "Barlow Condensed", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`P${k.human + 1}`, x, y + 1);
      }
    }
    void time;
  }

  return {
    build,
    update,
    message,
    countdown,
    panels,
    show(on) {
      root.classList.toggle('hidden', !on);
    },
  };
}

// Streckenumriss für Minikarte und Vorschauen
export function trackPath(track, size, pad = 20) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]);
    maxZ = Math.max(maxZ, track.z[i]);
  }
  const sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (size - (maxX - minX) * sc) / 2;
  const oz = (size - (maxZ - minZ) * sc) / 2;
  // x gespiegelt, damit die Karte zur Draufsicht passt (Blick nach +z = oben)
  const map = (x, z) => [size - (ox + (x - minX) * sc), size - (oz + (z - minZ) * sc)];
  const path = new Path2D();
  for (let i = 0; i <= track.n; i += 3) {
    const [x, y] = map(track.x[i % track.n], track.z[i % track.n]);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return { path, map };
}
