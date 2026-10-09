// Translations are data, and data drifts: a key added to English and forgotten
// elsewhere, a {placeholder} dropped in one language, a launcher that still
// decides something by reading an English title. Nothing here boots Electron.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const i18n = require('../src/i18n');
const { suggest } = require('../src/tools/commands');
const { runAction } = require('../src/tools/actions');
const config = require('../src/config');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const EN = i18n.TABLES.en;
const OTHERS = i18n.CODES.filter((c) => c !== 'en');
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const forms = (v) => (typeof v === 'string' ? { other: v } : v);
// A raw key on screen means a lookup missed: "say.timer.cancelled".
const LOOKS_LIKE_KEY = /^[a-z]+(\.[A-Za-z]+)+$/;
// Built from code points so this file never contains the characters it bans.
const LONG_DASH = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`);

const ctx = (over = {}) => ({
  platform: 'win32', search: 'google', keepAwake: false, clipboardOn: true, now: 0,
  shortcuts: [{ id: 's1', label: 'Gmail', target: 'https://mail.google.com/' }],
  todos: { day: '', items: [{ id: 't1', text: 'write', done: false }, { id: 't2', text: 'gym', done: true }], nudged: '' },
  timers: [{ id: 'tm1', endsAt: 5 * 60000, label: 'tea' }, { id: 'tm2', endsAt: 60000, label: '' }],
  clips: ['a clip'],
  ...over,
});
// Queries a route recognises by shape. What they return cannot depend on wording.
const ROUTED = ['', '?', 'todo ', 'g ', '=1+1', '=bad', '5 km in mi', 'g cats', 'note milk', 'todo call', 'done 1', 'done 2', 'done 9', '10m', '10m tea', 'clip'];
// Plus the fuzzy list and the search-or-note fallback, which match on titles.
const QUERIES = [...ROUTED, 'gmail', 'text', 'zzqqxx'];

test('every language has exactly the English keys', () => {
  const want = Object.keys(EN).sort();
  for (const code of OTHERS) {
    assert.deepStrictEqual(Object.keys(i18n.TABLES[code]).sort(), want, `${code}.json has missing or extra keys`);
  }
});

test('every translation keeps the placeholders of the English sentence', () => {
  for (const code of OTHERS) {
    for (const [key, en] of Object.entries(EN)) {
      const mine = forms(i18n.TABLES[code][key]);
      assert.strictEqual(typeof mine.other, 'string', `${code} ${key}: needs an "other" form`);
      // Each plural form may leave {count} out ("One to-do"), never add a name.
      const allowed = new Set(Object.values(forms(en)).flatMap(placeholders));
      for (const [form, text] of Object.entries(mine)) {
        assert.ok(text.trim(), `${code} ${key}.${form} is empty`);
        for (const p of placeholders(text)) assert.ok(allowed.has(p), `${code} ${key}.${form} uses {${p}}, which English never fills`);
      }
      if (typeof en === 'string') {
        assert.deepStrictEqual(placeholders(mine.other), placeholders(en), `${code} ${key}: placeholders differ from English`);
      }
    }
  }
});

test('plural forms are ones the language really has', () => {
  for (const code of i18n.CODES) {
    const real = new Set(new Intl.PluralRules(code).resolvedOptions().pluralCategories);
    for (const [key, v] of Object.entries(i18n.TABLES[code])) {
      if (typeof v === 'string') continue;
      for (const form of Object.keys(v)) assert.ok(real.has(form), `${code} ${key}: "${form}" is not a plural form of ${code}`);
    }
  }
});

test('locale files hold plain text: no markup, no long dashes', () => {
  for (const code of i18n.CODES) {
    for (const [key, v] of Object.entries(i18n.TABLES[code])) {
      for (const text of Object.values(forms(v))) {
        assert.doesNotMatch(text, /<\/?[a-z!]/i, `${code} ${key} carries markup`);
        assert.doesNotMatch(text, LONG_DASH, `${code} ${key} uses an en or em dash`);
      }
    }
  }
});

test('every key the code asks for exists, and no key is left unused', () => {
  const files = ['tools/commands.js', 'tools/actions.js', 'tools/system.js', 'tools/index.js'];
  const code = files.map((f) => codeOnly(read(f))).join('\n');
  const literal = new Set([...code.matchAll(/'((?:launcher|section|cmd|hint|calc|convert|search|note|clip|todo|timer|say|sys|nudge|hotkey)\.[\w.]+)'/g)].map((m) => m[1]));
  for (const key of literal) assert.ok(key in EN, `the code asks for "${key}", which en.json does not have`);
  // Keys built at run time: `cmd.snip.sub.${os}`, `section.${section}`, `launcher.${k}`.
  const stems = [...code.matchAll(/`((?:launcher|section|cmd)\.[\w.]*)\$\{/g)].map((m) => m[1]);
  for (const key of Object.keys(EN)) {
    assert.ok(literal.has(key) || stems.some((s) => key.startsWith(s)), `en.json has "${key}", which nothing uses`);
  }
});

