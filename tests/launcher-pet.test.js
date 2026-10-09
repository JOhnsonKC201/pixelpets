// The pet in the launcher header reacts to what you type. Which mood it is in is
// a pure decision; the page only sets an attribute and lets CSS move the picture.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pet = require('../src/launcher-pet');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const row = (enabled) => ({ enabled });

test('an empty box is idle, and dozes once it has been left alone', () => {
  assert.strictEqual(pet.petMood({ query: '', items: [row(true)], idleMs: 0 }), 'idle');
  assert.strictEqual(pet.petMood({ query: '   ', items: [row(true)], idleMs: pet.PET_DOZE_MS - 1 }), 'idle');
  assert.strictEqual(pet.petMood({ query: '', items: [row(true)], idleMs: pet.PET_DOZE_MS }), 'doze');
  assert.strictEqual(pet.petMood({ query: 'x', items: [row(true)], idleMs: pet.PET_DOZE_MS * 9 }), 'listen', 'it never dozes mid-sentence');
});

test('it listens when there is something to run and is curious when there is not', () => {
  assert.strictEqual(pet.petMood({ query: 'gmail', items: [row(true), row(false)] }), 'listen');
  assert.strictEqual(pet.petMood({ query: 'todo ', items: [row(false)] }), 'curious', 'a hint row is not something to run');
  assert.strictEqual(pet.petMood({ query: 'zzqq', items: [] }), 'curious');
  assert.strictEqual(pet.petMood({ query: 'x' }), 'curious', 'no list at all');
  assert.strictEqual(pet.petMood({}), 'idle');
});

test('a keystroke is a tap, finding something after nothing is a hop, and so is running a row', () => {
  assert.strictEqual(pet.petReaction('type', 'listen', 'listen'), 'tap');
  assert.strictEqual(pet.petReaction('type', 'idle', 'listen'), 'tap');
  assert.strictEqual(pet.petReaction('type', 'curious', 'listen'), 'hop');
  assert.strictEqual(pet.petReaction('type', 'listen', 'curious'), 'tap');
  assert.strictEqual(pet.petReaction('run', 'listen', 'listen'), 'hop');
  assert.strictEqual(pet.petReaction('type', 'listen', 'idle'), null, 'clearing the box is not a keystroke to react to');
  assert.strictEqual(pet.petReaction('doze', 'idle', 'doze'), null);
  assert.strictEqual(pet.petReaction('anything-else', 'idle', 'idle'), null);
});

test('the page loads the mood rules before the script that uses them', () => {
  const scripts = [...read('launcher.html').matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.includes('launcher-pet.js'));
  assert.ok(scripts.indexOf('launcher-pet.js') < scripts.indexOf('launcher-renderer.js'));
});

test('every mood the rules can return has a pose, and motion can be switched off', () => {
  const html = read('launcher.html');
  for (const mood of pet.PET_MOODS) {
    if (mood === 'idle') continue;   // the resting pose needs no rule
    assert.match(html, new RegExp(`data-pet="${mood}"`), `no CSS for the "${mood}" mood`);
  }
  for (const once of pet.PET_REACTIONS) assert.match(html, new RegExp(`#pet\\.${once}\\b`), `no CSS for the "${once}" reaction`);
  // Reduced motion (the OS setting) and the app's own setting both stop it.
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{([^]*?)\n {4}\}/.exec(html);
  assert.ok(reduced && /#pet[^{]*\{[^}]*animation: none/.test(reduced[1]), 'the OS reduced-motion setting must still the pet');
  assert.match(html, /body\.still #pet[^{]*\{[^}]*animation: none/);
  // Only properties the compositor can animate without laying the page out again.
  const frames = [...html.matchAll(/@keyframes pet-[\w-]+ \{([^]*?)\n {4}\}/g)].map((m) => m[1]).join('\n');
  assert.ok(frames.length > 0);
  const props = new Set([...frames.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
  for (const p of props) assert.ok(['scale', 'translate', 'rotate', 'opacity'].includes(p), `keyframes animate "${p}"`);
});

test('slowing the breath for a doze cannot stretch a tap or a hop', () => {
  const html = read('launcher.html');
  // One duration on a rule that outranks #pet.hop would apply to the whole list.
  assert.doesNotMatch(html, /data-pet="doze"\] #pet \{[^}]*animation-duration/);
  assert.match(html, /data-pet="doze"\] #pet \{ --breathe: \d/);
  for (const once of pet.PET_REACTIONS) assert.match(html, new RegExp(`#pet\\.${once} \\{ animation: pet-breathe var\\(--breathe\\)[^}]*pet-${once} `));
});

test('anything that empties or uses the box counts as activity, so it does not doze at once', () => {
  const js = read('launcher-renderer.js');
  const escape = /e\.key === 'Escape'[^\n]*/.exec(js)[0];
  assert.match(escape, /petRest\(\)/, 'Escape clears the box without an input event');
  assert.match(js, /pendingPetEvent = 'run'; petRest\(\)/);
  assert.match(js, /addEventListener\('focus', petRest\)/);
  // A reaction ends with its animation, not with whichever render comes next.
  assert.match(js, /addEventListener\('animationend'/);
  // Reopening starts from rest.
  assert.match(js, /pendingPetEvent = null;\s+document\.body\.dataset\.pet = 'idle';/);
});

test('the launcher decides the mood from flags, never from what a row says', () => {
  const js = read('launcher-renderer.js');
  assert.match(js, /petMood\(/);
  assert.doesNotMatch(js, /petMood\([^)]*title/);
});
