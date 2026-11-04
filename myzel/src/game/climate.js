// Jahreszeiten und Wetter. Reine Logik: liefert Gewichte für die Darstellung und Faktoren für die
// Simulation. Ein Jahr hat 4 Jahreszeiten zu je DAYS_PER_SEASON Spieltagen.

export const DAYS_PER_SEASON = 3;
export const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];

export const WEATHER = {
  clear: { name: 'Klar', grow: 1, rot: 1, fog: 0, wet: 0, precip: 0, storm: 0 },
  rain: { name: 'Regen', grow: 1.8, rot: 0.6, fog: 0.25, wet: 1, precip: 1, storm: 0 },
  fog: { name: 'Nebel', grow: 1.1, rot: 1.1, fog: 1, wet: 0.3, precip: 0, storm: 0 },
  storm: { name: 'Gewitter', grow: 1.4, rot: 1.6, fog: 0.4, wet: 1, precip: 1, storm: 1 },
  snow: { name: 'Schnee', grow: 0.5, rot: 0.7, fog: 0.2, wet: 0, precip: 1, storm: 0 },
};

// Wetterwahrscheinlichkeiten je Jahreszeit
const ODDS = [
  { clear: 0.45, rain: 0.35, fog: 0.15, storm: 0.05 },
  { clear: 0.6, rain: 0.15, fog: 0.05, storm: 0.2 },
  { clear: 0.35, rain: 0.3, fog: 0.3, storm: 0.05 },
  { clear: 0.35, snow: 0.45, fog: 0.2 },
];

const SEASON_GROW = [1.35, 1, 0.9, 0.45];
const SEASON_ROT = [0.9, 1, 1.15, 0.75];

const smooth = (t) => t * t * (3 - 2 * t);

export function createClimate(state, rand = Math.random) {
  const s = Object.assign({ day: 0, weather: 'clear', weatherT: 90, snow: 0 }, state || {});
  // weiche Übergänge
  const mix = { clear: 1, rain: 0, fog: 0, storm: 0, snow: 0 };
  for (const k of Object.keys(mix)) mix[k] = k === s.weather ? 1 : 0;
  let lightning = 0;
  let nextBolt = 5;
  let rainbow = 0;
  let wasRain = 0;

  // Jahreszeit als kontinuierliche Phase: der letzte halbe Tag einer Jahreszeit blendet über
  function seasonWeights(dayTime) {
    const phase = (s.day + dayTime) / DAYS_PER_SEASON;
    const i = Math.floor(phase) % 4;
    const f = phase - Math.floor(phase);
    const blendStart = 1 - 0.5 / DAYS_PER_SEASON;
    const k = f > blendStart ? smooth((f - blendStart) / (1 - blendStart)) : 0;
    const w = [0, 0, 0, 0];
    w[i] += 1 - k;
    w[(i + 1) % 4] += k;
    return { index: i, weights: w, name: SEASONS[i], next: SEASONS[(i + 1) % 4], blend: k, dayInSeason: Math.floor(phase * DAYS_PER_SEASON) % DAYS_PER_SEASON };
  }

  function pickWeather(season, night) {
    const odds = { ...ODDS[season] };
    if (!night) odds.storm = (odds.storm ?? 0) * 0.4;
    let r = rand() * Object.values(odds).reduce((a, b) => a + b, 0);
    for (const [k, p] of Object.entries(odds)) {
      r -= p;
      if (r <= 0) return k;
    }
    return 'clear';
  }

  // ctx: { dayTime, night }  → Ereignisse
  function update(dt, ctx) {
    const ev = [];
    const sea = seasonWeights(ctx.dayTime);
    s.weatherT -= dt;
    if (s.weatherT <= 0) {
      const next = pickWeather(sea.index, ctx.night > 0.5);
      s.weatherT = 70 + rand() * 90;
      if (next !== s.weather) {
        ev.push({ type: 'weather', from: s.weather, to: next });
        s.weather = next;
      }
    }
    // im Winter fällt Schnee statt Regen, im Frühling taut er
    if (sea.index === 3 && (s.weather === 'rain' || s.weather === 'storm')) s.weather = 'snow';
    if (sea.index !== 3 && sea.weights[3] < 0.3 && s.weather === 'snow') s.weather = 'rain';
    for (const k of Object.keys(mix)) mix[k] += ((k === s.weather ? 1 : 0) - mix[k]) * Math.min(1, dt * 0.08);
    // Schneedecke wächst bei Schneefall, taut bei Wärme
    const cold = sea.weights[3];
    if (mix.snow > 0.3) s.snow = Math.min(1, s.snow + dt * 0.012 * mix.snow);
    else s.snow = Math.max(cold * 0.25 * s.snow, s.snow - dt * (0.004 + (1 - cold) * 0.01 + mix.rain * 0.01));
    // Blitze
    lightning = Math.max(0, lightning - dt * 3);
    if (mix.storm > 0.6) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = 4 + rand() * 9;
        lightning = 1;
        ev.push({ type: 'lightning', delay: 0.4 + rand() * 2.2 });
      }
    }
    // Regenbogen, wenn nach Regen die Sonne kommt
    const raining = mix.rain + mix.storm;
    if (wasRain > 0.5 && raining < 0.4 && ctx.night < 0.3) rainbow = 1;
    wasRain = Math.max(raining, wasRain - dt * 0.01);
    if (raining < 0.4) wasRain = Math.min(wasRain, raining);
    rainbow = Math.max(0, rainbow - dt * 0.012);
    return ev;
  }

  function factors(dayTime) {
    const sea = seasonWeights(dayTime);
    let grow = 0;
    let rot = 0;
    for (let k = 0; k < 4; k++) {
      grow += sea.weights[k] * SEASON_GROW[k];
      rot += sea.weights[k] * SEASON_ROT[k];
    }
    let wg = 0;
    let wr = 0;
    let fog = 0;
    let wet = 0;
    let precip = 0;
    let storm = 0;
    for (const [k, m] of Object.entries(mix)) {
      const w = WEATHER[k];
      wg += m * w.grow;
      wr += m * w.rot;
      fog += m * w.fog;
      wet += m * w.wet;
      precip += m * w.precip;
      storm += m * w.storm;
    }
    const freeze = Math.max(0, sea.weights[3] - 0.3) / 0.7;
    return {
      season: sea,
      grow: grow * wg,
      rot: rot * wr,
      fog,
      wet,
      rain: mix.rain + mix.storm,
      snowfall: mix.snow,
      storm,
      snow: s.snow,
      freeze,
      lightning,
      rainbow,
      // Nebel lockt Moderlinge auch am Tag hervor, Gewitter bringt mehr
      moderDay: mix.fog > 0.6,
      moderBonus: Math.round(storm * 3),
      weather: s.weather,
      weatherName: WEATHER[s.weather].name,
    };
  }

  return {
    state: s,
    update,
    factors,
    seasonWeights,
    newDay() {
      s.day++;
    },
    setWeather(k) {
      s.weather = k;
      s.weatherT = 120;
      for (const key of Object.keys(mix)) mix[key] = key === k ? 1 : 0;
    },
  };
}
