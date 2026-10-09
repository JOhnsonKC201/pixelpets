// Settings window logic. Reads config from main, writes edits back (debounced),
// and renders the reminders list. Main normalizes + persists + broadcasts, so we
// just send intent and re-render from whatever main returns.
const $ = (id) => document.getElementById(id);
let cfg = null;

// ---- section rail ----------------------------------------------------------
// Everything used to live in one 3400px column inside a 560px window, so finding
// "pomodoro" meant scrolling past ten cards. Panels are shown by the `hidden`
// attribute alone; aria-selected and the roving tabindex follow it.
const TABS = Array.from(document.querySelectorAll('.tab'));
function selectTab(key, { focus = false } = {}) {
  for (const t of TABS) {
    const on = t.dataset.panel === key;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;                    // one stop for the whole rail, arrows move within it
    const panel = $('panel-' + t.dataset.panel);
    if (panel) panel.hidden = !on;
    if (on && focus) t.focus();
  }
  window.scrollTo(0, 0);                          // a fresh panel starts at its top, not the last panel's offset
}
TABS.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.panel));
  t.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    let next = null;
    if (step) next = TABS[(i + step + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next.dataset.panel, { focus: true });
  });
});
selectTab('pet');

// ---- per-species wording ---------------------------------------------------
// The strings live in pets.js next to the tray's, so the two windows cannot end up
// describing the same toggle differently (the settings window said "Butterfly
// visits" at dog owners while the tray already said "Ball to chase").
function applySpeciesText() {
  const isMac = !!(window.settings && window.settings.platform === 'darwin');
  const text = settingsText(curSpecies(), { bar: isMac ? 'Dock' : 'taskbar' });
  for (const [id, s] of Object.entries(text)) { const el = $(id); if (el) el.textContent = s; }
  // A dog's "go chase something" and its "give" are the same ball, so showing both
  // would put two buttons that do the identical thing side by side. Cats get the
  // treat as a separate act; dogs do not.
  const give = $('actGive');
  if (give) give.hidden = curSpecies() === 'dog';
}

