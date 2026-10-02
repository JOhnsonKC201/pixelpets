// The Quick Tools router: what you type in the launcher becomes a short list of
// results. Pure: no Electron, no clock of its own (ctx.now), no side effects.
//
// Each result is { id, kind, title, subtitle, action, stay?, checked? }. The
// `action` is a small tagged object that ONLY main executes: the launcher window
// is sent titles and sends back an index, so it can never hand main a URL, a
// path or a command of its own. `stay` keeps the launcher open after running
// (ticking a to-do), everything else closes it.
//
// Wording comes from ctx.t (src/i18n.js), English when a caller passes none.
// What you TYPE stays the same in every language (note, todo, done, timer, g):
// those are commands, and the actions they build never depend on the language.

const calc = require('./calc');
const units = require('./units');
const timers = require('./timers');
const todosLib = require('./todos');
const { preview } = require('./clipboard');
const { rank } = require('./fuzzy');
const { translator, FALLBACK } = require('../i18n');

const MAX_RESULTS = 8;
const MAX_EMPTY = 16;
const MAX_TITLE = 80;
const EN = translator(FALLBACK);

const SEARCH = Object.freeze({
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
});
const SEARCH_PREFIX = Object.freeze({ g: 'google', ddg: 'duckduckgo', b: 'bing' });
const ENGINE_NAME = Object.freeze({ google: 'Google', duckduckgo: 'DuckDuckGo', bing: 'Bing' });

// Fixed template + encoded query. An unknown engine falls back to Google rather
// than to anything taken from input.
function searchUrl(engine, query) {
  const base = Object.prototype.hasOwnProperty.call(SEARCH, engine) ? SEARCH[engine] : SEARCH.google;
  return base + encodeURIComponent(String(query || ''));
}

const item = (kind, title, subtitle, action, extra = {}) => ({ kind, title, subtitle: subtitle || '', action, ...extra });

// Extra words a command answers to and that never reach the UI ("screenshot"
// finds Snip). In another language the English title and words still match, so
// someone who learned "settings" from a tutorial finds it under any locale.
function matchWords(t, titleKey, keysKey) {
  const words = keysKey ? [t(keysKey)] : [];
  if (t(titleKey) !== EN(titleKey)) words.push(EN(titleKey));
  if (keysKey && t(keysKey) !== EN(keysKey)) words.push(EN(keysKey));
  return words.join(' ');
}

function systemCommands(ctx, t) {
  const os = ctx.platform === 'darwin' ? 'mac' : 'win';
  const lockTitle = `cmd.lock.title.${os}`;
  const cmd = (title, sub, action, extra, titleKey, keysKey) => {
    const keys = matchWords(t, titleKey, keysKey);
    return item('system', title, sub, action, keys ? { ...extra, keys } : extra);
  };
  return [
    cmd(t('cmd.snip.title'), t(`cmd.snip.sub.${os}`), { type: 'system', what: 'snip' }, { icon: 'snip' }, 'cmd.snip.title', 'cmd.snip.keys'),
    cmd(t(lockTitle), t(`cmd.lock.sub.${os}`), { type: 'system', what: 'lock' }, { icon: 'lock' }, lockTitle, 'cmd.lock.keys'),
    cmd(t('cmd.awake.title'), t(ctx.keepAwake ? 'cmd.awake.sub.on' : 'cmd.awake.sub.off'), { type: 'system', what: 'keepAwake' },
      { icon: 'awake', toggle: true, checked: !!ctx.keepAwake }, 'cmd.awake.title', 'cmd.awake.keys'),
    cmd(t('cmd.notes.title'), t('cmd.notes.sub'), { type: 'openNotes' }, { icon: 'notes' }, 'cmd.notes.title', null),
    cmd(t('cmd.clipboard.title'), t('cmd.clipboard.sub'), { type: 'system', what: 'clipboard' },
      { icon: 'clipboard', toggle: true, checked: !!ctx.clipboardOn }, 'cmd.clipboard.title', 'cmd.clipboard.keys'),
    cmd(t('cmd.break.title'), t('cmd.break.sub'), { type: 'system', what: 'break' }, { icon: 'break' }, 'cmd.break.title', 'cmd.break.keys'),
    cmd(t('cmd.settings.title'), t('cmd.settings.sub'), { type: 'system', what: 'settings' }, { icon: 'settings' }, 'cmd.settings.title', 'cmd.settings.keys'),
  ];
}

