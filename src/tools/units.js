// Unit conversion for the launcher ("5 km in mi", "72 f to c", "3 GB in MiB").
// Every linear unit is a factor to its category's base unit; temperature is the one
// affine exception and gets explicit to/from functions. Offline and exact to the
// definitions (1 in = 2.54 cm, 1 lb = 0.45359237 kg), so no currency: that needs
// the network and goes stale.

const LINEAR = {
  length: { // base: metre
    m: [1, 'meter', 'meters', 'metre', 'metres'],
    km: [1000, 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
    cm: [0.01, 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
    mm: [0.001, 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
    mi: [1609.344, 'mile', 'miles'],
    yd: [0.9144, 'yard', 'yards'],
    ft: [0.3048, 'foot', 'feet', "'"],
    in: [0.0254, 'inch', 'inches', '"'],
    nmi: [1852, 'nauticalmile'],
  },
  mass: { // base: kilogram
    kg: [1, 'kilogram', 'kilograms', 'kilo', 'kilos'],
    g: [0.001, 'gram', 'grams'],
    mg: [1e-6, 'milligram', 'milligrams'],
    lb: [0.45359237, 'lbs', 'pound', 'pounds'],
    oz: [0.028349523125, 'ounce', 'ounces'],
    st: [6.35029318, 'stone', 'stones'],
    t: [1000, 'tonne', 'tonnes'],
  },
  volume: { // base: litre
    l: [1, 'liter', 'liters', 'litre', 'litres'],
    ml: [0.001, 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
    gal: [3.785411784, 'gallon', 'gallons'],
    qt: [0.946352946, 'quart', 'quarts'],
    pt: [0.473176473, 'pint', 'pints'],
    cup: [0.2365882365, 'cups'],
    floz: [0.0295735295625, 'fl-oz'],
    tbsp: [0.01478676478125, 'tablespoon', 'tablespoons'],
    tsp: [0.00492892159375, 'teaspoon', 'teaspoons'],
  },
  time: { // base: second
    s: [1, 'sec', 'secs', 'second', 'seconds'],
    min: [60, 'mins', 'minute', 'minutes'],
    h: [3600, 'hr', 'hrs', 'hour', 'hours'],
    d: [86400, 'day', 'days'],
    wk: [604800, 'week', 'weeks'],
  },
  data: { // base: byte. Decimal (kB, MB) and binary (KiB, MiB) are different on purpose.
    b: [1, 'byte', 'bytes'],
    kb: [1e3, 'kilobyte', 'kilobytes'],
    mb: [1e6, 'megabyte', 'megabytes'],
    gb: [1e9, 'gigabyte', 'gigabytes'],
    tb: [1e12, 'terabyte', 'terabytes'],
    kib: [1024],
    mib: [1024 ** 2],
    gib: [1024 ** 3],
    tib: [1024 ** 4],
  },
  speed: { // base: metre per second
    'm/s': [1, 'mps'],
    'km/h': [1 / 3.6, 'kph', 'kmh'],
    mph: [0.44704],
    kn: [1852 / 3600, 'knot', 'knots'],
  },
  area: { // base: square metre
    m2: [1, 'sqm'],
    km2: [1e6, 'sqkm'],
    ft2: [0.09290304, 'sqft'],
    acre: [4046.8564224, 'acres'],
    ha: [10000, 'hectare', 'hectares'],
  },
};

const TEMPERATURE = {
  c: { toBase: (v) => v, fromBase: (v) => v, aliases: ['°c', 'celsius'] },
  f: { toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32, aliases: ['°f', 'fahrenheit'] },
  k: { toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15, aliases: ['kelvin'] },
};

// alias -> { category, key }. A Map, not an object, so "constructor" is just a miss.
const ALIASES = new Map();
for (const [category, units] of Object.entries(LINEAR)) {
  for (const [key, [, ...aliases]] of Object.entries(units)) {
    for (const name of [key, ...aliases]) ALIASES.set(name, { category, key });
  }
}
for (const [key, { aliases }] of Object.entries(TEMPERATURE)) {
  for (const name of [key, ...aliases]) ALIASES.set(name, { category: 'temperature', key });
}

const lookup = (name) => ALIASES.get(String(name || '').trim().toLowerCase()) || null;

// Returns { value, from, to } with canonical unit keys, or null.
function convert(n, fromName, toName) {
  const from = lookup(fromName);
  const to = lookup(toName);
  if (!from || !to || from.category !== to.category || !Number.isFinite(n)) return null;
  let value;
  if (from.category === 'temperature') {
    value = TEMPERATURE[to.key].fromBase(TEMPERATURE[from.key].toBase(n));
  } else {
    const table = LINEAR[from.category];
    value = n * table[from.key][0] / table[to.key][0];
  }
  return Number.isFinite(value) ? { value, from: from.key, to: to.key } : null;
}

// "5 km in mi" -> { n: 5, from: 'km', to: 'mi' }. Syntax only; convert() decides
// whether the units are real, so "buy milk in town" never gets this far anyway.
const PHRASE = /^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z°"'/0-9-]+)\s+(?:in|to|as)\s+([a-z°"'/0-9-]+)$/i;
function parseConversion(input) {
  const m = PHRASE.exec(String(input == null ? '' : input).trim());
  if (!m) return null;
  return { n: Number(m[1]), from: m[2], to: m[3] };
}

// How a canonical unit key is written back to a person.
const DISPLAY = Object.freeze({ c: '°C', f: '°F', k: 'K', l: 'L', ml: 'mL', kb: 'kB', mb: 'MB', gb: 'GB', tb: 'TB',
  kib: 'KiB', mib: 'MiB', gib: 'GiB', tib: 'TiB', b: 'B', m2: 'm²', km2: 'km²', ft2: 'ft²' });
const displayUnit = (key) => (Object.prototype.hasOwnProperty.call(DISPLAY, key) ? DISPLAY[key] : key);

module.exports = { convert, parseConversion, displayUnit };
