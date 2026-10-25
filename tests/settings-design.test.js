// The Settings window draws from one set of design tokens (src/ui/tokens.css),
// so a colour is decided once and the light theme can exist at all. These pin the
// rules that keep it that way: no colour written into the page itself, no inline
// style attributes, a light value for every dark one, and a font that ships with
// its licence and is allowed by the page's CSP.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const settings = read('settings.html');
const tokens = read(path.join('ui', 'tokens.css'));
const styleBlock = (/<style>([\s\S]*?)<\/style>/.exec(settings) || [])[1] || '';

// Custom properties declared inside a selector's block.
function declared(css, selectorRe) {
  const m = selectorRe.exec(css);
  assert.ok(m, `no block for ${selectorRe}`);
  let depth = 0, i = m.index + m[0].length, start = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') { if (depth === 0) break; depth -= 1; }
  }
  return new Set([...css.slice(start, i).matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1]));
}

test('Settings writes no colour of its own: every colour comes from a token', () => {
  const hex = styleBlock.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  const fn = styleBlock.match(/\brgba?\(/g) || [];
  assert.deepStrictEqual(hex, [], 'hex colours in settings.html; add a token in src/ui/tokens.css');
  assert.deepStrictEqual(fn, [], 'rgb()/rgba() in settings.html; add a token in src/ui/tokens.css');
});

test('Settings has no inline style attributes', () => {
  const inline = settings.match(/\sstyle="[^"]*"/g) || [];
  assert.deepStrictEqual(inline, [], 'move these into classes');
});

test('every colour token has a light-theme value', () => {
  const dark = declared(tokens, /:root\s*\{/);
  const light = declared(tokens, /@media \(prefers-color-scheme: light\)\s*\{\s*:root\s*\{/);
  const colour = [...dark].filter((n) => n.startsWith('--c-'));
  assert.ok(colour.length >= 12, `only ${colour.length} colour tokens`);
  const missing = colour.filter((n) => !light.has(n));
  assert.deepStrictEqual(missing, [], 'these stay dark in the light theme');
});

test('the pixel font ships with its licence and the CSP allows it', () => {
  const face = /@font-face\s*\{[^}]*url\(['"]?([^'")]+)['"]?\)/.exec(tokens);
  assert.ok(face, 'tokens.css declares no @font-face');
  const file = path.join(SRC, 'ui', face[1]);
  assert.ok(fs.existsSync(file), `${face[1]} is missing`);
  assert.ok(fs.existsSync(path.join(path.dirname(file), 'OFL-PressStart2P.txt')), 'the OFL must travel with the font');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(settings)[1];
  assert.match(csp, /font-src 'self'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(settings, /<link rel="stylesheet" href="ui\/tokens\.css"/);
});

test('section headings are set in the pixel face, body copy is not', () => {
  assert.match(styleBlock, /\.card-h\s*\{[^}]*font-family:\s*var\(--font-pixel\)/);
  assert.match(tokens, /--font-body:[^;]*system-ui/);
});
