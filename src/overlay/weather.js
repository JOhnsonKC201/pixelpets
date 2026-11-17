// Overlay renderer, part: seasonal weather.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.
//
// A little weather of the pet's own, picked from today's date: snow in winter,
// leaves in autumn, blossom petals in spring and fireflies on summer evenings.
// It falls in a band around the pet rather than across the screen, it is sparse
// on purpose, and it never asks for a faster frame rate, so it costs next to
// nothing while the pet idles at its low fps. Work mode, Focus Guard, reduced
// motion and low power all stop it. What is already in the air is let finish
// when work mode or Focus Guard starts, so nothing blinks out mid-fall; reduced
// motion and low power clear it at once, because that is what they promise.

const WEATHER_KINDS = ['snow', 'leaves', 'petals', 'fireflies'];
const SEASON_WEATHER = { winter: 'snow', autumn: 'leaves', spring: 'petals', summer: 'fireflies' };
const WEATHER_SPAN = 130;         // half-width of the band around the pet, px
const WEATHER_TOP = 150;          // how far above the head things start falling
const WEATHER_MAX = { snow: 16, leaves: 6, petals: 9, fireflies: 6 };
const WEATHER_EVERY = { snow: 420, leaves: 1500, petals: 900, fireflies: 1400 };   // ms between arrivals
const WEATHER_REST_MS = { snow: 7000, leaves: 9000, petals: 5000 };   // how long it lies on the floor
const WEATHER_SETTLED_MAX = 28;
const WEATHER_FADE_MS = 500;
const WEATHER_RECHECK_MS = 60000;  // the date only matters once a minute
const FIREFLY_LIFE_MS = 7000;
const FIREFLY_DUSK = 19, FIREFLY_DAWN = 5;   // auto fireflies come out between these hours
const SNOW_SHAKE_AT = 7;          // flakes caught in the coat before the pet shakes them off
const SNOW_BURST_MS = 700;
const LEAF_COLORS = ['#d9772b', '#e8a93c', '#b8452f', '#c98f2b'];

let weatherClock = () => new Date();   // tests swap this to pin a date
let weatherFlakes = [], weatherSettled = [], weatherBursts = [];
let weatherKind = null, weatherKey = '', weatherCheckAt = -1, weatherNextAt = 0, snowOnPet = 0, weatherSeeded = false;
// --weather=<kind> on a --shot preview. Previews, the contact sheet and forced
// poses otherwise stay clear of weather so every capture is reproducible.
const WEATHER_FORCED = WEATHER_KINDS.includes(qp.get('weather')) ? qp.get('weather') : null;
const WEATHER_QA = SHOT || SHEET || !!FORCED_STATE;

// Meteorological seasons: whole months, the way people say it ("December is
// winter"), and no solstice tables to get wrong.
function seasonOf(date, hemisphere) {
  const m = date.getMonth();
  const north = (m === 11 || m <= 1) ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  if (hemisphere !== 'south') return north;
  return { winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' }[north];
}

// What should be falling right now for a given setting ('auto', 'off' or a kind).
function weatherFor(date, setting, hemisphere) {
  if (setting === 'off') return null;
  if (WEATHER_KINDS.includes(setting)) return setting;   // picked by hand: any hour
  const kind = SEASON_WEATHER[seasonOf(date, hemisphere)];
  // fireflies only come out after dark; a summer afternoon is just an afternoon
  const h = date.getHours();
  if (kind === 'fireflies' && h >= FIREFLY_DAWN && h < FIREFLY_DUSK) return null;
  return kind;
}

const weatherStill = () => lowPower || !!(config && config.reducedMotion);
const weatherAllowed = () => !!weatherKind && !weatherStill() && !workModeOn() && !settingArea;
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

function refreshWeatherKind(t) {
  const setting = config && config.weather, hemi = config && config.hemisphere;
  const key = `${setting}|${hemi}`;
  if (t < weatherCheckAt && key === weatherKey) return;
  weatherCheckAt = t + WEATHER_RECHECK_MS; weatherKey = key;
  if (WEATHER_FORCED) weatherKind = WEATHER_FORCED;
  else if (WEATHER_QA || !config) weatherKind = null;
  else weatherKind = weatherFor(weatherClock(), setting || 'auto', hemi);
}

function spawnWeather(kind, t, y) {
  const x = pos.x + rnd(-WEATHER_SPAN, WEATHER_SPAN);
  const top = y == null ? pos.y - SH - rnd(0.6, 1) * WEATHER_TOP : y;
  const base = { kind, x, y: top, t0: t, ground: pos.y, sway: rnd(0, Math.PI * 2) };
  if (kind === 'snow') return { ...base, vy: rnd(0.45, 0.9), vx: 0, swayA: rnd(0.25, 0.6), size: Math.random() < 0.3 ? 2 : 1, catchable: Math.random() < 0.5 };
  if (kind === 'leaves') return { ...base, vy: rnd(0.6, 0.95), vx: rnd(-0.15, 0.15), swayA: rnd(0.9, 1.5), spin: rnd(0, 6), vspin: rnd(-0.09, 0.09), color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)] };
  if (kind === 'petals') return { ...base, vy: rnd(0.35, 0.6), vx: rnd(0.2, 0.45), swayA: rnd(0.5, 0.9), spin: rnd(0, 6), vspin: rnd(-0.05, 0.05) };
  // fireflies drift around the pet instead of falling
  return { ...base, y: pos.y - rnd(10, SH + 70), vx: rnd(-0.3, 0.3), vy: rnd(-0.2, 0.2), life: FIREFLY_LIFE_MS * rnd(0.8, 1.2) };
}

