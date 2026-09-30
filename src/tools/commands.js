// The Quick Tools router: what you type in the launcher becomes a short list of
// results. Pure: no Electron, no clock of its own (ctx.now), no side effects.
//
// Each result is { id, kind, title, subtitle, action, stay?, checked? }. The
// `action` is a small tagged object that ONLY main executes: the launcher window
// is sent titles and sends back an index, so it can never hand main a URL, a
// path or a command of its own. `stay` keeps the launcher open after running
// (ticking a to-do), everything else closes it.

const calc = require('./calc');
const units = require('./units');
const timers = require('./timers');
const todosLib = require('./todos');
const { preview } = require('./clipboard');
const { rank } = require('./fuzzy');

const MAX_RESULTS = 8;
const MAX_EMPTY = 16;

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

function systemCommands(ctx) {
  const mac = ctx.platform === 'darwin';
  return [
    item('system', 'Snip screen', mac ? 'Drag to capture, copied to the clipboard' : 'Opens the Windows snipping tool', { type: 'system', what: 'snip' }, { icon: 'snip', keys: 'screenshot capture' }),
    item('system', mac ? 'Sleep display' : 'Lock screen', mac ? 'Locks too, if your Mac asks for a password on wake' : 'Lock this PC now', { type: 'system', what: 'lock' }, { icon: 'lock', keys: 'lock screen sleep' }),
    item('system', 'Keep screen awake', ctx.keepAwake ? 'On: the screen will not sleep' : 'For downloads, talks and long reads', { type: 'system', what: 'keepAwake' }, { icon: 'awake', toggle: true, checked: !!ctx.keepAwake, keys: 'caffeine no sleep' }),
    item('system', 'Open notes', 'Your quick notes file', { type: 'openNotes' }, { icon: 'notes' }),
    item('system', 'Clipboard history', 'Memory only, never saved, skips passwords and keys', { type: 'system', what: 'clipboard' }, { icon: 'clipboard', toggle: true, checked: !!ctx.clipboardOn, keys: 'clips paste' }),
    item('system', 'Take a break now', 'Stretch with your pet', { type: 'system', what: 'break' }, { icon: 'break', keys: 'stretch rest' }),
    item('system', 'Settings', 'Shortcuts, hotkey and more', { type: 'system', what: 'settings' }, { icon: 'settings', keys: 'preferences options' }),
  ];
}

const shortcutItems = (ctx) => (ctx.shortcuts || []).map((s) =>
  item('shortcut', s.label, s.target, { type: 'openShortcut', id: s.id }));

const todoItems = (ctx) => ((ctx.todos && ctx.todos.items) || []).map((t, i) =>
  item('todo', t.text, `To-do ${i + 1}${t.done ? ', done' : ''}`, { type: 'todoToggle', id: t.id }, { stay: true, checked: t.done }));

const timerItems = (ctx) => (ctx.timers || []).map((t) =>
  item('timer', `${t.label || 'Timer'}: ${timers.formatRemaining(t.endsAt - ctx.now)} left`, 'Enter to cancel', { type: 'timerCancel', id: t.id }));

const clipItems = (ctx) => (ctx.clipboardOn ? (ctx.clips || []) : []).map((c, index) =>
  item('clip', preview(c), 'Copy again', { type: 'clip', index }));

// The empty query is a dashboard: what you pinned, what is on today, what is
// running, then the one-press actions. `section` is what the launcher draws as
// a group header; the order here is the order on screen.
const inSection = (section) => (r) => ({ ...r, section });
function emptyQuery(ctx) {
  return [
    ...shortcutItems(ctx).slice(0, 6).map(inSection('Pinned')),
    ...todoItems(ctx).map(inSection('Today')),
    ...timerItems(ctx).map(inSection('Timers')),
    ...clipItems(ctx).slice(0, 3).map(inSection('Recent clips')),
    ...systemCommands(ctx).map(inSection('Actions')),
  ].slice(0, MAX_EMPTY);
}

// ---- presentation --------------------------------------------------------------
// Every result gets an icon id (drawn by launcher-icons.js) and a short verb for
// the selected row ("Open", "Copy", "Done"). Filled in one place so a new route
// only has to say what it does, not how it looks.
const KIND_ICON = { calc: 'calc', convert: 'convert', search: 'search', note: 'note', todo: 'todo', timer: 'timer', clip: 'clipboard', info: 'info' };
const HINTS = { copy: 'Copy', search: 'Search', note: 'Save', openNotes: 'Open', todoAdd: 'Add', timerStart: 'Start',
  timerCancel: 'Cancel', openShortcut: 'Open', clip: 'Copy', system: 'Run' };

function shortcutIcon(target) {
  if (/^mailto:/i.test(target)) return 'mail';
  if (/^https?:/i.test(target)) return 'link';
  if (/\.(exe|app|lnk)$/i.test(target)) return 'app';
  return /\.[a-z0-9]{1,5}$/i.test(target) ? 'file' : 'folder';
}