const shortcutItems = (ctx) => (ctx.shortcuts || []).map((s) =>
  item('shortcut', s.label, s.target, { type: 'openShortcut', id: s.id }));

const todoItems = (ctx, t) => ((ctx.todos && ctx.todos.items) || []).map((todo, i) =>
  item('todo', todo.text, t(todo.done ? 'todo.item.subDone' : 'todo.item.sub', { n: i + 1 }), { type: 'todoToggle', id: todo.id }, { stay: true, checked: todo.done }));

const timerItems = (ctx, t) => (ctx.timers || []).map((tm) =>
  item('timer', t('timer.item.title', { label: tm.label || t('timer.defaultLabel'), time: timers.formatRemaining(tm.endsAt - ctx.now) }),
    t('timer.item.sub'), { type: 'timerCancel', id: tm.id }));

const clipItems = (ctx, t) => (ctx.clipboardOn ? (ctx.clips || []) : []).map((c, index) =>
  item('clip', preview(c), t('clip.sub'), { type: 'clip', index }));

// The empty query is a dashboard: what you pinned, what is on today, what is
// running, then the one-press actions. `section` is a stable id the launcher
// keys its layout on; `sectionLabel` is the header it draws. The order here is
// the order on screen.
const inSection = (section, t) => (r) => ({ ...r, section, sectionLabel: t(`section.${section}`) });
function emptyQuery(ctx, t) {
  return [
    ...shortcutItems(ctx).slice(0, 6).map(inSection('pinned', t)),
    ...todoItems(ctx, t).map(inSection('today', t)),
    ...timerItems(ctx, t).map(inSection('timers', t)),
    ...clipItems(ctx, t).slice(0, 3).map(inSection('clips', t)),
    ...systemCommands(ctx, t).map(inSection('actions', t)),
  ].slice(0, MAX_EMPTY);
}

// ---- presentation --------------------------------------------------------------
// Every result gets an icon id (drawn by launcher-icons.js) and a short verb for
// the selected row ("Open", "Copy", "Done"). Filled in one place so a new route
// only has to say what it does, not how it looks.
const KIND_ICON = { calc: 'calc', convert: 'convert', search: 'search', note: 'note', todo: 'todo', timer: 'timer', clip: 'clipboard', info: 'info' };
const HINTS = { copy: 'hint.copy', search: 'hint.search', note: 'hint.save', openNotes: 'hint.open', todoAdd: 'hint.add', timerStart: 'hint.start',
  timerCancel: 'hint.cancel', openShortcut: 'hint.open', clip: 'hint.copy', system: 'hint.run' };

function shortcutIcon(target) {
  if (/^mailto:/i.test(target)) return 'mail';
  if (/^https?:/i.test(target)) return 'link';
  if (/\.(exe|app|lnk)$/i.test(target)) return 'app';
  return /\.[a-z0-9]{1,5}$/i.test(target) ? 'file' : 'folder';
}

function hintFor(r, t) {
  if (!r.action) return '';
  if (r.toggle) return t(r.checked ? 'hint.turnOff' : 'hint.turnOn');
  if (r.action.type === 'todoToggle') return t(r.checked ? 'hint.undo' : 'hint.done');
  return t(HINTS[r.action.type] || 'hint.run');
}

const decorate = (t) => (r) => {
  const icon = r.icon || (r.kind === 'shortcut' ? shortcutIcon(r.subtitle) : KIND_ICON[r.kind]) || 'info';
  return { ...r, icon, hint: hintFor(r, t) };
};

const titled = (text) => text.slice(0, MAX_TITLE);
const searchItem = (t, engine, query) =>
  item('search', titled(t('search.title', { engine: ENGINE_NAME[engine] || ENGINE_NAME.google, query })), t('search.sub'), { type: 'search', engine, query });

