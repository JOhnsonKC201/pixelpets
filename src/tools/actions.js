// Runs a launcher result's `action`. Only main ever reaches this: the launcher
// window sends back an index into the list main computed, and main looks the
// action up itself, so nothing here trusts a value that came from a renderer.
//
// `api` is the registry's view of the world (tools/index.js):
//   cfg(), say(text, opts), notify(...), persistTools(patch), persistTodos(todos),
//   today(), timers / setTimers(list), clips(), rememberClip(text), notesFile(),
//   sendAction(id), triggerBreak(), openSettings(), rebuildTray(),
//   t(key, vars): the user's language (English when a caller has none)

const system = require('./system');
const timersLib = require('./timers');
const todosLib = require('./todos');
const textfix = require('./textfix');
const { translator, FALLBACK } = require('../i18n');

const EN = translator(FALLBACK);
const tr = (api) => (typeof api.t === 'function' ? api.t : EN);
// system.js reports a result as a message key, so it is said in the user's language.
const told = (api, r) => (r && r.key ? tr(api)(r.key, r.vars) : r && r.message);
const fail = (api, r) => { if (r && !r.ok && told(api, r)) api.say(told(api, r), { level: 'warn' }); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RUNNERS = {
  copy(api, a) {
    system.copyText(a.text);
    api.say(tr(api)('say.copied', { text: a.text }));
  },
  async search(api, a) {
    fail(api, await system.openSearch(a.engine, a.query));
  },
  async note(api, a) {
    const r = await system.appendNote(api.notesFile(), a.text);
    if (r.ok) api.say(tr(api)('say.noted'));
    else fail(api, r);
  },
  async openNotes(api) {
    fail(api, await system.openNotes(api.notesFile()));
  },
  todoAdd(api, a) {
    const r = todosLib.add(api.today(), a.text);
    if (!r.ok) {
      api.say(tr(api)(r.reason === 'full' ? 'say.todo.full' : 'say.todo.empty'));
      return;
    }
    api.persistTodos(r.state);
    const { left } = todosLib.counts(r.state);
    api.say(tr(api)('say.todo.added', { count: left }));
  },
  todoToggle(api, a) {
    const before = api.today();
    const next = todosLib.toggle(before, a.id);
    if (next === before) return;
    api.persistTodos(next);
    const item = next.items.find((t) => t.id === a.id);
    if (!item || !item.done) return;
    const { left } = todosLib.counts(next);
    api.sendAction('play');
    api.say(left ? tr(api)('say.todo.left', { count: left }) : tr(api)('say.todo.allDone'), { sound: true });
  },
  timerStart(api, a) {
    const r = timersLib.add(api.timers(), { now: Date.now(), ms: a.ms, label: a.label });
    if (!r.ok) { api.say(tr(api)('say.timer.limit', { max: timersLib.MAX_TIMERS })); return; }
    api.setTimers(r.list);
    const time = timersLib.formatRemaining(a.ms);
    api.say(a.label ? tr(api)('say.timer.setFor', { time, label: a.label }) : tr(api)('say.timer.set', { time }));
  },
  timerCancel(api, a) {
    api.setTimers(timersLib.cancel(api.timers(), a.id));
    api.say(tr(api)('say.timer.cancelled'));
  },
  async openShortcut(api, a) {
    const sc = (api.cfg().tools.shortcuts || []).find((s) => s.id === a.id);
    if (!sc) { api.say(tr(api)('say.shortcut.gone')); return; }
    fail(api, await system.openTarget(sc.target));
  },
  clip(api, a) {
    const text = api.clips()[a.index];
    if (typeof text !== 'string') return;
    api.rememberClip(text);   // so the poller does not count our own write as a new copy
    system.copyText(text);
    api.say(tr(api)('say.clip.copied'));
  },
  // Reads the clipboard now, on request, and never passes the text to say():
  // a bubble on screen is no place for whatever someone just copied.
  textfix(api, a) {
    const r = textfix.apply(a.op, system.readText());
    if (!r.ok) { api.say(tr(api)(r.reason === 'big' ? 'say.text.tooBig' : 'say.text.none')); return; }
    if (r.stats) { api.say(tr(api)('say.text.count', r.stats), { ttl: 7000 }); return; }
    api.rememberClip(r.text);   // our own write is not a new copy for clipboard history
    system.copyText(r.text);
    api.say(tr(api)('say.text.done'));
  },
  async system(api, a) {
    switch (a.what) {
      case 'snip': {
        await pause(150);   // let the launcher finish hiding so it is not in the shot
        const r = await system.snip();
        if (r.ok && told(api, r)) api.say(told(api, r)); else fail(api, r);
        return;
      }
      case 'lock':
        fail(api, await system.lockScreen());
        return;
      case 'keepAwake': {
        const on = system.setKeepAwake(!system.isKeepAwake());
        api.rebuildTray();
        api.say(tr(api)(on ? 'say.awake.on' : 'say.awake.off'));
        return;
      }
      case 'clipboard': {
        const on = !api.cfg().tools.clipboard;
        api.persistTools({ clipboard: on });
        api.say(tr(api)(on ? 'say.clipboard.on' : 'say.clipboard.off'));
        return;
      }
      case 'break': api.triggerBreak(); return;
      case 'settings': api.openSettings(); return;
      default: return;
    }
  },
};

async function runAction(api, action) {
  const fn = action && Object.prototype.hasOwnProperty.call(RUNNERS, action.type) ? RUNNERS[action.type] : null;
  if (!fn) return;
  try { await fn(api, action); }
  catch (e) {
    if (api.log) api.log.error(`quick tools action failed: ${action.type}`, e);
    api.say(tr(api)('say.error'), { level: 'warn' });
  }
}

module.exports = { runAction };