function hintFor(r) {
  if (!r.action) return '';
  if (r.toggle) return r.checked ? 'Turn off' : 'Turn on';
  if (r.action.type === 'todoToggle') return r.checked ? 'Undo' : 'Done';
  return HINTS[r.action.type] || 'Run';
}

function decorate(r) {
  const icon = r.icon || (r.kind === 'shortcut' ? shortcutIcon(r.subtitle) : KIND_ICON[r.kind]) || 'info';
  return { ...r, icon, hint: hintFor(r) };
}

// Routes that recognise a specific shape. Each returns a result list or null.
const ROUTES = [
  function math(q) {
    if (!q.startsWith('=') && !calc.looksLikeMath(q)) return null;
    const r = calc.evaluate(q);
    if (!r.ok) return [item('info', 'Not a sum I can do', 'Try =12*7.5 or =sqrt(2)', null)];
    const text = calc.formatNumber(r.value);
    return [item('calc', text, 'Enter copies the answer', { type: 'copy', text })];
  },
  function convert(q) {
    const p = units.parseConversion(q);
    const r = p && units.convert(p.n, p.from, p.to);
    if (!r) return null;
    const text = calc.formatNumber(r.value, 6);
    return [item('convert', `${text} ${units.displayUnit(r.to)}`, `${p.n} ${units.displayUnit(r.from)}. Enter copies the number`, { type: 'copy', text })];
  },
  function search(q, ctx) {
    const m = /^(g|ddg|b)\s+(.+)$/i.exec(q);
    if (!m) return null;
    const engine = SEARCH_PREFIX[m[1].toLowerCase()];
    return [item('search', `Search ${ENGINE_NAME[engine]}: ${m[2]}`.slice(0, 80), 'Opens your browser', { type: 'search', engine, query: m[2] })];
  },
  function note(q) {
    const m = /^note\s+(.+)$/i.exec(q);
    return m ? [item('note', `Note: ${m[1]}`.slice(0, 80), 'Adds a line to your notes file', { type: 'note', text: m[1] })] : null;
  },
  function todoAdd(q) {
    const m = /^todo\s+(.+)$/i.exec(q);
    return m ? [item('todo', `Add to-do: ${m[1]}`.slice(0, 80), 'Up to 5 for today', { type: 'todoAdd', text: m[1] })] : null;
  },
  function done(q, ctx) {
    const m = /^done\s+(\d+)$/i.exec(q);
    if (!m) return null;
    const t = todosLib.byIndex(ctx.todos || { items: [] }, Number(m[1]));
    return t
      ? [item('todo', `${t.done ? 'Undo' : 'Done'}: ${t.text}`, `To-do ${m[1]}`, { type: 'todoToggle', id: t.id }, { stay: true, checked: t.done })]
      : [item('info', `There is no to-do ${m[1]}`, 'Type an empty query to see your list', null)];
  },
  function timer(q) {
    if (!/^(\d|\.\d|timer\s)/i.test(q)) return null;
    const t = timers.parseTimerQuery(q);
    if (!t) return null;
    const what = t.label ? ` for ${t.label}` : '';
    return [item('timer', `Start a ${timers.formatRemaining(t.ms)} timer${what}`, 'The pet tells you when it is up', { type: 'timerStart', ms: t.ms, label: t.label })];
  },
  function clips(q, ctx) {
    return /^clips?$/i.test(q) && ctx.clipboardOn ? clipItems(ctx) : null;
  },
];

function suggest(query, ctx) {
  return route(query, ctx).map(decorate);
}

function route(query, ctx) {
  const q = String(query == null ? '' : query).trim().slice(0, 500);
  if (!q) return emptyQuery(ctx);

  for (const route of ROUTES) {
    const hit = route(q, ctx);
    if (hit) return hit.slice(0, MAX_RESULTS);
  }

  const pool = [...shortcutItems(ctx), ...todoItems(ctx), ...timerItems(ctx), ...systemCommands(ctx)];
  // `keys` are extra words to match on ("screenshot" finds Snip) and never reach the UI.
  const matches = rank(pool, q, (r) => (r.keys ? `${r.title} ${r.keys}` : r.title)).slice(0, MAX_RESULTS);
  if (matches.length) return matches.map(({ keys, ...r }) => r);

  return [
    item('search', `Search ${ENGINE_NAME[ctx.search] || 'Google'}: ${q}`.slice(0, 80), 'Opens your browser', { type: 'search', engine: ctx.search, query: q }),
    item('note', `Save as a note: ${q}`.slice(0, 80), 'Adds a line to your notes file', { type: 'note', text: q }),
  ];
}

module.exports = { suggest, searchUrl, MAX_RESULTS, SEARCH };
