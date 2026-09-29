// Everything Quick Tools does to the operating system: open things, lock, snip,
// keep the screen awake, write the notes file. It is the ONLY tools file that
// touches `shell` or spawns a process, so it is the one file to audit.
//
// Rules this file keeps:
//   - execFile only, with a fixed absolute binary and fixed arguments. Never a
//     shell, never a string built from input.
//   - Shortcuts are re-validated right here, right before opening, so a
//     hand-edited settings.json cannot route around the Settings-time check.
//   - Every function reports failure as { ok: false, message } instead of
//     throwing, and the message is written for a person, not a log.

const { shell, powerSaveBlocker, clipboard } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const { validateTarget } = require('./shortcuts');
const { searchUrl } = require('./commands');

const EXEC_TIMEOUT_MS = 10000;
const SNIP_TIMEOUT_MS = 120000;   // macOS screencapture waits while you drag
const NOTE_MAX = 1000;
const NOTES_MAX_BYTES = 5 * 1024 * 1024;   // a notes file this big is a runaway, not notes

const run = (file, args, timeout = EXEC_TIMEOUT_MS) => new Promise((resolve) => {
  execFile(file, args, { timeout, windowsHide: true, shell: false }, (err) => resolve(!err));
});

// ---- keep awake ---------------------------------------------------------------
let blockerId = null;
function isKeepAwake() {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}
function setKeepAwake(on) {
  if (on && !isKeepAwake()) blockerId = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
  return isKeepAwake();
}

// ---- lock / snip ------------------------------------------------------------
async function lockScreen(platform = process.platform) {
  if (platform === 'win32') {
    const rundll = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe');
    return (await run(rundll, ['user32.dll,LockWorkStation'])) ? { ok: true } : { ok: false, message: 'I could not lock the screen.' };
  }
  if (platform === 'darwin') {
    // CGSession -suspend was removed in Big Sur. Sleeping the display locks the Mac
    // whenever "require password after sleep" is on, which is the default.
    return (await run('/usr/bin/pmset', ['displaysleepnow'])) ? { ok: true } : { ok: false, message: 'I could not sleep the display.' };
  }
  return { ok: false, message: 'Locking is not supported here yet.' };
}

async function snip(platform = process.platform) {
  if (platform === 'win32') {
    // A constant URI for the built-in Snipping Tool, never built from input.
    try { await shell.openExternal('ms-screenclip:'); return { ok: true }; }
    catch (e) { return { ok: false, message: 'Snipping Tool did not open. Try Win+Shift+S.' }; }
  }
  if (platform === 'darwin') {
    // Esc during the drag cancels without an error, so a changed clipboard image is
    // the real signal. Compared rather than cleared first: clearing would throw away
    // whatever the user had copied just to find out whether they snipped.
    const before = clipboard.readImage().toDataURL();
    await run('/usr/sbin/screencapture', ['-i', '-c'], SNIP_TIMEOUT_MS);
    const after = clipboard.readImage();
    return after.isEmpty() || after.toDataURL() === before
      ? { ok: false, message: 'No snip taken.' }
      : { ok: true, message: 'Snip copied. Paste it anywhere.' };
  }
  return { ok: false, message: 'Snipping is not supported here yet.' };
}

// ---- open things ------------------------------------------------------------
async function openTarget(target) {
  const v = validateTarget(target);
  if (!v) return { ok: false, message: 'That shortcut is not a web link or a full path.' };
  if (v.kind === 'url') {
    try { await shell.openExternal(v.value); return { ok: true }; }
    catch (e) { return { ok: false, message: 'Your browser did not open that link.' }; }
  }
  if (!fs.existsSync(v.value)) return { ok: false, message: 'That file or folder is gone.' };
  // A Windows .lnk opens whatever it points at, which the check above never saw.
  // Resolve it and hold the real target to the same allowlist (no UNC shares).
  if (process.platform === 'win32' && /\.lnk$/i.test(v.value)) {
    let link;
    try { link = shell.readShortcutLink(v.value); } catch (e) { link = null; }
    const real = link && link.target ? validateTarget(link.target) : null;
    if (!real || real.kind !== 'path') return { ok: false, message: 'That shortcut points somewhere I will not open.' };
  }
  const err = await shell.openPath(v.value);
  return err ? { ok: false, message: `I could not open it: ${err}` } : { ok: true };
}

async function openSearch(engine, query) {
  try { await shell.openExternal(searchUrl(engine, query)); return { ok: true }; }
  catch (e) { return { ok: false, message: 'Your browser did not open.' }; }
}

// ---- notes --------------------------------------------------------------------
const NOTES_HEADER = '# Quick notes\n\nLines added from the pixelpets launcher. Edit freely.\n\n';

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function appendNote(file, text, now = new Date()) {
  const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  if (!line) return { ok: false, message: 'Nothing to note.' };
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const exists = fs.existsSync(file);
    if (exists && (await fs.promises.stat(file)).size > NOTES_MAX_BYTES) {
      return { ok: false, message: 'Your notes file is over 5 MB. Open it and tidy up first.' };
    }
    await fs.promises.appendFile(file, `${exists ? '' : NOTES_HEADER}- ${stamp(now)} ${line}\n`, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'I could not write to your notes file.' };
  }
}

async function openNotes(file) {
  try {
    if (!fs.existsSync(file)) {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, NOTES_HEADER, 'utf8');
    }
  } catch (e) { return { ok: false, message: 'I could not create your notes file.' }; }
  const err = await shell.openPath(file);
  return err ? { ok: false, message: `I could not open your notes: ${err}` } : { ok: true };
}

function copyText(text) {
  clipboard.writeText(String(text));
}

module.exports = { isKeepAwake, setKeepAwake, lockScreen, snip, openTarget, openSearch, appendNote, openNotes, copyText, stamp };
