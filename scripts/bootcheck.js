// End-to-end boot smoke test: launch the REAL app in --shot mode (full main +
// renderer + canvas pipeline), then assert it drew the pet and exited cleanly.
// Catches overlay/renderer crashes that the node unit tests can't.
//
//   npm run test:boot                       the source tree, through Electron
//   node scripts/bootcheck.js --packaged    the app electron-builder --dir built,
//                                           with the release fuses on
//
// The app itself fails the run when the page does not load or the canvas stays
// empty (src/main/shot.js); this script checks the exit code and the PNG.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const MIN_PNG_BYTES = 1000;

function packagedBinary() {
  const dist = path.join(root, 'dist');
  const candidates = process.platform === 'darwin'
    // Prefer the build for this machine's CPU (dist/mac-arm64 on Apple Silicon,
    // dist/mac on Intel); the other one would only run under translation.
    ? (fs.existsSync(dist) ? fs.readdirSync(dist) : []).filter((d) => d.startsWith('mac'))
      .sort((a, b) => Number(b.includes(process.arch)) - Number(a.includes(process.arch)))
      .map((d) => path.join(dist, d, 'pixelpets.app', 'Contents', 'MacOS', 'pixelpets'))
    : [path.join(dist, 'win-unpacked', 'pixelpets.exe')];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    console.error(`BOOT TEST FAILED: no packaged app in dist/ (looked for ${candidates.join(', ') || 'dist/mac*'}). Run electron-builder --dir first.`);
    process.exit(1);
  }
  return found;
}

const png = path.join(os.tmpdir(), `pixelpets-boot-${process.pid}.png`);
const common = ['--shot', '--state=sit', '--disable-gpu', `--shot-out=${png}`];
// A packaged run gets its own profile, so it never touches a pet that is running.
const profile = packaged ? fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-boot-profile-')) : null;
const [bin, args] = packaged
  ? [packagedBinary(), [...common, `--user-data-dir=${profile}`]]
  : [require('electron'), ['.', ...common]];

try {
  execFileSync(bin, args, { cwd: root, stdio: 'inherit', timeout: 60000 });
} catch (e) {
  console.error(`BOOT TEST FAILED: ${packaged ? 'the packaged app' : 'electron'} exited with an error:`, e.message);
  process.exit(1);
} finally {
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
}

if (!fs.existsSync(png) || fs.statSync(png).size < MIN_PNG_BYTES) {
  console.error('BOOT TEST FAILED: no/empty render produced (overlay or renderer likely crashed)');
  process.exit(1);
}
console.log(`boot test OK (${packaged ? 'packaged' : 'source'}) - ${fs.statSync(png).size} byte render`);
fs.unlinkSync(png);