// Populate the coat dropdown from the built-in names plus any custom coats.
let themes = [];
// Which species the window is currently editing, and therefore which list of
// coats to show and which config field a pick writes to.
function curSpecies() { return (cfg && cfg.species === 'dog') ? 'dog' : 'cat'; }
function coatField() { return curSpecies() === 'dog' ? 'dogPattern' : 'pattern'; }
function populateCoats() {
  const sel = $('pattern'); const cur = sel.value;
  const dog = curSpecies() === 'dog';
  sel.innerHTML = '';
  // Custom coats are built from the cat's geometry, so they are only offered for cats.
  const base = dog ? (window.DOG_COATS || []) : (window.PATTERN_NAMES || []);
  const names = dog ? base.slice() : base.concat(themes.map((t) => t.name));
  names.forEach((name, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = name; sel.appendChild(o); });
  if (cfg) sel.value = String(cfg[coatField()] || 0); else if (cur) sel.value = cur;
  const spSel = $('species'); if (spSel) spSel.value = curSpecies();
  // Coat vs Breed, which voice the Sound row promises, whether custom coats apply:
  // all of it is one lookup now.
  applySpeciesText();
  drawPreview();
}
function drawPreview() {
  const P = window.PixelcatPreview, cv = $('coatPreview');
  if (!P || !cv) return;
  const i = Number($('pattern').value) || 0;
  if (curSpecies() === 'dog') {
    // Bare identifiers, NOT window.*: dog-sprite.js is a classic script whose top-level
    // `const`s live in the global LEXICAL scope and never become window properties (it
    // has no window-export branch, only module.exports). Reading window.DOG_PATTERNS
    // got undefined, so this returned early and left the cat on the canvas - the dog
    // coat preview never drew once. cat-preview.js's drawDog reads them the same way.
    const pal = DOG_PATTERNS[i];
    if (!pal || !P.drawDog) return;
    P.drawDog(cv, pal, DOG_PATTERN_BUILD[i]);
    return;
  }
  let pal, build, tabby;
  if (i < P.PATTERNS.length) { pal = P.PATTERNS[i]; build = P.PATTERN_BUILD[i]; tabby = P.TABBY[i]; }
  else { const t = themes[i - P.PATTERNS.length]; if (!t) return; pal = t; build = t.build; tabby = t.tabby; }
  P.draw(cv, pal, build, tabby);
}
function renderThemes() {
  const ul = $('themes'); if (!ul) return; ul.innerHTML = '';
  if (!themes.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No custom coats yet.'; ul.appendChild(li); return; }
  for (const t of themes) {
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = t.coat; sw.style.borderColor = t.outline;
    const m = document.createElement('span'); m.className = 'm'; m.textContent = t.name + ' · ' + t.build + (t.tabby ? ' · tabby' : '');
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.title = 'Remove';
    x.onclick = async () => { themes = await window.settings.deleteTheme(t.name); populateCoats(); renderThemes(); };
    li.append(sw, m, x); ul.appendChild(li);
  }
}
populateCoats();

function render() {
  if (!cfg) return;
  // Don't stomp the name field while the user is typing in it (a broadcast config
  // echo would otherwise overwrite it with the normalized value and jump the caret).
  if (document.activeElement !== $('name')) $('name').value = cfg.name || '';
  // Rebuild from the config's species before reading a coat index out of it. The
  // first config and the first theme list arrive as two independent IPC replies, so
  // whenever the themes won the race a dog owner got the cat's coat list.
  populateCoats();
  $('pattern').value = String(cfg[coatField()] || 0);
  $('breakMinutes').value = String(cfg.breakMinutes || 0);
  $('followCursor').checked = !!cfg.followCursor;
  $('huntOn').checked = !!cfg.huntOn;
  $('butterflyOn').checked = cfg.butterflyOn === undefined ? true : !!cfg.butterflyOn;
  $('moodOn').checked = cfg.moodOn === undefined ? true : !!cfg.moodOn;
  $('soundOn').checked = !!cfg.soundOn;
  $('notifyOn').checked = cfg.notifyOn === undefined ? true : !!cfg.notifyOn;
  const quiet = cfg.quietHours || { on: false, start: '22:00', end: '08:00' };
  $('quietOn').checked = !!quiet.on;
  $('quietStart').value = quiet.start || '22:00';
  $('quietEnd').value = quiet.end || '08:00';
  const foc = cfg.focus || { on: true, meetings: true, digest: true };
  $('focusOn').checked = foc.on !== false;
  $('focusMeetings').checked = foc.meetings !== false;
  $('focusDigest').checked = foc.digest !== false;
  $('volume').value = cfg.volume === undefined ? 100 : cfg.volume;
  $('volumeVal').textContent = ($('volume').value | 0) + '%';
  $('onTop').checked = cfg.onTop === undefined ? true : !!cfg.onTop;
  $('roamOn').checked = cfg.roamOn === undefined ? true : !!cfg.roamOn;
  $('floorLock').checked = cfg.floorLock === undefined ? true : !!cfg.floorLock;
  $('restSide').value = cfg.restSide === 'left' ? 'left' : 'right';
  $('workMode').checked = !!cfg.workMode;
  $('reducedMotion').checked = !!cfg.reducedMotion;
  $('lowPower').checked = !!cfg.lowPower;
  $('lowPowerOnBattery').checked = cfg.lowPowerOnBattery === undefined ? true : !!cfg.lowPowerOnBattery;
  const pomo = cfg.pomodoro || { on: false, focusMin: 25, breakMin: 5 };
  $('pomoOn').checked = !!pomo.on;
  $('pomoFocus').value = String(pomo.focusMin || 25);
  $('pomoBreak').value = String(pomo.breakMin || 5);
  if (document.activeElement !== $('pinnedNote')) $('pinnedNote').value = cfg.pinnedNote || '';
  const em = cfg.email || {};
  $('emailOn').checked = !!em.on;
  if (document.activeElement !== $('emailUser')) $('emailUser').value = em.user || '';
  if (document.activeElement !== $('emailHost')) $('emailHost').value = em.host || 'imap.gmail.com';
  if (document.activeElement !== $('emailPort')) $('emailPort').value = String(em.port || 993);
  if (document.activeElement !== $('emailInterval')) $('emailInterval').value = String(em.intervalMin || 5);
  if (document.activeElement !== $('emailVip')) $('emailVip').value = (em.vip || []).join(', ');
  refreshEmailPassState();
  const lj = cfg.lobbyJam || { on: false, mood: 'cozy' };
  $('lobbyJamOn').checked = !!lj.on;
  $('lobbyJamMood').value = lj.mood || 'cozy';
  const cal = cfg.calendar || {};
  $('calOn').checked = !!cal.on;
  if (document.activeElement !== $('calUrl')) $('calUrl').value = cal.icsUrl || '';
  if (document.activeElement !== $('calLead')) $('calLead').value = String(cal.leadMin == null ? 10 : cal.leadMin);
  renderUpdates();
  renderReminders();
  renderTools();
  drawPreview();
}
function recurLabel(r) {
  const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const recur = r.recur || 'daily';
  if (recur === 'daily') return '  \u00b7 daily';
  if (recur === 'weekdays') return '  \u00b7 weekdays';
  if (recur === 'once') return '  \u00b7 once';
  if (recur === 'weekly') return '  \u00b7 ' + ((r.days || []).map((d) => dn[d]).join(' ') || 'weekly');
  return '';
}
function renderReminders() {
  const ul = $('reminders'); ul.innerHTML = '';
  if (!cfg.reminders.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = 'No reminders yet.'; ul.appendChild(li); return;
  }
  for (const r of cfg.reminders) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 't'; t.textContent = r.hhmm;
    const m = document.createElement('span'); m.className = 'm'; m.textContent = r.message + recurLabel(r);
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.title = 'Remove';
    x.onclick = () => save({ reminders: cfg.reminders.filter((q) => q.id !== r.id) });
    li.append(t, m, x); ul.appendChild(li);
  }
}