test('auto picks the first system language that ships, and a setting wins', () => {
  const r = i18n.resolveLocale;
  assert.strictEqual(r('auto', ['es-MX', 'en-US']), 'es');
  assert.strictEqual(r('auto', ['ne-NP', 'hi-IN', 'en-US']), 'hi', 'skips a language we cannot speak');
  assert.strictEqual(r('auto', ['pt-PT']), 'pt-BR', 'the language alone is enough');
  assert.strictEqual(r('auto', ['zh-Hans-CN']), 'zh-CN');
  assert.strictEqual(r('auto', ['zh-SG']), 'zh-CN');
  for (const tag of ['zh-TW', 'zh-HK', 'zh-Hant', 'zh-Hant-TW', 'zh_MO']) {
    assert.strictEqual(r('auto', [tag]), 'en', `${tag} is Traditional script, which no file here covers`);
  }
  assert.strictEqual(r('auto', ['zh-TW', 'ja-JP']), 'ja', 'and the next preferred language still gets its turn');
  assert.strictEqual(r('auto', ['PT_br']), 'pt-BR');
  assert.strictEqual(r('auto', 'ja'), 'ja', 'a single tag works too');
  assert.strictEqual(r('auto', ['sw-KE']), 'en');
  assert.strictEqual(r('auto', []), 'en');
  assert.strictEqual(r(undefined, undefined), 'en');
  assert.strictEqual(r('de', ['ja-JP']), 'de');
  assert.strictEqual(r('klingon', ['ja-JP']), 'en', 'a junk setting never falls through to the system');
});

test('the translator fills what it is given and leaves the rest for notify()', () => {
  const en = i18n.translator('en');
  assert.strictEqual(en('say.copied', { text: '42' }), 'Copied 42');
  assert.strictEqual(en('nudge.todo', { count: 1 }), 'One to-do still open today. Want to knock it out?');
  assert.strictEqual(en('nudge.todo', { count: 3 }), '3 to-dos still open today. Pick one?');
  assert.strictEqual(i18n.fill('Back to focus, {name}!', { count: 2 }), 'Back to focus, {name}!');
  assert.strictEqual(i18n.fill('{a}', { a: '{b}', b: 'x' }), '{b}', 'a filled value is never expanded again');
  assert.strictEqual(en('no.such.key'), 'no.such.key');
  assert.strictEqual(en('constructor'), 'constructor', 'inherited properties are not translations');
  assert.strictEqual(i18n.translator('klingon'), en, 'an unknown locale is English');
  assert.strictEqual(i18n.translator('ja')('nudge.todo', { count: 1 }), i18n.TABLES.ja['nudge.todo'].other.replace('{count}', '1'));
});

test('the launcher list reads in every language and no raw key reaches the screen', () => {
  for (const code of i18n.CODES) {
    const t = i18n.translator(code);
    for (const platform of ['win32', 'darwin']) {
      for (const q of QUERIES) {
        for (const r of suggest(q, ctx({ t, platform, keepAwake: platform === 'darwin' }))) {
          for (const field of ['title', 'subtitle', 'hint', 'sectionLabel']) {
            if (r[field]) assert.doesNotMatch(r[field], LOOKS_LIKE_KEY, `${code} "${q}" ${field}`);
          }
        }
      }
    }
  }
});

