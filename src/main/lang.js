// The user's language, for the main process: which locale is in force and the
// t(key, vars) that speaks it. One instance is made in main.js and handed to
// everything that shows words (tray menu, Quick Tools, updater).
const i18n = require('../i18n');

function makeLang({ app, getCfg }) {
  // Asked once: the OS list does not change under a running app, and the tray
  // menu alone calls t() dozens of times per rebuild. Only an answer is kept:
  // a call that fails (asked before the app is ready) is asked again next time.
  let system = null;
  function systemLanguages() {
    if (system) return system;
    try { system = [...app.getPreferredSystemLanguages(), app.getLocale()]; } catch (e) { return []; }
    return system;
  }
  // The Settings choice, or on Auto the first system language that ships.
  // Resolved per call, so a change in Settings shows on the next thing drawn.
  const locale = () => { const c = getCfg(); return i18n.resolveLocale(c && c.language, systemLanguages()); };
  const t = (key, vars) => i18n.translator(locale())(key, vars);
  return { locale, t };
}

// 'Russian Blue' -> 'russianBlue'. Coats are keyed by name, not by index, so
// reordering the coat list cannot mislabel one.
const coatSlug = (name) => String(name).trim().split(/\s+/)
  .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');

// A built-in coat in the user's language. A custom coat has no translation and
// keeps the name its owner gave it.
function coatLabel(t, name) {
  const key = `coat.${coatSlug(name)}`;
  const text = t(key);
  return text === key ? name : text;
}

module.exports = { makeLang, coatLabel, coatSlug };
