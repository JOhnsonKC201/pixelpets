// Runs a launcher result's `action`. Only main ever reaches this: the launcher
// window sends back an index into the list main computed, and main looks the
// action up itself, so nothing here trusts a value that came from a renderer.
//
// `api` is the registry's view of the world (tools/index.js):
//   cfg(), say(text, opts), notify(...), persistTools(patch), persistTodos(todos),
//   today(), timers / setTimers(list), clips(), rememberClip(text), notesFile(),
//   sendAction(id), triggerBreak(), openSettings(), rebuildTray()

const system = require('./system');
const timersLib = require('./timers');
const todosLib = require('./todos');

const fail = (api, r) => { if (r && !r.ok && r.message) api.say(r.message, { level: 'warn' }); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RUNNERS = {
  copy(api, a) {
    system.copyText(a.text);
    api.say(`Copied ${a.text}`);
  },
  async search(api, a) {
    fail(api, await system.openSearch(a.engine, a.query));
  },
  async note(api, a) {
    const r = await system.appendNote(api.notesFile(), a.text);
    if (r.ok) api.say('Noted. Type "open notes" any time to read them.');
    else fail(api, r);
  },
  async openNotes(api) {
    fail(api, await system.openNotes(api.notesFile()));
  },
  todoAdd(api, a) {
    const r = todosLib.add(api.today(), a.text);
    if (!r.ok) {
      api.say(r.reason === 'full' ? 'Five is plenty for one day. Finish one first!' : 'That to-do was empty.');
      return;
    }
    api.persistTodos(r.state);
    const { left } = todosLib.counts(r.state);
    api.say(`Added. ${left} to do today.`);
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
    api.say(left ? `Nice! ${left} left.` : 'All done for today!', { sound: true });
  },
  timerStart(api, a) {
    const r = timersLib.add(api.timers(), { now: Date.now(), ms: a.ms, label: a.label });
    if (!r.ok) { api.say(`${timersLib.MAX_TIMERS} timers at once is my limit.`); return; }
    api.setTimers(r.list);
    api.say(`Timer set: ${timersLib.formatRemaining(a.ms)}${a.label ? ` for ${a.label}` : ''}.`);
  },
  timerCancel(api, a) {
    api.setTimers(timersLib.cancel(api.timers(), a.id));
    api.say('Timer cancelled.');
  },
  async openShortcut(api, a) {
    const sc = (api.cfg().tools.shortcuts || []).find((s) => s.id === a.id);
    if (!sc) { api.say('That shortcut is gone.'); return; }
    fail(api, await system.openTarget(sc.target));
  },
  clip(api, a) {
    const text = api.clips()[a.index];
    if (typeof text !== 'string') return;
    api.rememberClip(text);   // so the poller does not count our own write as a new copy
    system.copyText(text);
    api.say('Copied. Paste it where you want.');
  },
  async system(api, a) {
    switch (a.what) {
      case 'snip': {
        await pause(150);   // let the launcher finish hiding so it is not in the shot
        const r = await system.snip();
        if (r.ok && r.message) api.say(r.message); else fail(api, r);
        return;
      }
      case 'lock':
        fail(api, await system.lockScreen());
        return;
      case 'keepAwake': {
        const on = system.setKeepAwake(!system.isKeepAwake());
        api.rebuildTray();
        api.say(on ? 'Keeping the screen awake. Turn it off from the tray or here.' : 'The screen can sleep again.');
        return;
      }
      case 'clipboard': {
        const on = !api.cfg().tools.clipboard;
        api.persistTools({ clipboard: on });
        api.say(on ? 'Clipboard history on. Kept in memory only, never saved.' : 'Clipboard history off and cleared.');
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
  catch (e) { api.say('Something went wrong there.', { level: 'warn' }); }
}

module.exports = { runAction };
