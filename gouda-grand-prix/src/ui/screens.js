// Menüs: Titel, Hauptmenü, Fahrerwahl, Streckenwahl, Pause, Ergebnis, Werkstatt, Siegerpodest, Steuerung.
// Jeder Bildschirm bekommt Menüereignisse { player, action } und meldet Entscheidungen per Callback.
import { DRIVERS, DIFFICULTIES, UPGRADES, ITEMS } from '../sim/config.js';
import { TRACKS } from '../sim/tracks.js';
import { buildTrack } from '../sim/track.js';
import { THEMES } from '../render/themes.js';
import { ICONS } from './icons.js';
import { trackPath, fmtTime } from './hud.js';

const $ = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export function createScreens(root, { sfx, padInfo }) {
  let current = null;
  function show(screen) {
    current?.el.remove();
    current = screen;
    if (screen) {
      root.appendChild(screen.el);
      requestAnimationFrame(() => screen.el.classList.add('in'));
    }
  }
  function nav(ev) {
    current?.onNav?.(ev);
  }

  // --- Titel -----------------------------------------------------------------------------------------
  function title(onStart) {
    const el = $(`<section class="screen title">
      <div class="logo">
        <div class="logo-wedge">${ICONS.cheese}</div>
        <h1><span>Gouda</span><span>Grand Prix</span></h1>
        <p>Käse-Kart-Rennen · bis zu 2 Spieler</p>
      </div>
      <div class="press">Drücke <kbd>A</kbd> oder <kbd>Enter</kbd></div>
      <div class="pads"></div>
    </section>`);
    const pads = el.querySelector('.pads');
    const refresh = () => (pads.innerHTML = padInfo());
    refresh();
    const iv = setInterval(refresh, 1000);
    return {
      el,
      onNav(ev) {
        if (ev.action === 'ok' || ev.action === 'start') {
          clearInterval(iv);
          sfx('ok');
          onStart();
        }
      },
    };
  }

  // --- Hauptmenü -------------------------------------------------------------------------------------
  function mainMenu(opts, onGo, onControls) {
    const rows = [
      { id: 'players', label: 'Spieler', values: ['1 Spieler', '2 Spieler · Splitscreen'], get: () => opts.players - 1, set: (v) => (opts.players = v + 1) },
      { id: 'mode', label: 'Modus', values: ['Grand Prix · 3 Rennen', 'Einzelrennen'], get: () => (opts.mode === 'gp' ? 0 : 1), set: (v) => (opts.mode = v ? 'single' : 'gp') },
      { id: 'diff', label: 'Käse-Schärfe', values: DIFFICULTIES.map((d) => d.name), get: () => DIFFICULTIES.findIndex((d) => d.id === opts.difficulty), set: (v) => (opts.difficulty = DIFFICULTIES[v].id) },
      { id: 'go', label: 'Los geht’s', action: onGo },
      { id: 'controls', label: 'Steuerung', action: onControls },
    ];
    const el = $(`<section class="screen menu">
      <header class="mini-logo"><div class="logo-wedge">${ICONS.cheese}</div><h2>Gouda Grand Prix</h2></header>
      <div class="menu-list"></div>
      <p class="menu-desc"></p>
      <div class="pads"></div>
      <footer class="nav-hint"><kbd>↑</kbd><kbd>↓</kbd> wählen · <kbd>←</kbd><kbd>→</kbd> ändern · <kbd>A</kbd>/<kbd>Enter</kbd> bestätigen</footer>
    </section>`);
    const list = el.querySelector('.menu-list');
    const desc = el.querySelector('.menu-desc');
    el.querySelector('.pads').innerHTML = padInfo();
    let sel = 3;
    function render() {
      list.innerHTML = rows
        .map((r, i) =>
          r.values
            ? `<div class="mrow ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="lbl">${r.label}</span><span class="val"><i class="arr">◀</i>${r.values[r.get()]}<i class="arr">▶</i></span></div>`
            : `<div class="mrow btn ${i === sel ? 'sel' : ''} ${r.id === 'go' ? 'primary' : ''}" data-i="${i}"><span class="lbl">${r.label}</span></div>`,
        )
        .join('');
      const d = DIFFICULTIES.find((x) => x.id === opts.difficulty);
      desc.innerHTML =
        rows[sel].id === 'diff'
          ? d.desc
          : rows[sel].id === 'mode'
            ? opts.mode === 'gp'
              ? 'Drei Strecken hintereinander. Punkte und Käsetaler sammeln, zwischen den Rennen in der Käse-Werkstatt aufrüsten.'
              : 'Ein Rennen auf einer Strecke deiner Wahl.'
            : rows[sel].id === 'players'
              ? opts.players === 2
                ? 'Bildschirm oben/unten geteilt. Jeder Spieler mit eigenem Gamepad – oder WASD und Pfeiltasten.'
                : 'Gegen sieben Käse-Mäuse.'
              : '&nbsp;';
    }
    render();
    list.addEventListener('click', (e) => {
      const r = e.target.closest('.mrow');
      if (!r) return;
      sel = Number(r.dataset.i);
      if (rows[sel].action) rows[sel].action();
      else rows[sel].set((rows[sel].get() + 1) % rows[sel].values.length);
      render();
    });
    return {
      el,
      onNav(ev) {
        const r = rows[sel];
        if (ev.action === 'up') (sel = (sel + rows.length - 1) % rows.length), sfx('move');
        else if (ev.action === 'down') (sel = (sel + 1) % rows.length), sfx('move');
        else if ((ev.action === 'left' || ev.action === 'right') && r.values) {
          const d = ev.action === 'left' ? -1 : 1;
          r.set((r.get() + d + r.values.length) % r.values.length);
          sfx('move');
        } else if (ev.action === 'ok') {
          if (r.action) (sfx('ok'), r.action());
          else (r.set((r.get() + 1) % r.values.length), sfx('move'));
        }
        render();
      },
    };
  }

  // --- Fahrerwahl ----------------------------------------------------------------------------------
  function driverSelect(players, portraits, initial, onDone, onBack) {
    const el = $(`<section class="screen drivers">
      <h2 class="screen-title">Wähle deine Käse-Maus</h2>
      <div class="dgrid">${DRIVERS.map(
        (d, i) => `<div class="dcard" data-i="${i}" style="--c:${d.kart};--a:${d.accent}">
          <img src="${portraits[d.id] ?? ''}" alt=""/>
          <div class="dname">${d.name}</div>
          <div class="cursors"></div>
        </div>`,
      ).join('')}</div>
      <div class="dinfo"></div>
      <footer class="nav-hint">Steuerkreuz wählen · <kbd>A</kbd> bestätigen · <kbd>B</kbd> zurück</footer>
    </section>`);
    const cur = initial.slice(0, players);
    const ready = Array(players).fill(false);
    const info = el.querySelector('.dinfo');
    const bar = (v) => `<div class="stat"><i style="width:${((v + 2) / 4) * 80 + 20}%"></i></div>`;
    function render() {
      el.querySelectorAll('.dcard').forEach((c, i) => {
        const cs = cur.map((ci, p) => (ci === i ? `<b class="cur p${p + 1} ${ready[p] ? 'ok' : ''}">P${p + 1}${ready[p] ? ' ✓' : ''}</b>` : '')).join('');
        c.querySelector('.cursors').innerHTML = cs;
        c.classList.toggle('sel', cur.includes(i));
      });
      info.innerHTML = cur
        .map((ci, p) => {
          const d = DRIVERS[ci];
          return `<div class="dpanel p${p + 1} ${ready[p] ? 'ok' : ''}" style="--c:${d.kart}">
            <img src="${portraits[d.id] ?? ''}" alt=""/>
            <div><h3>${players > 1 ? `<small>Spieler ${p + 1}</small>` : ''}${d.name}</h3>
            <p class="cheese">Lieblingskäse: ${d.cheese}</p>
            <div class="stats"><span>Tempo</span>${bar(d.speed)}<span>Beschleunigung</span>${bar(d.accel)}<span>Handling</span>${bar(d.handling)}<span>Gewicht</span>${bar(d.weight)}</div>
            ${ready[p] ? '<p class="ready">Bereit!</p>' : ''}</div></div>`;
        })
        .join('');
    }
    render();
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.dcard');
      if (!c) return;
      const p = ready.indexOf(false);
      if (p < 0) return;
      cur[p] = Number(c.dataset.i);
      ready[p] = true;
      sfx('ok');
      render();
      if (ready.every(Boolean)) onDone(cur.map((i) => DRIVERS[i].id));
    });
    return {
      el,
      onNav(ev) {
        const p = ev.player;
        if (p >= players) return;
        if (ev.action === 'back') {
          if (ready[p]) ready[p] = false;
          else return (sfx('back'), onBack());
          sfx('back');
        } else if (!ready[p]) {
          let i = cur[p];
          if (ev.action === 'left') i = (i + 7) % 8;
          if (ev.action === 'right') i = (i + 1) % 8;
          if (ev.action === 'up' || ev.action === 'down') i = (i + 4) % 8;
          if (i !== cur[p]) (cur[p] = i), sfx('move');
          if (ev.action === 'ok') {
            ready[p] = true;
            sfx('ok');
          }
        }
        render();
        if (ready.every(Boolean)) setTimeout(() => onDone(cur.map((i) => DRIVERS[i].id)), 350);
      },
    };
  }

  // --- Streckenwahl ------------------------------------------------------------------------------
  function trackPreview(def, size = 300) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const th = THEMES[def.theme];
    const gr = g.createLinearGradient(0, 0, 0, size);
    gr.addColorStop(0, th.zenith);
    gr.addColorStop(1, th.night ? '#3b1a1f' : th.grass[0]);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    const t = buildTrack(def);
    const { path } = trackPath(t, size, 34);
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 22;
    g.stroke(path);
    g.strokeStyle = th.curb[1];
    g.lineWidth = 15;
    g.stroke(path);
    g.strokeStyle = '#2a2a30';
    g.lineWidth = 9;
    g.stroke(path);
    return { url: c.toDataURL(), length: t.length };
  }
  const previews = new Map();
  const preview = (def) => {
    if (!previews.has(def.id)) previews.set(def.id, trackPreview(def));
    return previews.get(def.id);
  };

  function trackSelect(onPick, onBack) {
    let sel = 0;
    const el = $(`<section class="screen tracks">
      <h2 class="screen-title">Wähle die Strecke</h2>
      <div class="tgrid">${TRACKS.map((t, i) => {
        const p = preview(t);
        return `<div class="tcard" data-i="${i}"><img src="${p.url}" alt=""/><h3>${t.name}</h3><p>${t.blurb}</p><small>${(p.length / 1000).toFixed(2).replace('.', ',')} km · ${t.laps} Runden</small></div>`;
      }).join('')}</div>
      <footer class="nav-hint"><kbd>←</kbd><kbd>→</kbd> wählen · <kbd>A</kbd> Start · <kbd>B</kbd> zurück</footer>
    </section>`);
    const render = () => el.querySelectorAll('.tcard').forEach((c, i) => c.classList.toggle('sel', i === sel));
    render();
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.tcard');
      if (c) onPick(Number(c.dataset.i));
    });
    return {
      el,
      onNav(ev) {
        if (ev.action === 'left') (sel = (sel + TRACKS.length - 1) % TRACKS.length), sfx('move');
        if (ev.action === 'right') (sel = (sel + 1) % TRACKS.length), sfx('move');
        if (ev.action === 'ok') return (sfx('ok'), onPick(sel));
        if (ev.action === 'back') return (sfx('back'), onBack());
        render();
      },
    };
  }

  // --- Lade-/Ansagebildschirm ---------------------------------------------------------------------
  function loading(def, sub = '') {
    const p = preview(def);
    const el = $(`<section class="screen loading">
      <div class="load-card"><img src="${p.url}" alt=""/><div><small>${sub}</small><h2>${def.name}</h2><p>${def.blurb}</p><div class="spinner"></div></div></div>
    </section>`);
    return { el };
  }

  // --- Pause ----------------------------------------------------------------------------------------
  function pause(onResume, onRestart, onQuit) {
    const items = [
      ['Weiter', onResume],
      ['Neustart', onRestart],
      ['Aufgeben · Hauptmenü', onQuit],
    ];
    let sel = 0;
    const el = $(`<section class="screen pause"><div class="pause-card"><h2>Pause</h2><div class="menu-list"></div></div></section>`);
    const list = el.querySelector('.menu-list');
    const render = () => (list.innerHTML = items.map(([l], i) => `<div class="mrow btn ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="lbl">${l}</span></div>`).join(''));
    render();
    list.addEventListener('click', (e) => {
      const r = e.target.closest('.mrow');
      if (r) items[Number(r.dataset.i)][1]();
    });
    return {
      el,
      onNav(ev) {
        if (ev.action === 'up') (sel = (sel + 2) % 3), sfx('move');
        if (ev.action === 'down') (sel = (sel + 1) % 3), sfx('move');
        if (ev.action === 'ok') return (sfx('ok'), items[sel][1]());
        if (ev.action === 'back' || ev.action === 'start') return onResume();
        render();
      },
    };
  }

  // --- Ergebnis --------------------------------------------------------------------------------------
  function results({ def, rows, gp, raceNo, portraits }, onNext) {
    const el = $(`<section class="screen results">
      <div class="res-card">
        <h2 class="screen-title">${def.name} · Ergebnis${gp ? ` <small>Rennen ${raceNo}/3</small>` : ''}</h2>
        <table>${rows
          .map(
            (r, i) => `<tr class="${r.human >= 0 ? 'me' : ''}" style="--d:${i * 0.07}s;--c:${r.driver.kart}">
            <td class="rk">${i + 1}.</td><td class="pic"><img src="${portraits[r.driver.id] ?? ''}" alt=""/></td>
            <td class="nm">${r.driver.name}${r.human >= 0 ? ` <b class="tag">P${r.human + 1}</b>` : ''}</td>
            <td class="tm">${r.estimated ? '<span class="est">' + fmtTime(r.time) + '</span>' : fmtTime(r.time)}</td>
            <td class="ch">${ICONS.cheese}<span>${r.cheese}</span></td>
            ${gp ? `<td class="pt">+${r.points}</td><td class="tot">${r.total}</td>` : ''}
            ${r.coins ? `<td class="co">+${r.coins} Taler</td>` : '<td></td>'}
          </tr>`,
          )
          .join('')}</table>
        <p class="res-hint"><kbd>A</kbd>/<kbd>Enter</kbd> weiter</p>
      </div>
    </section>`);
    let armed = false;
    setTimeout(() => (armed = true), 900);
    el.addEventListener('click', () => armed && onNext());
    return {
      el,
      onNav(ev) {
        if (armed && (ev.action === 'ok' || ev.action === 'start')) (sfx('ok'), onNext());
      },
    };
  }

  // Nach einem Einzelrennen
  function afterSingle(onAgain, onTracks, onMenu) {
    const items = [
      ['Nochmal', onAgain],
      ['Andere Strecke', onTracks],
      ['Hauptmenü', onMenu],
    ];
    let sel = 0;
    const el = $(`<section class="screen pause"><div class="pause-card"><h2>Wie geht’s weiter?</h2><div class="menu-list"></div></div></section>`);
    const list = el.querySelector('.menu-list');
    const render = () => (list.innerHTML = items.map(([l], i) => `<div class="mrow btn ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="lbl">${l}</span></div>`).join(''));
    render();
    list.addEventListener('click', (e) => {
      const r = e.target.closest('.mrow');
      if (r) items[Number(r.dataset.i)][1]();
    });
    return {
      el,
      onNav(ev) {
        if (ev.action === 'up') (sel = (sel + 2) % 3), sfx('move');
        if (ev.action === 'down') (sel = (sel + 1) % 3), sfx('move');
        if (ev.action === 'ok') return (sfx('ok'), items[sel][1]());
        render();
      },
    };
  }

  // --- Käse-Werkstatt (Grand Prix) ---------------------------------------------------------------
  function garage({ players, wallets, upgrades, drivers, portraits, nextTrack }, onDone) {
    const sel = Array(players).fill(0);
    const done = Array(players).fill(false);
    const el = $(`<section class="screen garage">
      <h2 class="screen-title">Käse-Werkstatt <small>Nächstes Rennen: ${nextTrack.name}</small></h2>
      <div class="gcols"></div>
      <footer class="nav-hint"><kbd>↑</kbd><kbd>↓</kbd> wählen · <kbd>A</kbd> kaufen · „Fertig“ wenn alle bereit sind</footer>
    </section>`);
    const cols = el.querySelector('.gcols');
    const pips = (lvl) => [0, 1, 2].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    function render() {
      cols.innerHTML = Array.from({ length: players }, (_, p) => {
        const d = DRIVERS.find((x) => x.id === drivers[p]);
        return `<div class="gcol p${p + 1} ${done[p] ? 'ok' : ''}" style="--c:${d.kart}">
          <header><img src="${portraits[d.id] ?? ''}" alt=""/><div><small>Spieler ${p + 1}</small><h3>${d.name}</h3></div>
          <div class="wallet">${ICONS.cheese}<b>${wallets[p]}</b><span>Käsetaler</span></div></header>
          ${UPGRADES.map((u, i) => {
            const lvl = upgrades[p][u.id];
            const cost = u.costs[lvl];
            const cls = [i === sel[p] ? 'sel' : '', lvl >= 3 ? 'max' : cost > wallets[p] ? 'poor' : ''].join(' ');
            return `<div class="grow ${cls}"><div><b>${u.name}</b><small>${u.desc}</small></div><div class="pips">${pips(lvl)}</div><div class="cost">${lvl >= 3 ? 'MAX' : cost + ' T'}</div></div>`;
          }).join('')}
          <div class="grow btn ${sel[p] === UPGRADES.length ? 'sel' : ''}"><b>${done[p] ? 'Bereit ✓' : 'Fertig'}</b></div>
        </div>`;
      }).join('');
    }
    render();
    return {
      el,
      onNav(ev) {
        const p = ev.player;
        if (p >= players) return;
        if (done[p]) {
          if (ev.action === 'back' || ev.action === 'ok') (done[p] = false), sfx('back');
          render();
          return;
        }
        if (ev.action === 'up') (sel[p] = (sel[p] + UPGRADES.length) % (UPGRADES.length + 1)), sfx('move');
        if (ev.action === 'down') (sel[p] = (sel[p] + 1) % (UPGRADES.length + 1)), sfx('move');
        if (ev.action === 'ok') {
          if (sel[p] === UPGRADES.length) {
            done[p] = true;
            sfx('ok');
          } else {
            const u = UPGRADES[sel[p]];
            const lvl = upgrades[p][u.id];
            if (lvl < 3 && wallets[p] >= u.costs[lvl]) {
              wallets[p] -= u.costs[lvl];
              upgrades[p][u.id]++;
              sfx('buy');
            } else sfx('deny');
          }
        }
        render();
        if (done.every(Boolean)) setTimeout(onDone, 300);
      },
    };
  }

  // --- Siegerpodest ---------------------------------------------------------------------------------
  function podium({ standings, portraits }, onDone) {
    const top = standings.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    const el = $(`<section class="screen podium">
      <h2 class="screen-title">Grand Prix · Endstand</h2>
      <div class="pod">${order
        .map((s) => {
          const place = standings.indexOf(s) + 1;
          return `<div class="step s${place}" style="--c:${s.driver.kart}"><img src="${portraits[s.driver.id] ?? ''}" alt=""/><b>${s.driver.name}</b>${s.human >= 0 ? `<i class="tag">P${s.human + 1}</i>` : ''}<div class="block"><span>${place}</span><small>${s.points} Pkt.</small></div></div>`;
        })
        .join('')}</div>
      <ol class="rest">${standings
        .slice(3)
        .map((s) => `<li class="${s.human >= 0 ? 'me' : ''}">${s.driver.name}<span>${s.points} Pkt.</span></li>`)
        .join('')}</ol>
      <p class="res-hint"><kbd>A</kbd>/<kbd>Enter</kbd> zum Hauptmenü</p>
    </section>`);
    let armed = false;
    setTimeout(() => (armed = true), 1500);
    return {
      el,
      onNav(ev) {
        if (armed && ev.action === 'ok') (sfx('ok'), onDone());
      },
    };
  }

  // --- Steuerung ---------------------------------------------------------------------------------
  function controls(onBack) {
    const el = $(`<section class="screen controls">
      <h2 class="screen-title">Steuerung</h2>
      <div class="ctable">
        <table>
          <tr><th></th><th>Gamepad</th><th>Spieler 1 · Tastatur</th><th>Spieler 2 · Tastatur</th></tr>
          <tr><td>Gas</td><td><kbd>A</kbd> / <kbd>RT</kbd></td><td><kbd>W</kbd></td><td><kbd>↑</kbd></td></tr>
          <tr><td>Bremse / Rückwärts</td><td><kbd>B</kbd> / <kbd>LT</kbd></td><td><kbd>S</kbd></td><td><kbd>↓</kbd></td></tr>
          <tr><td>Lenken</td><td>Linker Stick / Steuerkreuz</td><td><kbd>A</kbd> <kbd>D</kbd></td><td><kbd>←</kbd> <kbd>→</kbd></td></tr>
          <tr><td>Hüpfen &amp; Driften</td><td><kbd>RB</kbd> / <kbd>LB</kbd> halten</td><td><kbd>Shift</kbd> links</td><td><kbd>Shift</kbd> rechts / <kbd>Strg</kbd> rechts</td></tr>
          <tr><td>Gegenstand</td><td><kbd>X</kbd> (Stick ↓ = nach hinten)</td><td><kbd>Leertaste</kbd></td><td><kbd>Enter</kbd> / <kbd>Num 0</kbd></td></tr>
          <tr><td>Rückspiegel</td><td><kbd>Y</kbd></td><td><kbd>Q</kbd></td><td><kbd>Ende</kbd></td></tr>
          <tr><td>Pause</td><td><kbd>Start</kbd></td><td colspan="2"><kbd>Esc</kbd></td></tr>
        </table>
        <div class="tips">
          <h3>Tipps</h3>
          <p><b>Drift-Turbo:</b> Beim Lenken Drift halten. Funken werden blau → orange → lila. Loslassen gibt einen Schub.</p>
          <p><b>Raketenstart:</b> Gas genau dann geben, wenn die dritte Lampe angeht. Zu früh – der Motor säuft ab.</p>
          <p><b>Käsestücke</b> machen dich schneller (bis 10). Bei Treffern verlierst du welche.</p>
          <div class="ilist">${Object.entries(ITEMS)
            .map(([id, it]) => `<div class="it ${it.kind}"><span class="ii">${ICONS[id]}</span><b>${it.name}</b><small>${it.desc}</small></div>`)
            .join('')}</div>
        </div>
      </div>
      <footer class="nav-hint"><kbd>B</kbd> / <kbd>Esc</kbd> zurück</footer>
    </section>`);
    el.addEventListener('click', () => onBack());
    return {
      el,
      onNav(ev) {
        if (ev.action === 'back' || ev.action === 'ok' || ev.action === 'start') (sfx('back'), onBack());
      },
    };
  }

  return { show, nav, title, mainMenu, driverSelect, trackSelect, loading, pause, results, afterSingle, garage, podium, controls, get current() {
    return current;
  } };
}
