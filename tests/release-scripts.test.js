const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkTag, isPrerelease } = require('../scripts/release-check');
const { checksumLines } = require('../scripts/checksums');

test('a tag that matches package.json passes', () => {
  assert.strictEqual(checkTag('v0.5.0', '0.5.0'), null);
  assert.strictEqual(checkTag('v0.5.0-beta.1', '0.5.0-beta.1'), null);
});

test('a mismatched or malformed tag is refused with the reason', () => {
  assert.match(checkTag('v0.5.1', '0.5.0'), /does not match/);
  assert.match(checkTag('0.5.0', '0.5.0'), /start with v/);
  assert.match(checkTag('v0.5', '0.5'), /not a plain semver/);
  assert.match(checkTag('', '0.5.0'), /start with v/);
});

test('pre-releases are recognised by their suffix', () => {
  assert.strictEqual(isPrerelease('0.5.0-beta.1'), true);
  assert.strictEqual(isPrerelease('0.5.0'), false);
});

test('checksums are in sha256sum format and sorted by file name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-sums-'));
  fs.writeFileSync(path.join(dir, 'b.exe'), 'bee');
  fs.writeFileSync(path.join(dir, 'a.zip'), 'abc');
  const lines = checksumLines([path.join(dir, 'b.exe'), path.join(dir, 'a.zip')]);
  assert.strictEqual(lines,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a.zip\n' +
    `${require('node:crypto').createHash('sha256').update('bee').digest('hex')}  b.exe\n`);
});

test('the installer name the updater asks for is the name the build writes', () => {
  // latest.yml names the installer with dashes. GitHub turns spaces in an
  // uploaded file name into dots, so a name with spaces would never match.
  const { build } = require('../package.json');
  assert.ok(build.publish && build.publish.some((p) => p.provider === 'github'), 'build.publish must name the GitHub release feed');
  assert.strictEqual(build.nsis && build.nsis.artifactName, '${productName}-Setup-${version}.${ext}');
  assert.doesNotMatch(build.nsis.artifactName, /\s/);
});