test('the language changes the words and never what a result does', () => {
  const plain = (list) => list.map((r) => ({ kind: r.kind, action: r.action, icon: r.icon, section: r.section, checked: r.checked, stay: r.stay }));
  for (const code of OTHERS) {
    const t = i18n.translator(code);
    for (const q of ROUTED) {
      assert.deepStrictEqual(plain(suggest(q, ctx({ t }))), plain(suggest(q, ctx())), `${code} "${q}"`);
    }
  }
  assert.strictEqual(suggest('', ctx({ t: i18n.translator('es') })).find((r) => r.section === 'today').sectionLabel, 'Hoy');
});

test('a command still answers to its English name in another language', () => {
  for (const code of OTHERS) {
    const t = i18n.translator(code);
    const top = (q) => suggest(q, ctx({ t, shortcuts: [], timers: [], todos: { day: '', items: [], nudged: '' } }))[0];
    assert.deepStrictEqual(top('settings').action, { type: 'system', what: 'settings' }, code);
    assert.deepStrictEqual(top('open notes').action, { type: 'openNotes' }, code);
    assert.deepStrictEqual(top('screenshot').action, { type: 'system', what: 'snip' }, code);
    assert.ok(!('keys' in top('settings')), 'match words never reach the launcher');
  }
  const es = i18n.translator('es');
  assert.deepStrictEqual(suggest('ajustes', ctx({ t: es }))[0].action, { type: 'system', what: 'settings' });
});

test('what the pet says after an action follows the language', async () => {
  const said = [];
  const api = (t) => ({
    t, say: (text) => said.push(text), cfg: () => ({ tools: { shortcuts: [] } }),
    timers: () => [], setTimers() {}, today: () => ({ day: '', items: [], nudged: '' }), persistTodos() {},
  });
  await runAction(api(i18n.translator('es')), { type: 'timerCancel', id: 'x' });
  await runAction(api(i18n.translator('es')), { type: 'openShortcut', id: 'gone' });
  await runAction(api(undefined), { type: 'timerCancel', id: 'x' });
  assert.deepStrictEqual(said, ['Temporizador cancelado.', 'Ese acceso directo ya no existe.', 'Timer cancelled.']);
});

test('the launcher window decides nothing by reading English', () => {
  const js = codeOnly(read('launcher-renderer.js'));
  assert.doesNotMatch(js, /Add to-do|'Today'|\.test\(item\.title/, 'key on ids and flags, not on wording');
  assert.match(js, /item\.checkbox/);
  assert.match(js, /id === 'today'/);
  const index = codeOnly(read('tools', 'index.js'));
  const sent = /const LAUNCHER_STRINGS = \[([^\]]+)\]/.exec(index)[1].match(/\w+/g);
  for (const k of sent) assert.ok(`launcher.${k}` in EN, `launcher.${k}`);
  // The markup carries the English that the first paint shows.
  const html = read('launcher.html');
  assert.ok(html.includes(`placeholder="${EN['launcher.placeholder']}"`));
  assert.ok(html.includes(`aria-label="${EN['launcher.listLabel']}"`));
  for (const [id, key] of [['lblMove', 'move'], ['lblRun', 'run'], ['lblNumbers', 'numbers'], ['tip', 'tip']]) {
    assert.match(html, new RegExp(`id="${id}">${EN[`launcher.${key}`].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`), id);
  }
});

test('Settings offers exactly the languages that ship, and the choice is validated', () => {
  const html = read('settings.html');
  const select = /<select id="language">([\s\S]*?)<\/select>/.exec(html)[1];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.strictEqual(options[0][0], 'auto');
  assert.deepStrictEqual(options.slice(1), i18n.LANGUAGES.map((l) => [l.code, l.name]));
  assert.strictEqual(config.DEFAULTS.language, 'auto');
  assert.strictEqual(config.normalize({}).language, 'auto');
  assert.strictEqual(config.normalize({ language: 'ja' }).language, 'ja');
  assert.strictEqual(config.normalize({ language: '../../etc' }).language, 'auto');
  assert.strictEqual(config.normalize({ language: 'JA' }).language, 'auto', 'only an exact code is stored');
});
