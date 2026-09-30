// installAppGuards against fake Electron objects. The real behaviour (a page
// cannot open the microphone, the battery API still works) was checked under
// Electron; this pins the wiring so it cannot quietly go away.
const test = require('node:test');
const assert = require('node:assert');
const { installAppGuards } = require('../src/main/app-guards');

function setup() {
  const handlers = {};
  const appEvents = {};
  const session = { defaultSession: {
    setPermissionRequestHandler: (fn) => { handlers.request = fn; },
    setPermissionCheckHandler: (fn) => { handlers.check = fn; },
  } };
  const app = { on: (name, fn) => { appEvents[name] = fn; } };
  const warnings = [];
  installAppGuards({ app, session, log: { warn: (m, d) => warnings.push([m, d]) } });
  return { handlers, appEvents, warnings };
}

test('every permission request is refused, and logged', () => {
  const { handlers, warnings } = setup();
  let answer = null;
  handlers.request({ getURL: () => 'file:///app/index.html' }, 'media', (ok) => { answer = ok; });
  assert.strictEqual(answer, false);
  assert.deepStrictEqual(warnings, [['denied a permission request', { permission: 'media', url: 'file:///app/index.html' }]]);
});

test('permission checks say no', () => {
  const { handlers } = setup();
  for (const p of ['notifications', 'geolocation', 'clipboard-read', 'media']) assert.strictEqual(handlers.check(null, p), false);
});

test('a request from contents that cannot report its url is still refused', () => {
  const { handlers } = setup();
  let answer = null;
  handlers.request({ getURL() { throw new Error('destroyed'); } }, 'geolocation', (ok) => { answer = ok; });
  assert.strictEqual(answer, false);
});

test('every new web contents gets navigation, pop-ups and webviews blocked', () => {
  const { appEvents } = setup();
  const on = {};
  let openHandler = null;
  appEvents['web-contents-created']({}, {
    on: (name, fn) => { on[name] = fn; },
    setWindowOpenHandler: (fn) => { openHandler = fn; },
  });
  for (const name of ['will-navigate', 'will-attach-webview']) {
    let prevented = false;
    on[name]({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented, `${name} was not prevented`);
  }
  assert.deepStrictEqual(openHandler({ url: 'https://example.com' }), { action: 'deny' });
});
