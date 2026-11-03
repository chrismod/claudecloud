// HUD: Ressourcen, Wellenkarte, Bauleiste, Fähigkeiten und Turm-Inspektor.
import { TOWERS, TOWER_ORDER, ENEMIES, ENEMY_UNLOCK, ABILITIES, TARGETING, TILE_BONUS, DAMAGE_TYPES, MAX_LEVEL, MODULE_LEVEL, RANKS } from '../game/data.js';
import { MAPS } from '../game/maps.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.floor(n)));
const num = (n, d = 1) => {
  if (n >= 1000) return fmt(n);
  const s = n.toFixed(d);
  return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',');
};
const pct = (x) => `${Math.round(x * 100)} %`;

// Welche Karte schaltet einen Turm frei?
export function unlockMapOf(type) {
  return MAPS.find((m) => m.towers.includes(type));
}

const ABILITY_SYM = { meteor: '☄', blizzard: '❄', overdrive: '⚡' };

export class Hud {
  constructor(actions, thumbs) {
    this.a = actions;
    this.thumbs = thumbs;
    this.last = {};
    this.sig = '';
    this.buildCards = new Map();
    this.abilityEls = {};
    $('btn-wave').addEventListener('click', () => this.a.callWave());
    $('btn-pause').addEventListener('click', () => this.a.togglePause());
    $('btn-sound').addEventListener('click', () => this.a.toggleMute());
    $('btn-menu').addEventListener('click', () => this.a.openPause());
    $('btn-view').addEventListener('click', () => this.a.resetView());
    for (const b of $('speed').querySelectorAll('button')) b.addEventListener('click', () => this.a.setSpeed(Number(b.dataset.speed)));
    this.buildAbilities();
  }

  // ---------- Aufbau pro Spiel ----------
  setGame(game) {
    this.game = game;
    this.sig = '';
    this.last = {};
    $('goal').textContent = `/${game.goal}`;
    const bar = $('build-bar');
    bar.innerHTML = '';
    this.buildCards.clear();
    this.keys = [];
    for (const type of TOWER_ORDER) {
      const d = TOWERS[type];
      const allowed = game.allowed.has(type);
      const b = document.createElement('button');
      b.className = 'tcard' + (allowed ? '' : ' locked');
      if (allowed) this.keys.push(type);
      const key = allowed ? this.keys.length : null;
      const keyLabel = key == null ? '' : key === 10 ? '0' : key === 11 ? 'ß' : String(key);
      const lockMap = unlockMapOf(type);
      b.title = allowed ? `${d.name} – ${d.blurb}` : `${d.name}: wird auf der Karte „${lockMap?.name}“ freigeschaltet`;
      b.innerHTML = `<span class="key">${keyLabel}</span><img alt="" src="${this.thumbs.towers[type] || ''}"><span class="nm">${d.name}</span><span class="cost">${allowed ? d.cost : '🔒'}</span>`;
      b.disabled = !allowed;
      b.addEventListener('click', () => this.a.selectBuild(type));
      bar.appendChild(b);
      this.buildCards.set(type, b);
    }
  }

  keyType(i) {
    return this.keys?.[i];
  }

  buildAbilities() {
    const box = $('abilities');
    for (const [key, d] of Object.entries(ABILITIES)) {
      const b = document.createElement('button');
      b.className = 'ability';
      b.style.setProperty('--c', d.color);
      b.title = `${d.name} (${d.key}) – ${d.desc}`;
      b.innerHTML = `<span class="sym" style="background:radial-gradient(circle at 35% 30%, #fff 0 15%, ${d.color} 45%, transparent 72%)"></span><span class="t"></span><span class="cd"></span><span class="k">${d.key}</span>`;
      b.addEventListener('click', () => this.a.ability(key));
      box.appendChild(b);
      this.abilityEls[key] = b;
    }
  }