function moveFirefly(f, t, step) {
  f.vx = clamp(f.vx + rnd(-0.04, 0.04) * step, -0.45, 0.45);
  f.vy = clamp(f.vy + rnd(-0.04, 0.04) * step, -0.35, 0.35);
  // a soft leash back toward the pet, so they stay in its glow and off the rest of the screen
  if (Math.abs(f.x - pos.x) > WEATHER_SPAN) f.vx += Math.sign(pos.x - f.x) * 0.03 * step;
  if (f.y > pos.y - 6 || f.y < pos.y - SH - 90) f.vy += Math.sign(pos.y - SH * 0.6 - f.y) * 0.03 * step;
  f.x += f.vx * step; f.y += f.vy * step;
  return t - f.t0 < f.life;
}

// One falling thing for one frame. Returns false once it has left the air.
function moveFalling(f, t, step) {
  f.y += f.vy * step;
  f.x += (f.vx + Math.sin(t / 600 + f.sway) * f.swayA * 0.5) * step;
  if (f.spin != null) f.spin += f.vspin * step;
  // about half the snow drifts onto the pet and melts into its coat
  const onHead = Math.abs(f.x - pos.x) < SW * 0.22 && f.y > pos.y - SH * 0.82 && f.y < pos.y - SH * 0.6;
  if (f.kind === 'snow' && f.catchable && onHead && !grabbing) { snowOnPet++; return false; }
  if (f.y < f.ground) return true;
  weatherSettled.push({ kind: f.kind, x: f.x, y: f.ground, t0: t, size: f.size, color: f.color, spin: (f.spin || 0) * 0.2 });
  if (weatherSettled.length > WEATHER_SETTLED_MAX) weatherSettled = weatherSettled.slice(-WEATHER_SETTLED_MAX);
  return false;
}

function updateWeather(t, step) {
  refreshWeatherKind(t);
  if (WEATHER_FORCED && SHOT && !weatherSeeded) { weatherSeeded = true; seedWeatherScene(WEATHER_FORCED, t); }
  if (weatherStill() && !WEATHER_FORCED) { weatherFlakes = []; weatherSettled = []; weatherBursts = []; snowOnPet = 0; return; }
  if (weatherAllowed() && t >= weatherNextAt) {
    weatherNextAt = t + WEATHER_EVERY[weatherKind] * rnd(0.6, 1.4);
    if (weatherFlakes.filter((f) => f.kind === weatherKind).length < WEATHER_MAX[weatherKind]) weatherFlakes.push(spawnWeather(weatherKind, t));
  }
  if (weatherFlakes.length) weatherFlakes = weatherFlakes.filter((f) => (f.kind === 'fireflies' ? moveFirefly(f, t, step) : moveFalling(f, t, step)));
  if (weatherSettled.length) weatherSettled = weatherSettled.filter((s) => t - s.t0 < WEATHER_REST_MS[s.kind]);
  if (weatherBursts.length) {
    weatherBursts = weatherBursts.filter((b) => t - b.t0 < SNOW_BURST_MS);
    for (const b of weatherBursts) { b.x += b.vx * step; b.y += b.vy * step; b.vy += 0.14 * step; }
  }
}

// Seated and idle with a coat full of snow: shake it off. A spray of flakes, a
// squeezed blink and a flick of the tail, then the count starts again.
function maybeShakeOffSnow(t) {
  if (snowOnPet < SNOW_SHAKE_AT || weatherStill()) return false;
  snowOnPet = 0;
  const hx = pos.x, hy = pos.y - SH * 0.78;
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    weatherBursts.push({ x: hx + side * rnd(4, 18), y: hy + rnd(-4, 10), vx: side * rnd(1, 2.6), vy: rnd(-2.2, -0.6), t0: t });
  }
  blinkUntil = t + 260; tailFlickT0 = t;
  return true;
}

