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
    item('system', 'Snip screen', mac ? 'Drag to capture, copied to the clipboard' : 'Opens the Windows snipping tool', { type: 'system', what: 'snip' }, { keys: 'screenshot capture' }),
    item('system', mac ? 'Sleep display' : 'Lock screen', mac ? 'Locks too, if your Mac asks for a password on wake' : 'Lock this PC now', { type: 'system', what: 'lock' }, { keys: 'lock screen sleep' }),
    item('system', `Keep awake: turn ${ctx.keepAwake ? 'off' : 'on'}`, ctx.keepAwake ? 'Let the screen sleep again' : 'Stops the screen sleeping (downloads, talks)', { type: 'system', what: 'keepAwake' }, { checked: !!ctx.keepAwake, keys: 'caffeine no sleep' }),
    item('system', 'Open notes', 'Your quick notes file', { type: 'openNotes' }),
    item('system', `Clipboard history: turn ${ctx.clipboardOn ? 'off' : 'on'}`, 'Memory only, never saved, skips passwords and keys', { type: 'system', what: 'clipboard' }, { checked: !!ctx.clipboardOn }),
    item('system', 'Take a break now', 'Stretch with your pet', { type: 'system', what: 'break' }, { keys: 'stretch rest' }),
    item('system', 'Settings', 'Shortcuts, hotkey and more', { type: 'system', what: 'settings' }),
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

function emptyQuery(ctx) {
  return [
    ...shortcutItems(ctx).slice(0, 6),
    ...todoItems(ctx),
    ...timerItems(ctx),
    ...clipItems(ctx).slice(0, 3),
    ...systemCommands(ctx),
  ].slice(0, MAX_EMPTY);
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