  // ---------- Laufende Aktualisierung ----------
  update(game, ui) {
    const set = (id, v) => {
      if (this.last[id] !== v) {
        this.last[id] = v;
        $(id).textContent = v;
      }
    };
    set('lives', String(game.lives));
    set('coins', fmt(game.coins));
    set('wave', String(game.wave));

    // Wellenkarte
    const next = game.wave + 1;
    const btn = $('btn-wave');
    let title;
    let timer;
    let label;
    let canCall = game.canCallWave();
    if (game.state === 'ready') {
      title = 'Erste Welle';
      timer = 'bereit';
      label = 'Start <kbd>Leertaste</kbd>';
    } else if (game.nextWaveT != null) {
      title = `Welle ${next} in`;
      timer = `${Math.ceil(game.nextWaveT)} s`;
      const bonus = game.earlyBonus();
      label = `Rufen <b>+${bonus}</b>`;
    } else if (game.state === 'running') {
      title = game.endless ? 'Endlos' : 'Letzte Welle';
      timer = `${game.enemies.length} übrig`;
      label = 'läuft';
      canCall = false;
    } else {
      title = game.state === 'won' ? 'Geschafft' : 'Vorbei';
      timer = '';
      label = '—';
      canCall = false;
    }
    set('wave-title', title);
    set('wave-timer', timer);
    if (this.last.waveBtn !== label) {
      this.last.waveBtn = label;
      btn.innerHTML = label;
      btn.classList.toggle('gold', game.state !== 'ready');
    }
    btn.disabled = !canCall;
    const showNext = game.state === 'ready' || game.nextWaveT != null;
    const wn = game.state === 'ready' ? 1 : next;
    const listKey = showNext ? `w${wn}` : 'none';
    if (this.last.list !== listKey) {
      this.last.list = listKey;
      const box = $('wave-list');
      box.innerHTML = '';
      if (showNext) {
        const p = game.previewWave(wn);
        for (const { type, count } of p.list) {
          const c = document.createElement('div');
          const isNew = ENEMY_UNLOCK[type] === wn;
          c.className = 'chip' + (ENEMIES[type].boss ? ' boss' : '') + (isNew ? ' new' : '');
          c.title = `${count}× ${ENEMIES[type].name} – ${ENEMIES[type].blurb}`;
          c.innerHTML = `<img alt="" src="${this.thumbs.enemies[type] || ''}"><span>${count}</span>`;
          box.appendChild(c);
        }
      }
    }

    // Bauleiste
    for (const [type, b] of this.buildCards) {
      const poor = game.coins < TOWERS[type].cost;
      b.classList.toggle('poor', poor && game.allowed.has(type));
      b.classList.toggle('on', ui.buildType === type);
    }

    // Fähigkeiten
    for (const [key, b] of Object.entries(this.abilityEls)) {
      const cd = game.abilities[key];
      const max = ABILITIES[key].cooldown;
      const ready = game.abilityReady(key);
      b.classList.toggle('ready', ready);
      b.classList.toggle('armed', ui.ability === key);
      b.querySelector('.cd').style.setProperty('--p', `${(cd / max) * 100}%`);
      const t = cd > 0 ? String(Math.ceil(cd)) : '';
      const tEl = b.querySelector('.t');
      if (tEl.textContent !== t) tEl.textContent = t;
      b.querySelector('.sym').style.opacity = cd > 0 ? 0.35 : 1;
    }

    $('btn-pause').classList.toggle('on', ui.paused);
    for (const b of $('speed').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.speed) === ui.speed);
    $('btn-sound').style.opacity = ui.muted ? 0.45 : 1;