// Send a partial update; main returns the normalized, persisted config.
async function save(partial) { cfg = await window.settings.save({ ...cfg, ...partial }); render(); }

let nameTimer = null;
$('name').addEventListener('input', () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => save({ name: $('name').value }), 300);
});
$('pattern').addEventListener('change', () => { save({ [coatField()]: Number($('pattern').value) }); drawPreview(); });
$('species').addEventListener('change', () => {
  const next = $('species').value === 'dog' ? 'dog' : 'cat';
  if (cfg) cfg.species = next;             // optimistic, so the list swaps before main echoes back
  save({ species: next });
  populateCoats();
});
$('breakMinutes').addEventListener('change', () => save({ breakMinutes: Number($('breakMinutes').value) }));
$('followCursor').addEventListener('change', () => save({ followCursor: $('followCursor').checked }));
$('huntOn').addEventListener('change', () => save({ huntOn: $('huntOn').checked }));
$('butterflyOn').addEventListener('change', () => save({ butterflyOn: $('butterflyOn').checked }));
$('moodOn').addEventListener('change', () => save({ moodOn: $('moodOn').checked }));
$('soundOn').addEventListener('change', () => save({ soundOn: $('soundOn').checked }));
$('notifyOn').addEventListener('change', () => save({ notifyOn: $('notifyOn').checked }));
const quietSave = () => save({ quietHours: { on: $('quietOn').checked, start: $('quietStart').value, end: $('quietEnd').value } });
$('quietOn').addEventListener('change', quietSave);
$('quietStart').addEventListener('change', quietSave);
$('quietEnd').addEventListener('change', quietSave);
const focusSave = () => save({ focus: { on: $('focusOn').checked, meetings: $('focusMeetings').checked, digest: $('focusDigest').checked } });
$('focusOn').addEventListener('change', focusSave);
$('focusMeetings').addEventListener('change', focusSave);
$('focusDigest').addEventListener('change', focusSave);
$('volume').addEventListener('input', () => { $('volumeVal').textContent = ($('volume').value | 0) + '%'; });
$('volume').addEventListener('change', () => save({ volume: Number($('volume').value) }));
$('onTop').addEventListener('change', () => save({ onTop: $('onTop').checked }));
$('roamOn').addEventListener('change', () => save({ roamOn: $('roamOn').checked }));
$('floorLock').addEventListener('change', () => save({ floorLock: $('floorLock').checked }));
$('restSide').addEventListener('change', () => save({ restSide: $('restSide').value }));
$('workMode').addEventListener('change', () => save({ workMode: $('workMode').checked }));
$('reducedMotion').addEventListener('change', () => save({ reducedMotion: $('reducedMotion').checked }));
$('lowPower').addEventListener('change', () => save({ lowPower: $('lowPower').checked }));
$('lowPowerOnBattery').addEventListener('change', () => save({ lowPowerOnBattery: $('lowPowerOnBattery').checked }));
$('clearArea').addEventListener('click', () => save({ playArea: null }));
const pomoSave = () => save({ pomodoro: { on: $('pomoOn').checked, focusMin: Number($('pomoFocus').value), breakMin: Number($('pomoBreak').value) } });
$('pomoOn').addEventListener('change', pomoSave);
$('pomoFocus').addEventListener('change', pomoSave);
$('pomoBreak').addEventListener('change', pomoSave);
const lobbyJamSave = () => save({ lobbyJam: { on: $('lobbyJamOn').checked, mood: $('lobbyJamMood').value } });
$('lobbyJamOn').addEventListener('change', lobbyJamSave);
$('lobbyJamMood').addEventListener('change', lobbyJamSave);
let noteTimer = null;
$('pinnedNote').addEventListener('input', () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => save({ pinnedNote: $('pinnedNote').value }), 300);
});