// Routes that recognise a specific shape. Each returns a result list or null.
const ROUTES = [
  function math(q, ctx, t) {
    if (!q.startsWith('=') && !calc.looksLikeMath(q)) return null;
    const r = calc.evaluate(q);
    if (!r.ok) return [item('info', t('calc.bad.title'), t('calc.bad.sub'), null)];
    const text = calc.formatNumber(r.value);
    return [item('calc', text, t('calc.sub'), { type: 'copy', text })];
  },
  function convert(q, ctx, t) {
    const p = units.parseConversion(q);
    const r = p && units.convert(p.n, p.from, p.to);
    if (!r) return null;
    const text = calc.formatNumber(r.value, 6);
    return [item('convert', `${text} ${units.displayUnit(r.to)}`, t('convert.sub', { n: p.n, unit: units.displayUnit(r.from) }), { type: 'copy', text })];
  },
  function search(q, ctx, t) {
    const m = /^(g|ddg|b)\s+(.+)$/i.exec(q);
    return m ? [searchItem(t, SEARCH_PREFIX[m[1].toLowerCase()], m[2])] : null;
  },
  function note(q, ctx, t) {
    const m = /^note\s+(.+)$/i.exec(q);
    return m ? [item('note', titled(t('note.title', { text: m[1] })), t('note.sub'), { type: 'note', text: m[1] })] : null;
  },
  function todoAdd(q, ctx, t) {
    const m = /^todo\s+(.+)$/i.exec(q);
    return m ? [item('todo', titled(t('todo.add.title', { text: m[1] })), t('todo.add.sub'), { type: 'todoAdd', text: m[1] })] : null;
  },
  function done(q, ctx, t) {
    const m = /^done\s+(\d+)$/i.exec(q);
    if (!m) return null;
    const todo = todosLib.byIndex(ctx.todos || { items: [] }, Number(m[1]));
    return todo
      ? [item('todo', t(todo.done ? 'todo.undo.title' : 'todo.done.title', { text: todo.text }), t('todo.item.sub', { n: m[1] }), { type: 'todoToggle', id: todo.id }, { stay: true, checked: todo.done })]
      : [item('info', t('todo.missing.title', { n: m[1] }), t('todo.missing.sub'), null)];
  },
  function timer(q, ctx, t) {
    if (!/^(\d|\.\d|timer\s)/i.test(q)) return null;
    const parsed = timers.parseTimerQuery(q);
    if (!parsed) return null;
    const time = timers.formatRemaining(parsed.ms);
    const title = parsed.label ? t('timer.start.titleFor', { time, label: parsed.label }) : t('timer.start.title', { time });
    return [item('timer', title, t('timer.start.sub'), { type: 'timerStart', ms: parsed.ms, label: parsed.label })];
  },
  function clips(q, ctx, t) {
    return /^clips?$/i.test(q) && ctx.clipboardOn ? clipItems(ctx, t) : null;
  },
];

function suggest(query, ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : EN;
  return route(query, ctx, t).map(decorate(t));
}

function route(query, ctx, t) {
  const q = String(query == null ? '' : query).trim().slice(0, 500);
  if (!q) return emptyQuery(ctx, t);

  for (const route of ROUTES) {
    const hit = route(q, ctx, t);
    if (hit) return hit.slice(0, MAX_RESULTS);
  }

  const pool = [...shortcutItems(ctx), ...todoItems(ctx, t), ...timerItems(ctx, t), ...systemCommands(ctx, t)];
  const matches = rank(pool, q, (r) => (r.keys ? `${r.title} ${r.keys}` : r.title)).slice(0, MAX_RESULTS);
  if (matches.length) return matches.map(({ keys, ...r }) => r);

  return [
    searchItem(t, ctx.search, q),
    item('note', titled(t('note.saveTitle', { text: q })), t('note.sub'), { type: 'note', text: q }),
  ];
}

module.exports = { suggest, searchUrl, MAX_RESULTS, SEARCH };
