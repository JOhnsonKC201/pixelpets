#!/usr/bin/env node
// Write SHA-256 checksums for release files, in the format `sha256sum -c` reads.
//
// The builds are not code-signed, so the checksum on the release page is how a
// careful user confirms the file they downloaded is the one CI built.
//
//   node scripts/checksums.js <out-file> <file> [<file> ...]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** "<hash>  <name>\n" per file, sorted by name so the output is stable. */
function checksumLines(files) {
  return files
    .map((f) => ({ name: path.basename(f), hash: sha256(f) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, hash }) => `${hash}  ${name}\n`)
    .join('');
}

if (require.main === module) {
  const [out, ...args] = process.argv.slice(2);
  // A shell leaves a glob that matched nothing as the literal pattern. Such a
  // pattern is skipped (not every build makes every kind of file); a plain name
  // that is missing is still an error.
  const files = args.filter((f) => fs.existsSync(f) || !f.includes('*'));
  if (!out || files.length === 0) {
    console.error('usage: node scripts/checksums.js <out-file> <file> [<file> ...]');
    process.exit(1);
  }
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) {
    console.error(`checksums: missing ${missing.join(', ')}`);
    process.exit(1);
  }
  fs.writeFileSync(out, checksumLines(files));
  console.log(fs.readFileSync(out, 'utf8').trimEnd());
}

module.exports = { checksumLines, sha256 };