const selectedDays = new Set([1, 2, 3, 4, 5]);
function paintDays() {
  const dp = $('dayPicker'); if (!dp) return;
  for (const b of dp.children) { const on = selectedDays.has(Number(b.dataset.dow)); b.style.opacity = on ? '1' : '0.4'; b.style.fontWeight = on ? '700' : '400'; }
}
function buildDayPicker() {
  const dp = $('dayPicker'); if (!dp || dp.childElementCount) return;
  const dn = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  for (let d = 0; d < 7; d++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = dn[d]; b.dataset.dow = String(d);
    b.style.cssText = 'width:24px;height:24px;padding:0;border-radius:6px;font-size:11px;cursor:pointer;';
    b.onclick = () => { const dow = Number(b.dataset.dow); if (selectedDays.has(dow)) selectedDays.delete(dow); else selectedDays.add(dow); paintDays(); };
    dp.appendChild(b);
  }
  paintDays();
}
function syncRecurUI() { const wk = $('newRecur').value === 'weekly'; $('dayPicker').style.display = wk ? 'flex' : 'none'; if (wk) buildDayPicker(); }
$('newRecur').addEventListener('change', syncRecurUI);
syncRecurUI();
$('addReminder').addEventListener('click', () => {
  const hhmm = $('newTime').value, message = $('newMsg').value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm) || !message) { $('newTime').focus(); return; }
  const id = `r${Date.now().toString(36)}${Math.floor(performance.now()).toString(36)}`;
  const recur = $('newRecur').value;
  const days = recur === 'weekly' ? Array.from(selectedDays).sort((a, b) => a - b) : [];
  save({ reminders: [...cfg.reminders, { id, hhmm, message, recur, days }] });
  $('newMsg').value = '';
});
$('newMsg').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addReminder').click(); });

