// HUD: Ressourcen, Wellenkarte, Boss-Balken, Bauleiste, Fähigkeiten und Turm-Inspektor.
import { TOWERS, TOWER_ORDER, ENEMIES, ENEMY_UNLOCK, ABILITIES, TARGETING, TILE_BONUS, MAX_LEVEL, MODULE_LEVEL, RANKS } from '../game/data.js';
import { MAPS } from '../game/maps.js';
import { t, tower, enemy, num, fmt, pct } from '../i18n.js';

const $ = (id) => document.getElementById(id);

// Welche Karte schaltet einen Turm frei?
export function unlockMapOf(type) {
  return MAPS.find((m) => m.towers.includes(type));
}

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

  // Nach Sprachwechsel alles neu beschriften
  relabel() {
    this.last = {};
    this.sig = '';
    if (this.game) this.setGame(this.game);
    for (const [key, b] of Object.entries(this.abilityEls)) b.title = `${t(`ability.${key}.name`)} (${ABILITIES[key].key}) – ${t(`ability.${key}.desc`)}`;
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
      const allowed = game.allowed.has(type);
      const tw = tower(type);
      const b = document.createElement('button');
      b.className = 'tcard' + (allowed ? '' : ' locked');
      if (allowed) this.keys.push(type);
      const key = allowed ? this.keys.length : null;
      const keyLabel = key == null ? '' : key === 10 ? '0' : key === 11 ? 'ß' : String(key);
      const lockMap = unlockMapOf(type);
      b.title = allowed ? `${tw.name} – ${tw.blurb}` : t('ui.hud.lockedTower', { name: tw.name, map: t(`map.${lockMap?.id}.name`) });
      b.innerHTML = `<span class="key">${keyLabel}</span><img alt="" src="${this.thumbs.towers[type] || ''}"><span class="nm">${tw.name}</span><span class="cost">${allowed ? game.costOf(type) : '🔒'}</span>`;
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
      b.innerHTML = `<span class="sym" style="background:radial-gradient(circle at 35% 30%, #fff 0 15%, ${d.color} 45%, transparent 72%)"></span><span class="t"></span><span class="cd"></span><span class="k">${d.key}</span>`;
      b.addEventListener('click', () => this.a.ability(key));
      box.appendChild(b);
      this.abilityEls[key] = b;
    }
    this.relabel();
  }

  // ---------- Laufende Aktualisierung ----------
  update(game, ui) {
    const set = (id, v, html = false) => {
      if (this.last[id] !== v) {
        this.last[id] = v;
        if (html) $(id).innerHTML = v;
        else $(id).textContent = v;
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
      title = t('ui.hud.firstWave');
      timer = t('ui.hud.ready');
      label = t('ui.hud.start');
    } else if (game.nextWaveT != null) {
      title = t('ui.hud.waveIn', { n: next });
      timer = t('ui.hud.seconds', { n: Math.ceil(game.nextWaveT) });
      label = t('ui.hud.call', { n: game.earlyBonus() });
    } else if (game.state === 'running') {
      title = game.endless ? t('ui.hud.endless') : t('ui.hud.lastWave');
      timer = t('ui.hud.left', { n: game.enemies.length });
      label = t('ui.hud.running');
      canCall = false;
    } else {
      title = game.state === 'won' ? t('ui.hud.cleared') : t('ui.hud.over');
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
          const en = enemy(type);
          c.className = 'chip' + (ENEMIES[type].boss ? ' boss' : '') + (isNew ? ' new' : '');
          c.dataset.badge = t('ui.hud.newBadge');
          c.title = `${count}× ${en.name} – ${en.blurb}`;
          c.innerHTML = `<img alt="" src="${this.thumbs.enemies[type] || ''}"><span>${count}</span>`;
          box.appendChild(c);
        }
      }
    }

    // Boss-Balken
    const boss = game.enemies.find((e) => e.boss && e.alive);
    $('boss-bar').classList.toggle('hidden', !boss);
    if (boss) {
      const en = enemy(boss.type);
      set('boss-name', en.name);
      set('boss-ability', en.ability || '');
      $('boss-hp').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
      $('boss-shield').style.width = boss.maxShield ? `${(boss.shield / boss.maxShield) * 100}%` : '0%';
      $('boss-bar').classList.toggle('phased', boss.phaseT > 0);
      $('boss-bar').classList.toggle('windup', boss.windup > 0);
    }

    // Bauleiste
    for (const [type, b] of this.buildCards) {
      const poor = game.coins < game.costOf(type);
      b.classList.toggle('poor', poor && game.allowed.has(type));
      b.classList.toggle('on', ui.buildType === type);
    }

    // Fähigkeiten
    for (const [key, b] of Object.entries(this.abilityEls)) {
      const cd = game.abilities[key];
      const max = ABILITIES[key].cooldown * game.mods.cooldown;
      const ready = game.abilityReady(key);
      b.classList.toggle('ready', ready);
      b.classList.toggle('armed', ui.ability === key);
      b.querySelector('.cd').style.setProperty('--p', `${(cd / max) * 100}%`);
      const tx = cd > 0 ? String(Math.ceil(cd)) : '';
      const tEl = b.querySelector('.t');
      if (tEl.textContent !== tx) tEl.textContent = tx;
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
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3700);
  }

  hint(text) {
    const h = $('hint');
    h.classList.toggle('hidden', !text);
    if (text) h.innerHTML = text;
  }

  // ---------- Inspektor ----------
  statRows(tw, game) {
    const s = tw.stats;
    const d = tw.def;
    const base = game.levelStats(tw.type, tw.level, tw.module);
    const next = tw.level < MAX_LEVEL && !game.needsModule(tw) ? game.levelStats(tw.type, tw.level + 1, tw.module) : null;
    const up = (k, f = (x) => num(x)) => {
      if (!next || next[k] == null || base[k] == null) return '';
      const mult = base[k] ? s[k] / base[k] : 1;
      const delta = (next[k] - base[k]) * mult;
      return Math.abs(delta) > 1e-6 ? `<span class="up">+${f(delta)}</span>` : '';
    };
    const rows = [];
    const add = (label, val, k, f) => rows.push(`<dt>${t(`ui.stat.${label}`)}</dt><dd>${val}${k ? up(k, f) : ''}</dd>`);
    switch (d.kind) {
      case 'support':
        add('buffDmg', `+${pct(s.buffDmg)}`, 'buffDmg', pct);
        add('buffRate', `+${pct(s.buffRate)}`, 'buffRate', pct);
        add('radius', t('ui.stat.tiles', { v: num(s.range) }));
        if (s.buffRange) add('buffRange', `+${pct(s.buffRange)}`);
        if (s.buffBounty) add('buffBounty', `+${pct(s.buffBounty)}`);
        break;
      case 'economy':
        add('income', `${Math.round(s.income)}`, 'income', (x) => num(x, 0));
        if (s.interest) add('interest', t('ui.stat.interestVal', { p: pct(s.interest), m: 40 + 10 * tw.level }));
        if (s.killBonus) add('killBonus', t('ui.stat.killBonusVal', { v: s.killBonus }));
        add('minted', fmt(tw.earned || 0));
        break;
      default: {
        add(d.kind === 'cone' || d.kind === 'beam' ? 'dps' : d.kind === 'pulse' ? 'perPulse' : 'dmg', num(s.dmg), 'dmg');
        if (d.kind !== 'cone' && d.kind !== 'beam') add(d.kind === 'pulse' ? 'pulses' : 'shots', num(s.rate, 2), 'rate', (x) => num(x, 2));
        add('range', num(s.range), 'range', (x) => num(x, 2));
        if (s.minRange) add('minRange', num(s.minRange));
        if (s.splash) add('splash', num(s.splash, 2), 'splash', (x) => num(x, 2));
        if (s.slow) add('slow', pct(s.slow), 'slow', pct);
        if (s.chains) add('jumps', String(Math.floor(s.chains)), 'chains', (x) => (x >= 1 ? String(Math.floor(x)) : num(x, 2)));
        if (s.crit) add('crit', `${pct(s.crit)} · ×${num(s.critMul)}`);
        if (s.poisonDps) add('poison', t('ui.stat.perSec', { v: num(s.poisonDps), d: s.poisonDur }), 'poisonDps');
        if (s.corrosion) add('corrosion', t('ui.stat.corrosionVal', { v: num(s.corrosion, 2) }), 'corrosion', (x) => num(x, 2));
        if (s.burnDps) add('burn', t('ui.stat.perSec', { v: num(s.burnDps), d: s.burnDur }), 'burnDps');
        if (s.cone) add('cone', `${s.cone}°`);
        if (s.ramp) add('ramp', t('ui.stat.rampVal', { x: num(s.ramp), s: num(s.rampTime) }));
        if (s.salvo) add('salvo', String(s.salvo));
        if (s.airMul && s.airMul > 1) add('vsAir', `×${num(s.airMul)}`);
      }
    }
    return rows.join('');
  }

  inspectorSig(tw, game) {
    return [tw.id, tw.level, tw.module, tw.targeting, tw.rank, game.canUpgrade(tw), game.sellValue(tw), tw.buffedBy, tw.disabledT > 0, Math.floor(game.coins / 5)].join('|');
  }

  updateInspector(game, tw) {
    const box = $('inspector');
    if (!tw || !tw.alive) {
      if (!box.classList.contains('hidden')) box.classList.add('hidden');
      this.sig = '';
      return;
    }
    box.classList.remove('hidden');
    const sig = this.inspectorSig(tw, game);
    if (sig !== this.sig) {
      this.sig = sig;
      this.renderInspector(game, tw);
    }
    const k = box.querySelector('[data-live="kills"]');
    if (k) k.textContent = t('ui.insp.kills', { k: tw.kills, d: fmt(tw.dealt) });
    const dis = box.querySelector('[data-live="disabled"]');
    if (dis) dis.textContent = t('ui.insp.disabledDesc', { n: Math.ceil(tw.disabledT) });
    const bar = box.querySelector('.xp .bar i');
    if (bar) {
      const lo = RANKS[tw.rank];
      const hi = RANKS[tw.rank + 1];
      bar.style.width = hi ? `${Math.min(100, ((tw.xp - lo) / (hi - lo)) * 100)}%` : '100%';
    }
  }

  renderInspector(game, tw) {
    const d = tw.def;
    const tx = tower(tw.type);
    const box = $('inspector');
    const cost = game.upgradeCost(tw);
    const needsModule = game.needsModule(tw);
    const attacker = d.kind !== 'support' && d.kind !== 'economy';
    const stars = '★'.repeat(tw.rank) + '☆'.repeat(Math.max(0, 10 - tw.rank));
    let html = `<div class="insp-head"><img alt="" src="${this.thumbs.towers[tw.type] || ''}"><div><h3>${tx.name}</h3><div class="lvl">${t('ui.insp.level', { l: tw.level, max: MAX_LEVEL })}${d.dmgType ? ` · ${t(`dmg.${d.dmgType}`)}` : ''}</div></div><button class="x" data-act="close" aria-label="${t('ui.insp.close')}">✕</button></div>`;
    if (tw.disabledT > 0) html += `<div class="note warn"><span class="tag">${t('ui.insp.disabled')}</span><span data-live="disabled"></span></div>`;
    if (attacker) {
      html += `<div class="xp"><span class="stars" title="${t('ui.insp.rankTip', { r: tw.rank, d: tw.rank * 4, g: num(tw.rank * 1.5) })}">${stars}</span><span class="bar"><i></i></span></div>`;
      html += `<div class="note" data-live="kills"></div>`;
    }
    html += `<dl class="stats">${this.statRows(tw, game)}</dl>`;
    const notes = [];
    if (tw.tile !== '#') notes.push(`<span class="tag" style="color:${TILE_BONUS[tw.tile].color}">${t(`tile.${tw.tile}.name`)}</span>${t(`tile.${tw.tile}.desc`)}`);
    if (tw.buffedBy) notes.push(`<span class="tag" style="color:#ffe7a3">${t('ui.insp.resonance')}</span>${t('ui.insp.resonanceDesc')}`);
    if (attacker) notes.push(t('ui.insp.hits', { what: [d.ground && t('ui.insp.ground'), d.air && t('ui.insp.air')].filter(Boolean).join(` ${t('ui.insp.and')} `) }));
    if (notes.length) html += `<div class="note">${notes.join('<br>')}</div>`;

    if (attacker) {
      html += `<div class="section-label">${t('ui.insp.targeting')} <kbd>T</kbd></div><div class="targeting">${TARGETING.map((m) => `<button data-target="${m.key}" title="${t('ui.insp.targetTip', { name: t(`target.${m.key}.name`) })}" class="${tw.targeting === m.key ? 'on' : ''}">${t(`target.${m.key}.short`)}</button>`).join('')}</div>`;
    }

    html += `<div class="section-label">${t('ui.insp.modules')} ${tw.level < MODULE_LEVEL ? t('ui.insp.fromLevel', { l: MODULE_LEVEL }) : ''}</div><div class="modules">`;
    tx.mods.forEach(([name, desc], i) => {
      let cls = 'module';
      if (needsModule) cls += ' pick';
      else if (tw.module === i) cls += ' chosen';
      else cls += ' dim';
      html += `<button class="${cls}" data-module="${i}" ${needsModule ? '' : 'disabled'}><b>${name}</b><span>${desc}</span></button>`;
    });
    html += `<div class="module master ${tw.level >= MAX_LEVEL ? 'chosen' : 'dim'}"><b>${t('ui.insp.mastery')} · ${tx.master[0]}</b><span>${tx.master[1]}</span></div></div>`;

    const upLabel = cost == null ? t('ui.insp.maxLevel') : needsModule ? t('ui.insp.chooseFirst') : `${t('ui.insp.upgrade')} <small>${t('ui.insp.upgradeCost', { c: cost })}</small>`;
    html += `<div class="insp-actions"><button class="primary" data-act="upgrade" ${game.canUpgrade(tw) ? '' : 'disabled'}>${upLabel}</button><button class="ghost" data-act="sell" title="${t('ui.insp.sellTip')}">${t('ui.insp.sell')} <small>+${game.sellValue(tw)}${tw.fresh ? ` ${t('ui.insp.full')}` : ''}</small></button></div>`;
    box.innerHTML = html;
    box.querySelector('[data-act="close"]').onclick = () => this.a.deselect();
    box.querySelector('[data-act="upgrade"]').onclick = () => this.a.upgrade(tw);
    box.querySelector('[data-act="sell"]').onclick = () => this.a.sell(tw);
    for (const b of box.querySelectorAll('[data-target]')) b.onclick = () => this.a.setTargeting(tw, b.dataset.target);
    for (const b of box.querySelectorAll('[data-module]')) b.onclick = () => this.a.chooseModule(tw, Number(b.dataset.module));
    this.updateInspector(game, tw);
  }
}
