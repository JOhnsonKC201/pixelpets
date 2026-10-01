// The overlay is several classic scripts sharing one global scope. That only
// works if they load in the right order and each part leans on earlier parts
// alone while it is loading. These checks keep the split honest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');
const { OVERLAY_SRC, overlayPartPaths } = require('../src/overlay/parts');

const SRC = path.join(__dirname, '..', 'src');
const MAX_LINES = 800;

test('index.html loads exactly the overlay parts, in order, after the shared scripts', () => {
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const overlay = scripts.filter((s) => s.startsWith('overlay/'));
  assert.deepStrictEqual(overlay, OVERLAY_SRC);
  // Nothing shared may load after the overlay starts: the parts read those names at load.
  assert.deepStrictEqual(scripts.slice(-OVERLAY_SRC.length), OVERLAY_SRC);
});

test('every overlay part exists and stays under the file size limit', () => {
  for (const file of overlayPartPaths()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    assert.ok(lines <= MAX_LINES, `${path.basename(file)} is ${lines} lines; split it before it grows further`);
  }
});

// Names declared at the top level of a script, in order.
function declarations(ast) {
  const names = [];
  const add = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => add(q.value || q.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(add);
    else if (p.type === 'AssignmentPattern') add(p.left);
    else if (p.type === 'RestElement') add(p.argument);
  };
  for (const st of ast.body) {
    if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) names.push(st.id.name);
    if (st.type === 'VariableDeclaration') st.declarations.forEach((d) => add(d.id));
  }
  return names;
}

// Identifiers a statement reads while it runs, not inside functions it defines.
function eagerReads(node, out) {
  if (!node || typeof node.type !== 'string') return;
  if (/Function/.test(node.type)) return;
  if (node.type === 'Identifier') { out.add(node.name); return; }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
    if (key === 'key' && node.type === 'Property' && !node.computed) continue;
    if (Array.isArray(child)) child.forEach((c) => eagerReads(c, out));
    else if (child && typeof child.type === 'string') eagerReads(child, out);
  }
}

test('no part runs code at load time that needs a later part', () => {
  const parsed = overlayPartPaths().map((file) => ({
    name: path.basename(file),
    ast: espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', loc: true }),
  }));
  const ownerOf = new Map();
  parsed.forEach(({ ast }, i) => declarations(ast).forEach((n) => ownerOf.set(n, i)));

  const problems = [];
  parsed.forEach(({ name, ast }, i) => {
    for (const st of ast.body) {
      if (st.type === 'FunctionDeclaration') continue;
      const reads = new Set();
      eagerReads(st, reads);
      for (const n of reads) {
        if (ownerOf.has(n) && ownerOf.get(n) > i) {
          problems.push(`${name}:${st.loc.start.line} reads ${n}, which ${parsed[ownerOf.get(n)].name} declares later`);
        }
      }
    }
  });
  assert.deepStrictEqual(problems, []);
});
