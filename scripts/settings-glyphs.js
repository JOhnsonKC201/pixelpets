// The pixel glyphs in the settings masthead: the "pixelpets" wordmark and the six
// tab icons. They are drawn here as rows of text, where they can be read and
// edited, and pasted into src/settings.html as SVG path data. Run:
//
//   node scripts/settings-glyphs.js
//
// and copy the path it prints for whatever you changed. tests/settings-copy.test.js
// fails if the HTML and these bitmaps disagree, so a hand-edited path cannot drift.
//
// Why bitmaps instead of a pixel font or emoji: the window's CSP allows no fonts,
// and emoji come from the OS, so the old tab rail was six unrelated full-colour
// drawings that looked different on every machine. These take the tab's own text
// colour and sit on one grid.

// One row of cells becomes one closed rectangle per run of X, which keeps the path
// short and leaves no hairline seams between neighbouring cells.
function pathOf(rows) {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'X') continue;
      let len = 1;
      while (row[x + len] === 'X') len++;
      out.push(`M${x} ${y}h${len}v1h-${len}z`);
      x += len;
    }
  });
  return out.join('');
}

// Tab icons, 9 x 9. Drawn at 18px, so one cell is two CSS pixels.
const ICON_SIZE = 9;
const ICONS = {
  pet: [
    '...X.X...',
    '.X.X.X.X.',
    '.X.....X.',
    '...XXX...',
    '..XXXXX..',
    '.XXXXXXX.',
    '.XXXXXXX.',
    '..XX.XX..',
    '.........',
  ],
  play: [
    '....X....',
    '....X....',
    '...XXX...',
    '..XXXXX..',
    'XXXXXXXXX',
    '..XXXXX..',
    '...XXX...',
    '....X....',
    '....X....',
  ],
  sound: [
    '....X....',
    '...XX..X.',
    'XXXXX...X',
    'XXXXX.X.X',
    'XXXXX.X.X',
    'XXXXX.X.X',
    'XXXXX...X',
    '...XX..X.',
    '....X....',
  ],
  focus: [
    '.XXXXXXX.',
    '.X.....X.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
    '...X.X...',
    '..X.X.X..',
    '.X.XXX.X.',
    '.XXXXXXX.',
  ],
  feeds: [
    '.........',
    'XXXXXXXXX',
    'XX.....XX',
    'X.X...X.X',
    'X..X.X..X',
    'X...X...X',
    'X.......X',
    'XXXXXXXXX',
    '.........',
  ],
  tools: [
    '.........',
    '...XXX...',
    '..X...X..',
    'XXXXXXXXX',
    'X.......X',
    'XXXXXXXXX',
    'X...X...X',
    'X.......X',
    'XXXXXXXXX',
  ],
};

// Wordmark letters, 9 rows: two for ascenders, five of x-height, two for the
// descender on the p. Widths vary, so each letter is its own column block.
const LETTER_ROWS = 9;
const LETTERS = {
  p: ['....', '....', 'XXX.', 'X..X', 'X..X', 'X..X', 'XXX.', 'X...', 'X...'],
  i: ['X', '.', 'X', 'X', 'X', 'X', 'X', '.', '.'],
  x: ['...', '...', 'X.X', 'X.X', '.X.', 'X.X', 'X.X', '...', '...'],
  e: ['....', '....', '.XX.', 'X..X', 'XXXX', 'X...', '.XXX', '....', '....'],
  l: ['X', 'X', 'X', 'X', 'X', 'X', 'X', '.', '.'],
  t: ['.X.', '.X.', 'XXX', '.X.', '.X.', '.X.', '.XX', '...', '...'],
  s: ['....', '....', '.XXX', 'X...', '.XX.', '...X', 'XXX.', '....', '....'],
};

// Sets a word with one empty column between letters.
function setWord(word) {
  const rows = Array.from({ length: LETTER_ROWS }, () => '');
  [...word].forEach((ch, n) => {
    const glyph = LETTERS[ch];
    if (!glyph) throw new Error(`no bitmap for "${ch}"`);
    glyph.forEach((cells, y) => { rows[y] += (n ? '.' : '') + cells; });
  });
  return rows;
}

// "pixel" and "pets" are two paths so they can take two colours. The second is
// shifted right by the first word's width plus one column of space.
function wordmark() {
  const pixel = setWord('pixel');
  const pets = setWord('pets');
  const offset = pixel[0].length + 1;
  return {
    width: offset + pets[0].length,
    height: LETTER_ROWS,
    pixel: pathOf(pixel),
    pets: pathOf(pets.map((row) => '.'.repeat(offset) + row)),
  };
}

const iconPaths = () => Object.fromEntries(Object.entries(ICONS).map(([k, rows]) => [k, pathOf(rows)]));

module.exports = { ICON_SIZE, ICONS, pathOf, iconPaths, wordmark };

if (require.main === module) {
  const w = wordmark();
  console.log(`wordmark  viewBox="0 0 ${w.width} ${w.height}"`);
  console.log(`  pixel  ${w.pixel}`);
  console.log(`  pets   ${w.pets}`);
  console.log(`\nicons  viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}"`);
  for (const [k, d] of Object.entries(iconPaths())) console.log(`  ${k.padEnd(6)} ${d}`);
}