// Somewhere for idle eyes to go: the nearest thing in the air in front of the
// face, as the unit gaze vector frame.js uses for lookTarget. null when the air is empty.
function weatherGlance() {
  const fx = pos.x, fy = pos.y - SH * 0.72;
  let best = null, bestD = 170;
  for (const f of weatherFlakes) {
    const d = Math.hypot(f.x - fx, f.y - fy);
    if (d < bestD && d > 12) { best = f; bestD = d; }
  }
  return best ? { x: (best.x - fx) / bestD, y: (best.y - fy) / bestD } : null;
}

// ---- drawing ----------------------------------------------------------------
// Every piece gets a darker rim for the same reason the play leaf does: the
// overlay sits on whatever wallpaper you have, and white snow on a white desktop
// is no snow at all. Flakes are a little pixel plus, not a square: a rimmed
// square on a light desktop reads as an empty box, a plus still reads as snow.
function drawFlake(x, y, s, a) {
  const px = Math.round(x), py = Math.round(y);
  ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#7d97ad';
  ctx.fillRect(px - 1, py - 2, s + 2, s + 4); ctx.fillRect(px - 2, py - 1, s + 4, s + 2);
  ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
  ctx.fillRect(px, py - 1, s, s + 2); ctx.fillRect(px - 1, py, s + 2, s);
}
function drawFallingLeaf(x, y, spin, color, a) {
  ctx.globalAlpha = a; ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(spin);
  ctx.fillStyle = '#5a2a12'; ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a2a12'; ctx.fillRect(3, -0.5, 2, 1);   // stem
  ctx.restore();
}
function drawPetal(x, y, spin, a) {
  ctx.globalAlpha = a; ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(spin);
  ctx.fillStyle = '#c56b8c'; ctx.beginPath(); ctx.ellipse(0, 0, 3.3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffc4d8'; ctx.beginPath(); ctx.ellipse(0, 0, 2.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe6ee'; ctx.fillRect(-1, -1, 1, 1);
  ctx.restore();
}
function drawFirefly(f, t) {
  const age = t - f.t0, life = f.life;
  const fade = Math.min(1, age / 800, (life - age) / 800);
  const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t / 420 + f.sway * 3), 2);
  const a = Math.max(0, fade) * pulse, x = Math.round(f.x), y = Math.round(f.y);
  ctx.globalAlpha = a * 0.18; ctx.fillStyle = '#e4ff7a'; ctx.fillRect(x - 3, y - 3, 7, 7);
  ctx.globalAlpha = a * 0.4; ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.globalAlpha = a; ctx.fillStyle = '#fbffd2'; ctx.fillRect(x - 1, y - 1, 2, 2);
}
function drawWeatherPiece(p, a) {
  if (p.kind === 'snow') { const s = p.size || 1; drawFlake(p.x, p.y - s - 1, s, a); }   // the plus's bottom row rests on the floor line
  else if (p.kind === 'leaves') drawFallingLeaf(p.x, p.y - 2, p.spin, p.color, a);
  else if (p.kind === 'petals') drawPetal(p.x, p.y - 1, p.spin, a);
}

// Behind the pet: what has landed. It lies on the floor line, then fades.
function drawWeatherBack(t) {
  for (const s of weatherSettled) {
    const left = WEATHER_REST_MS[s.kind] - (t - s.t0);
    drawWeatherPiece(s, clamp(left / 1200, 0, 1) * 0.9);
  }
  ctx.globalAlpha = 1;
}
// In front of the pet: what is still in the air.
function drawWeatherFront(t) {
  for (const f of weatherFlakes) {
    if (f.kind === 'fireflies') { drawFirefly(f, t); continue; }
    drawWeatherPiece(f, clamp((t - f.t0) / WEATHER_FADE_MS, 0, 1));
  }
  for (const b of weatherBursts) drawFlake(b.x, b.y, 1, 1 - (t - b.t0) / SNOW_BURST_MS);
  ctx.globalAlpha = 1;
}

// A shot has no time to let anything fall, so give it a scene already underway.
function seedWeatherScene(kind, t) {
  for (let i = 0; i < WEATHER_MAX[kind]; i++) {
    const f = spawnWeather(kind, t, pos.y - SH - WEATHER_TOP + (i / WEATHER_MAX[kind]) * (WEATHER_TOP + SH - 8));
    if (kind === 'snow') f.catchable = false;
    weatherFlakes.push(f);
  }
  if (kind !== 'fireflies') for (let i = 0; i < 5; i++) weatherSettled.push({ kind, x: pos.x + rnd(-WEATHER_SPAN, WEATHER_SPAN), y: pos.y, t0: t, size: 2, color: LEAF_COLORS[i % LEAF_COLORS.length], spin: rnd(-0.3, 0.3) });
}
