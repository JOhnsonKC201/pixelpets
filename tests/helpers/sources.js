// Source text for tests that pin wiring by reading code rather than running it
// (main.js pulls in Electron at require time, and the overlay is a browser
// script). The main process is main.js plus the modules in src/main/.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');

function readMainSource() {
  const dir = path.join(SRC, 'main');
  const files = [path.join(SRC, 'main.js'), ...fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f))];
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

module.exports = { readMainSource };