function emailSave() {
  const port = Number($('emailPort').value) || 993;
  // Split on commas AND whitespace: people paste address lists in both shapes, and
  // config.js does the trimming, lowercasing, de-duping and bounding from here.
  const vip = $('emailVip').value.split(/[,\s]+/).map((v) => v.trim()).filter(Boolean);
  save({ email: { on: $('emailOn').checked, user: $('emailUser').value.trim(), host: $('emailHost').value.trim(), port, secure: port !== 143, intervalMin: Number($('emailInterval').value) || 5, vip } });   // port 143 => STARTTLS (secure:false); config guards the downgrade
}
['emailOn', 'emailUser', 'emailHost', 'emailPort', 'emailInterval', 'emailVip'].forEach((id) => $(id).addEventListener('change', emailSave));
// Switching alerts on with half the details filled in used to do nothing at all -
// the poller stays deliberately quiet until it is fully configured - so say what is
// still missing rather than leaving the user watching a cat that never speaks.
$('emailOn').addEventListener('change', async () => {
  if (!$('emailOn').checked) { $('emailStatus').textContent = 'Unread-mail alerts are off.'; return; }
  const info = await window.settings.emailPasswordInfo().catch(() => null);
  const missing = [];
  if (!$('emailUser').value.trim()) missing.push('your email address');
  if (!info || !info.has) missing.push('an app-password');
  $('emailStatus').textContent = missing.length
    ? ('Alerts are on, but still need ' + missing.join(' and ') + '.')
    : 'Alerts are on. Hit Test to check the connection.';
});
const APP_PASSWORD_MIN = 8;   // shorter than any provider issues: a sign of a truncated paste
// What may be wrong with the saved password, as a sentence, or '' when nothing is.
// Worded as likely, not certain: a work or school Google account can be set up
// in ways this cannot see.
const GMAIL_PASSWORD_HELP = 'Gmail usually needs a 16-letter app password, and the one saved is a different length. If it is your normal Google password, Gmail will refuse it. You can make an app password at myaccount.google.com/apppasswords once 2-Step Verification is on. On a work or school account, your admin may have to allow it.';
async function refreshEmailPassState() {
  try {
    const info = await window.settings.emailPasswordInfo();
    const el = $('emailPassState');
    if (!info || !info.has) { el.textContent = ''; return ''; }
    if (info.len < APP_PASSWORD_MIN) { el.textContent = `\u00b7 saved, but only ${info.len} characters; re-enter it`; return ''; }
    if (info.advice === 'gmail-length') { el.textContent = `\u00b7 saved, but ${info.len} characters, not 16`; return GMAIL_PASSWORD_HELP; }
    el.textContent = '\u00b7 saved \u2713';
    return '';
  } catch (e) { return ''; }
}
// Save the app-password when the field is done, never mid-keystroke. The old
// 600ms auto-save stored whatever had been typed so far and then blanked the box,
// so anyone typing a Gmail app-password group by group ("abcd efgh ijkl mnop")
// silently saved the first four characters and typed the rest into an empty field.
// `change` fires on blur and on Enter, which is exactly "the user is done".
function emailPassSave() {
  const pw = $('emailPass').value;
  if (!pw) return Promise.resolve();
  return (async () => {
    const r = await window.settings.emailSetPassword(pw);
    $('emailPass').value = '';
    const problem = await refreshEmailPassState();
    $('emailStatus').textContent = (r && r.ok === false)
      ? ('Could not save the password: ' + (r.error || 'unknown error'))
      : (problem || `Password saved (${(r && r.len) | 0} characters, encrypted).`);
  })();
}
$('emailPass').addEventListener('change', emailPassSave);
$('emailTest').addEventListener('click', async () => {
  const typedHost = $('emailHost').value.trim();
  // light validation: a real IMAP host has a dot and no spaces
  if (typedHost && (/\s/.test(typedHost) || !typedHost.includes('.'))) {
    $('emailStatus').textContent = "That server doesn't look right - try imap.gmail.com"; return;
  }
  emailSave();
  // Read the box before anything can clear it, then commit it: testing a password
  // that never got stored would report "Connected" for a setup that stays broken.
  const pw = $('emailPass').value || null;
  if (pw) await emailPassSave();
  $('emailStatus').textContent = 'Testing\u2026';
  const r = await window.settings.emailTest(pw);
  // if the test corrected the host (e.g. www.gmail.com -> imap.gmail.com), apply it visibly + save
  const corrected = r && r.host && r.host !== typedHost;
  if (corrected) { $('emailHost').value = r.host; emailSave(); }
  const note = corrected ? (' (using ' + r.host + ')') : '';
  $('emailStatus').textContent = r && r.ok
    ? ('Connected' + note + ' - ' + r.unread + ' unread.')
    : ('Failed: ' + ((r && r.error) || 'unknown error') + note);
});

