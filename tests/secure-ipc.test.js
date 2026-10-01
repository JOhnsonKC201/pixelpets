const test = require('node:test');
const assert = require('node:assert');
const { makeSecureIpc } = require('../src/main/secure-ipc');

const overlay = { name: 'overlay' };
const launcher = { name: 'launcher' };
const stranger = { name: 'stranger' };

function setup() {
  const on = new Map(), handle = new Map();
  const ipcMain = { on: (ch, fn) => on.set(ch, fn), handle: (ch, fn) => handle.set(ch, fn) };
  const ipc = makeSecureIpc({
    ipcMain,
    isMainWindow: (wc) => wc === overlay,
    hasOwnChannels: (wc) => wc === launcher,
  });
  return { ipc, on, handle };
}
const ev = (sender, url = 'file:///app/index.html') => ({ sender, senderFrame: { url } });

test('our own windows are trusted', () => {
  const { ipc } = setup();
  assert.strictEqual(ipc.isTrustedSender(ev(overlay, 'https://evil.example')), true);
});

test('a window with its own channels never reaches the shared ones, even from file://', () => {
  const { ipc } = setup();
  assert.strictEqual(ipc.isTrustedSender(ev(launcher)), false);
});

test('an unknown sender is trusted only from a local file:// page', () => {
  const { ipc } = setup();
  assert.strictEqual(ipc.isTrustedSender(ev(stranger)), true);
  assert.strictEqual(ipc.isTrustedSender(ev(stranger, 'https://evil.example')), false);
  assert.strictEqual(ipc.isTrustedSender({ sender: stranger }), false);
  assert.strictEqual(ipc.isTrustedSender({}), false);
  assert.strictEqual(ipc.isTrustedSender(null), false);
});

test('a frame whose url throws is not trusted', () => {
  const { ipc } = setup();
  const e = { sender: stranger, get senderFrame() { throw new Error('frame gone'); } };
  assert.strictEqual(ipc.isTrustedSender(e), false);
});

test('guarded listeners run for trusted senders only', () => {
  const { ipc, on } = setup();
  const got = [];
  ipc.onSecure('ping', (_e, x) => got.push(x));
  on.get('ping')(ev(overlay), 1);
  on.get('ping')(ev(launcher), 2);
  on.get('ping')(ev(stranger, 'https://evil.example'), 3);
  assert.deepStrictEqual(got, [1]);
});

test('guarded handlers answer undefined to anyone untrusted', async () => {
  const { ipc, handle } = setup();
  ipc.handleSecure('settings:get', () => ({ secret: true }));
  assert.deepStrictEqual(await handle.get('settings:get')(ev(overlay)), { secret: true });
  assert.strictEqual(await handle.get('settings:get')(ev(launcher)), undefined);
});
