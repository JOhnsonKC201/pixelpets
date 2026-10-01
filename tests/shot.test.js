// The --shot capture is what the boot checks rely on, so it must fail on a page
// that did not load or a canvas with nothing drawn, not save a blank picture.
const test = require('node:test');
const assert = require('node:assert');
const { captureShot } = require('../src/main/shot');

function run({ painted, failLoad = false }) {
  return new Promise((resolve) => {
    const handlers = {};
    const written = [];
    const app = {
      exit: (code) => resolve({ code, written }),
      quit: () => resolve({ code: 0, written }),
    };
    const win = { webContents: {
      on: (name, fn) => { handlers[name] = fn; },
      executeJavaScript: async () => painted,
      capturePage: async () => ({ toPNG: () => Buffer.from('png') }),
    } };
    const origError = console.error, origLog = console.log;
    console.error = () => {}; console.log = () => {};
    captureShot({ app, win, delayMs: 0, out: 'shot.png', fs: { writeFileSync: (f, b) => written.push(f) } });
    if (failLoad) handlers['did-fail-load']({}, -6, 'ERR_FILE_NOT_FOUND', 'file:///x/index.html');
    else handlers['did-finish-load']();
    setTimeout(() => { console.error = origError; console.log = origLog; }, 50);
  });
}

test('a drawn canvas is saved and the app quits cleanly', async () => {
  assert.deepStrictEqual(await run({ painted: 120 }), { code: 0, written: ['shot.png'] });
});

test('an empty canvas fails the run and saves nothing', async () => {
  assert.deepStrictEqual(await run({ painted: 0 }), { code: 1, written: [] });
});

test('a page without the canvas fails the run', async () => {
  assert.deepStrictEqual(await run({ painted: -1 }), { code: 1, written: [] });
});

test('a page that did not load fails the run', async () => {
  assert.deepStrictEqual(await run({ painted: 120, failLoad: true }), { code: 1, written: [] });
});