function calSave() {
  save({ calendar: { on: $('calOn').checked, icsUrl: $('calUrl').value.trim(), leadMin: Number($('calLead').value) || 0 } });
}
['calOn', 'calUrl', 'calLead'].forEach((id) => $(id).addEventListener('change', calSave));
$('calTest').addEventListener('click', async () => {
  $('calStatus').textContent = 'Testing\u2026'; calSave();
  const r = await window.settings.calendarTest();
  $('calStatus').textContent = r && r.ok ? (r.next ? ('Loaded \u2014 next: ' + r.next) : 'Loaded \u2014 no upcoming events.') : ('Failed: ' + ((r && r.error) || 'unknown error'));
});

// "Test meow" plays the cat's REAL voice in the overlay (one meow, no desktop toast) rather
// than a second, cruder local synth. The overlay autoplays without a gesture, so it just works.
$('testSound').addEventListener('click', () => window.settings.testSound());

// One-shot behaviour buttons. They flash rather than going silent: a wash or a
// settle is subtle enough on a pet sitting in the corner of a big screen that
// without feedback you cannot tell a working button from a broken one.
document.querySelectorAll('.act').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.disabled) return;
    window.settings.action(b.dataset.act);
    const label = b.textContent;
    b.disabled = true;
    b.textContent = '✓ ' + label;
    setTimeout(() => { b.disabled = false; b.textContent = label; }, 850);
  });
});

// Esc closes the settings window.
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.settings.close(); });

// External changes (e.g. coat picked from the tray) reflect live.
window.settings.onConfig((c) => { cfg = c; render(); });

window.settings.get().then((c) => { cfg = c; render(); });

// ---- updates (opt-in; src/main/updater.js does the work) ----
let appVersion = '';
window.settings.appVersion().then((v) => { appVersion = v || ''; renderUpdates(); });
const UPDATE_STATUS = {
  off: 'Turn on "Check for updates" first.',
  dev: 'Running from source: update with git pull.',
  'up-to-date': 'You have the latest version.',
  error: 'Could not reach GitHub. It will try again later.',
};
function renderUpdates() {
  const u = (cfg && cfg.updates) || { check: false, channel: 'stable' };
  $('updCheck').checked = u.check === true;
  $('updChannel').value = u.channel === 'beta' ? 'beta' : 'stable';
  $('updChannel').disabled = !u.check;
  $('updCheckNow').disabled = !u.check;
  if (!$('updStatus').dataset.result) $('updStatus').textContent = appVersion ? `This is version ${appVersion}.` : '';
}
const saveUpdates = () => save({ updates: { check: $('updCheck').checked, channel: $('updChannel').value } });
$('updCheck').addEventListener('change', saveUpdates);
$('updChannel').addEventListener('change', saveUpdates);
$('updCheckNow').addEventListener('click', async () => {
  $('updStatus').textContent = 'Checking\u2026';
  const r = (await window.settings.checkUpdates()) || { status: 'error' };
  $('updStatus').dataset.result = '1';
  $('updStatus').textContent = r.status === 'available' ? `Version ${r.version} is out; the pet will tell you when it is ready.`
    : r.status === 'ready' ? `Version ${r.version} is ready. Pick "Restart to update" in the tray.`
      : (UPDATE_STATUS[r.status] || UPDATE_STATUS.error);
});