    this.updateInspector(game, ui.selected);
  }

  flash(id, cls) {
    const el = $(id).parentElement;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  toast(html, kind = '') {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = html;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 3700);
  }

  hint(text) {
    const h = $('hint');
    h.classList.toggle('hidden', !text);
    if (text) h.innerHTML = text;
  }

  // ---------- Inspektor ----------
  statRows(t, game) {
    const s = t.stats;
    const d = t.def;
    const base = game.levelStats(t.type, t.level, t.module);
    const next = t.level < MAX_LEVEL && !game.needsModule(t) ? game.levelStats(t.type, t.level + 1, t.module) : null;
    const up = (k, f = (x) => num(x)) => {
      if (!next || next[k] == null || base[k] == null) return '';
      const mult = base[k] ? s[k] / base[k] : 1;
      const delta = (next[k] - base[k]) * mult;
      return Math.abs(delta) > 1e-6 ? `<span class="up">+${f(delta)}</span>` : '';
    };
    const rows = [];
    const add = (label, val, k, f) => rows.push(`<dt>${label}</dt><dd>${val}${k ? up(k, f) : ''}</dd>`);
    switch (d.kind) {
      case 'support':
        add('Schaden', `+${pct(s.buffDmg)}`, 'buffDmg', pct);
        add('Feuerrate', `+${pct(s.buffRate)}`, 'buffRate', pct);
        add('Radius', `${num(s.range)} Felder`);
        if (s.buffRange) add('Reichweite', `+${pct(s.buffRange)}`);
        if (s.buffBounty) add('Kopfgeld', `+${pct(s.buffBounty)}`);
        break;
      case 'economy':
        add('Prägung je Welle', `${Math.round(s.income)}`, 'income', (x) => num(x, 0));
        if (s.interest) add('Zinsen', `${pct(s.interest)} (max ${40 + 10 * t.level})`);
        if (s.killBonus) add('Kopfgeldbüro', `+${s.killBonus} im Umkreis`);
        add('Bisher geprägt', fmt(t.earned || 0));
        break;
      default: {
        const dmgLabel = d.kind === 'cone' || d.kind === 'beam' ? 'Schaden/s' : d.kind === 'pulse' ? 'Schaden je Puls' : 'Schaden';
        add(dmgLabel, num(s.dmg), 'dmg');
        if (d.kind !== 'cone' && d.kind !== 'beam') add(d.kind === 'pulse' ? 'Pulse/s' : 'Schüsse/s', num(s.rate, 2), 'rate', (x) => num(x, 2));
        add('Reichweite', num(s.range), 'range', (x) => num(x, 2));
        if (s.minRange) add('Mindestabstand', num(s.minRange));
        if (s.splash) add('Explosionsradius', num(s.splash, 2), 'splash', (x) => num(x, 2));
        if (s.slow) add('Verlangsamung', pct(s.slow), 'slow', pct);
        if (s.chains) add('Sprünge', String(Math.floor(s.chains)), 'chains', (x) => (x >= 1 ? String(Math.floor(x)) : num(x, 2)));
        if (s.crit) add('Kritisch', `${pct(s.crit)} · ×${num(s.critMul)}`);
        if (s.poisonDps) add('Gift', `${num(s.poisonDps)}/s · ${s.poisonDur} s`, 'poisonDps');
        if (s.corrosion) add('Korrosion', `−${num(s.corrosion, 2)} Panzerung`, 'corrosion', (x) => num(x, 2));
        if (s.burnDps) add('Brand', `${num(s.burnDps)}/s · ${s.burnDur} s`, 'burnDps');
        if (s.cone) add('Kegel', `${s.cone}°`);
        if (s.ramp) add('Aufladung', `bis ×${num(s.ramp)} in ${num(s.rampTime)} s`);
        if (s.salvo) add('Raketen je Salve', String(s.salvo));
        if (s.airMul && s.airMul > 1) add('Gegen Flieger', `×${num(s.airMul)}`);
      }
    }
    return rows.join('');
  }

  inspectorSig(t, game) {
    return [t.id, t.level, t.module, t.targeting, t.rank, game.canUpgrade(t), game.sellValue(t), t.buffedBy, Math.floor(game.coins / 5)].join('|');
  }

  updateInspector(game, t) {
    const box = $('inspector');
    if (!t || !t.alive) {
      if (!box.classList.contains('hidden')) box.classList.add('hidden');
      this.sig = '';
      return;
    }
    box.classList.remove('hidden');
    const sig = this.inspectorSig(t, game);
    if (sig !== this.sig) {
      this.sig = sig;
      this.renderInspector(game, t);
    }
    // Live-Werte
    const k = box.querySelector('[data-live="kills"]');
    if (k) k.textContent = `${t.kills} Kills · ${fmt(t.dealt)} Schaden`;
    const bar = box.querySelector('.xp .bar i');
    if (bar) {
      const lo = RANKS[t.rank];
      const hi = RANKS[t.rank + 1];
      bar.style.width = hi ? `${Math.min(100, ((t.xp - lo) / (hi - lo)) * 100)}%` : '100%';
    }
  }

  renderInspector(game, t) {
    const d = t.def;
    const box = $('inspector');
    const cost = game.upgradeCost(t);
    const needsModule = game.needsModule(t);
    const attacker = d.kind !== 'support' && d.kind !== 'economy';
    const stars = '★'.repeat(t.rank) + '☆'.repeat(Math.max(0, 10 - t.rank));
    let html = `<div class="insp-head"><img alt="" src="${this.thumbs.towers[t.type] || ''}"><div><h3>${d.name}</h3><div class="lvl">Stufe ${t.level}/${MAX_LEVEL}${d.dmgType ? ` · ${DAMAGE_TYPES[d.dmgType].name}` : ''}</div></div><button class="x" data-act="close" aria-label="Schließen">✕</button></div>`;
    if (attacker) {
      html += `<div class="xp"><span class="stars" title="Rang ${t.rank}: +${t.rank * 4} % Schaden, +${(t.rank * 1.5).toFixed(1).replace('.', ',')} % Reichweite">${stars}</span><span class="bar"><i></i></span></div>`;
      html += `<div class="note" data-live="kills"></div>`;
    }
    html += `<dl class="stats">${this.statRows(t, game)}</dl>`;
    const notes = [];
    if (t.tile !== '#') notes.push(`<span class="tag" style="color:${TILE_BONUS[t.tile].color}">${TILE_BONUS[t.tile].name}</span>${TILE_BONUS[t.tile].desc}`);
    if (t.buffedBy) notes.push('<span class="tag" style="color:#ffe7a3">Resonanz</span>von einem Resonator verstärkt');
    if (attacker) notes.push(`Trifft ${[d.ground && 'Boden', d.air && 'Luft'].filter(Boolean).join(' und ')}`);
    if (notes.length) html += `<div class="note">${notes.join('<br>')}</div>`;

    if (attacker) {
      html += `<div class="section-label">Zielwahl <kbd>T</kbd></div><div class="targeting">${TARGETING.map((m) => `<button data-target="${m.key}" title="${m.name} zuerst" class="${t.targeting === m.key ? 'on' : ''}">${m.short}</button>`).join('')}</div>`;
    }

    html += `<div class="section-label">Module ${t.level < MODULE_LEVEL ? `(ab Stufe ${MODULE_LEVEL})` : ''}</div><div class="modules">`;
    d.modules.forEach((m, i) => {
      let cls = 'module';
      if (needsModule) cls += ' pick';
      else if (t.module === i) cls += ' chosen';
      else cls += ' dim';
      html += `<button class="${cls}" data-module="${i}" ${needsModule ? '' : 'disabled'}><b>${m.name}</b><span>${m.desc}</span></button>`;
    });
    html += `<div class="module master ${t.level >= MAX_LEVEL ? 'chosen' : 'dim'}"><b>Meisterstufe · ${d.master.name}</b><span>${d.master.desc}</span></div></div>`;

    const upLabel = cost == null ? 'Maximale Stufe' : needsModule ? 'Erst Modul wählen' : `Aufrüsten <small>${cost} Münzen · U</small>`;
    html += `<div class="insp-actions"><button class="primary" data-act="upgrade" ${game.canUpgrade(t) ? '' : 'disabled'}>${upLabel}</button><button class="ghost" data-act="sell" title="Verkaufen (Entf)">Verkaufen <small>+${game.sellValue(t)}${t.fresh ? ' (voll)' : ''}</small></button></div>`;
    box.innerHTML = html;
    box.querySelector('[data-act="close"]').onclick = () => this.a.deselect();
    box.querySelector('[data-act="upgrade"]').onclick = () => this.a.upgrade(t);
    box.querySelector('[data-act="sell"]').onclick = () => this.a.sell(t);
    for (const b of box.querySelectorAll('[data-target]')) b.onclick = () => this.a.setTargeting(t, b.dataset.target);
    for (const b of box.querySelectorAll('[data-module]')) b.onclick = () => this.a.chooseModule(t, Number(b.dataset.module));
    this.updateInspector(game, t);
  }
}
