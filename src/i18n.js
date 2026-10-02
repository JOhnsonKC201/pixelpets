// Translations. Pure: no Electron, no file reads at call time, so main, the
// tests and any script can load it.
//
// A locale is one flat JSON file in src/locales/, keyed by dotted names
// ("say.timer.cancelled"). English is the reference: every other file must hold
// exactly the same keys and the same {placeholders} (tests/i18n.test.js), and
// anything a locale is missing falls back to English rather than showing a key.
//
// Windows are sandboxed and cannot read these files. Main translates, and sends
// a window only the finished strings it needs to draw.

// Listed by the name each language calls itself, in the order Settings shows.
const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' },
]);
const CODES = LANGUAGES.map((l) => l.code);
const FALLBACK = 'en';
const AUTO = 'auto';

// Required one by one, not read from a directory listing, so a packaged build
// can only ever load the files that shipped with it.
const TABLES = Object.freeze({
  en: require('./locales/en.json'),
  es: require('./locales/es.json'),
  fr: require('./locales/fr.json'),
  de: require('./locales/de.json'),
  'pt-BR': require('./locales/pt-BR.json'),
  hi: require('./locales/hi.json'),
  ja: require('./locales/ja.json'),
  'zh-CN': require('./locales/zh-CN.json'),
});

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isSupported = (code) => CODES.includes(code);

// "pt_PT" / "PT-br" / "zh-Hans-CN" -> the closest locale we ship, or null. An
// exact match wins; otherwise the language alone decides, so pt-PT reads the
// Brazilian file rather than English. Traditional Chinese is the exception: it
// is a different script, not a regional spelling, so it gets no Simplified file.
const TRADITIONAL_CHINESE = /^zh-(.*-)?(hant|tw|hk|mo)\b/;
function closest(tag) {
  const want = String(tag == null ? '' : tag).trim().toLowerCase().replace(/_/g, '-');
  if (!want) return null;
  const exact = CODES.find((c) => c.toLowerCase() === want);
  if (exact) return exact;
  if (TRADITIONAL_CHINESE.test(want)) return null;
  const lang = want.split('-')[0];
  return CODES.find((c) => c.toLowerCase().split('-')[0] === lang) || null;
}

// The setting wins when it names a language. On 'auto', the first of the
// system's preferred languages that we can speak wins, in the user's own order.
function resolveLocale(pref, system) {
  if (pref && pref !== AUTO) return closest(pref) || FALLBACK;
  const tags = Array.isArray(system) ? system : [system];
  for (const tag of tags) {
    const hit = closest(tag);
    if (hit) return hit;
  }
  return FALLBACK;
}

// {name} is replaced only when `vars` carries it. Anything else is left exactly
// as written, because notify() fills {name} / {time} / {date} later on.
function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (whole, k) => (vars && has(vars, k) && vars[k] != null ? String(vars[k]) : whole));
}

const pluralRules = new Map();
function pluralForm(code, count) {
  if (!pluralRules.has(code)) {
    let rules = null;
    try { rules = new Intl.PluralRules(code); } catch (e) { /* unknown tag: 'other' */ }
    pluralRules.set(code, rules);
  }
  const rules = pluralRules.get(code);
  return rules && Number.isFinite(Number(count)) ? rules.select(Number(count)) : 'other';
}

// A value is a string, or { one, other, ... } chosen by vars.count.
function pick(code, key, vars) {
  const table = TABLES[code];
  if (!table || !has(table, key)) return null;
  const v = table[key];
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return null;
  const form = pluralForm(code, vars && vars.count);
  if (typeof v[form] === 'string') return v[form];
  return typeof v.other === 'string' ? v.other : null;
}

const translators = new Map();
// translator('es')('say.copied', { text: '42' }). One function per locale, cached.
function translator(code) {
  const locale = isSupported(code) ? code : FALLBACK;
  if (!translators.has(locale)) {
    translators.set(locale, (key, vars) => {
      const text = pick(locale, key, vars) ?? pick(FALLBACK, key, vars);
      return text == null ? String(key) : fill(text, vars);
    });
  }
  return translators.get(locale);
}

const keysOf = (code) => Object.keys(TABLES[isSupported(code) ? code : FALLBACK]);

module.exports = { LANGUAGES, CODES, FALLBACK, AUTO, TABLES, isSupported, closest, resolveLocale, fill, translator, keysOf };