// Custom coats: load + live updates from main.
window.settings.onThemes((list) => { themes = list || []; populateCoats(); renderThemes(); });
window.settings.getThemes().then((list) => { themes = list || []; populateCoats(); renderThemes(); });
$('addTheme').addEventListener('click', async () => {
  const name = $('tName').value.trim();
  if (!name) { $('tName').focus(); return; }
  const t = {
    name, build: $('tBuild').value, tabby: $('tTabby').checked,
    coat: $('c_coat').value, mark: $('c_mark').value, white: $('c_white').value, patch: $('c_patch').value,
    eye: $('c_eye').value, nose: $('c_nose').value, inner: $('c_inner').value, outline: $('c_outline').value,
  };
  themes = await window.settings.addTheme(t);
  $('tName').value = '';
  populateCoats(); renderThemes();
});
$('exportThemes').addEventListener('click', () => window.settings.exportThemes());
$('importThemes').addEventListener('click', async () => { themes = await window.settings.importThemes(); populateCoats(); renderThemes(); });

// ---- Tools tab (Quick Tools launcher) ------------------------------------------
const IS_MAC = window.settings.platform === 'darwin';
const HOTKEY_CHOICES = [
  ['CommandOrControl+Shift+Space', IS_MAC ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space'],
  ['CommandOrControl+Alt+Space', IS_MAC ? 'Cmd+Option+Space' : 'Ctrl+Alt+Space'],
  ['CommandOrControl+Shift+K', IS_MAC ? 'Cmd+Shift+K' : 'Ctrl+Shift+K'],
  ['Alt+Space', IS_MAC ? 'Option+Space' : 'Alt+Space'],
  ['off', 'Off (right-click only)'],
];
$('toolsHotkey').replaceChildren(...HOTKEY_CHOICES.map(([value, label]) => {
  const o = document.createElement('option'); o.value = value; o.textContent = label; return o;
}));
$('scTarget').placeholder = IS_MAC ? 'mail.google.com or /Applications/Notes.app' : 'mail.google.com or C:\\Projects';

const toolsCfg = () => cfg.tools || {};
const saveTools = (patch) => save({ tools: { ...toolsCfg(), ...patch } });
const todoState = () => cfg.todos || { day: '', items: [], nudged: '' };
const MAX_TODOS = 5;
const MAX_SHORTCUTS = 30;   // mirrors tools/shortcuts.js

function emptyRow(ul, text) {
  const li = document.createElement('li'); li.className = 'empty';
  li.textContent = text; ul.appendChild(li);
}
function removeButton(onClick) {
  const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.title = 'Remove';
  x.onclick = onClick;
  return x;
}

function renderShortcuts() {
  const ul = $('shortcuts'); ul.replaceChildren();
  const list = toolsCfg().shortcuts || [];
  if (!list.length) { emptyRow(ul, 'Nothing pinned yet.'); return; }
  for (const sc of list) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 't'; t.textContent = sc.label;
    const m = document.createElement('span'); m.className = 'm'; m.textContent = sc.target; m.title = sc.target;
    li.append(t, m, removeButton(() => saveTools({ shortcuts: list.filter((q) => q.id !== sc.id) })));
    ul.appendChild(li);
  }
}

function renderTodos() {
  const ul = $('todoList'); ul.replaceChildren();
  const st = todoState();
  if (!st.items.length) { emptyRow(ul, 'Nothing planned for today.'); return; }
  for (const item of st.items) {
    const li = document.createElement('li');
    li.className = item.done ? 'done' : '';
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = item.done;
    box.setAttribute('aria-label', `Done: ${item.text}`);
    box.onchange = () => save({ todos: { ...st, items: st.items.map((t) => (t.id === item.id ? { ...t, done: !t.done } : t)) } });
    const m = document.createElement('span'); m.className = 'm'; m.textContent = item.text;
    li.append(box, m, removeButton(() => save({ todos: { ...st, items: st.items.filter((t) => t.id !== item.id) } })));
    ul.appendChild(li);
  }
}

function renderTools() {
  const t = toolsCfg();
  $('toolsHotkey').value = t.hotkey || 'CommandOrControl+Shift+Space';
  $('toolsRightClick').checked = t.rightClick !== false;
  $('toolsSearch').value = t.search || 'google';
  $('language').value = cfg.language || 'auto';
  $('toolsClipboard').checked = !!t.clipboard;
  $('toolsBattery').checked = t.batteryAlert !== false;
  $('toolsEyeRest').checked = !!t.eyeRest;
  $('todoNudgeOn').checked = !!t.todoNudge;
  $('todoNudge').disabled = !t.todoNudge;
  if (document.activeElement !== $('todoNudge')) $('todoNudge').value = t.todoNudge || '12:30';
  const key = HOTKEY_CHOICES.find(([v]) => v === t.hotkey);
  $('toolsHint').textContent = t.hotkey === 'off'
    ? 'Right-click the pet to open, note, time, calculate and search from one box.'
    : `Press ${key ? key[1] : 'the hotkey'} anywhere, or right-click the pet, to open, note, time, calculate and search from one box.`;
  renderShortcuts();
  renderTodos();
}

$('toolsHotkey').addEventListener('change', () => saveTools({ hotkey: $('toolsHotkey').value }));
$('toolsRightClick').addEventListener('change', () => saveTools({ rightClick: $('toolsRightClick').checked }));
$('toolsSearch').addEventListener('change', () => saveTools({ search: $('toolsSearch').value }));
$('language').addEventListener('change', () => save({ language: $('language').value }));
$('toolsClipboard').addEventListener('change', () => saveTools({ clipboard: $('toolsClipboard').checked }));
$('toolsBattery').addEventListener('change', () => saveTools({ batteryAlert: $('toolsBattery').checked }));
$('toolsEyeRest').addEventListener('change', () => saveTools({ eyeRest: $('toolsEyeRest').checked }));
$('todoNudgeOn').addEventListener('change', () => saveTools({ todoNudge: $('todoNudgeOn').checked ? ($('todoNudge').value || '12:30') : '' }));
$('todoNudge').addEventListener('change', () => { if ($('todoNudgeOn').checked && $('todoNudge').value) saveTools({ todoNudge: $('todoNudge').value }); });
$('openNotes').addEventListener('click', () => window.settings.openNotes());
$('reportProblem').addEventListener('click', () => window.settings.reportProblem());

// Pinning goes through main's normalize(), which is the real allowlist. If the
// list did not grow, the target was refused, and the user is told why.
async function pinShortcut(target) {
  const before = (toolsCfg().shortcuts || []).length;
  await saveTools({ shortcuts: [...(toolsCfg().shortcuts || []), { label: '', target }] });
  const grew = (toolsCfg().shortcuts || []).length > before;
  $('scMsg').textContent = grew ? ''
    : before >= MAX_SHORTCUTS ? 'That is the limit of 30 pins. Remove one first.'
    : 'That is not a web link or a full path, so it was not pinned.';
  return grew;
}
$('scAdd').addEventListener('click', async () => {
  const target = $('scTarget').value.trim();
  if (!target) { $('scTarget').focus(); return; }
  if (await pinShortcut(target)) $('scTarget').value = '';
});
$('scTarget').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('scAdd').click(); });
$('scPickFile').addEventListener('click', async () => { const p = await window.settings.pickShortcut('file'); if (p) pinShortcut(p); });
$('scPickFolder').addEventListener('click', async () => { const p = await window.settings.pickShortcut('folder'); if (p) pinShortcut(p); });

$('todoAdd').addEventListener('click', () => {
  const text = $('todoText').value.trim();
  if (!text) { $('todoText').focus(); return; }
  const st = todoState();
  if (st.items.length >= MAX_TODOS) { $('todoText').value = ''; $('todoText').placeholder = 'Five is plenty for one day.'; return; }
  save({ todos: { ...st, items: [...st.items, { text }] } });
  $('todoText').value = '';
});
$('todoText').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('todoAdd').click(); });

