// One-time rescue of the per-user data directory after the pixelcat -> pixelpets
// rename.
//
// Electron derives app.getPath('userData') from `productName` in package.json, so
// renaming the product moved the data directory out from under every existing
// install. v0.2.0 shipped as "pixelcat" and wrote to %APPDATA%\pixelcat (or
// ~/Library/Application Support/pixelcat on mac); anything built after the rename
// looks in .../pixelpets instead and finds an empty folder. Without this, upgrading
// looks like a factory reset: the pet loses its name and coat, the custom coats and
// the notification recap vanish, and email.cred - the IMAP app-password encrypted
// with safeStorage, which the user cannot retype from memory - is orphaned.
//
// The rules here are deliberately conservative, because a data migration that
// guesses wrong is worse than no migration at all:
//
//   * never overwrite a file that already exists in the new directory. Whatever is
//     there is newer by definition, so the new name always wins.
//   * never delete or modify anything in the old directory. If this goes wrong the
//     user still has an untouched copy to fall back on.
//   * leave a marker once it succeeds, so deleting a file on purpose (disconnecting
//     email by removing email.cred, say) does not resurrect it on the next launch.
//   * only write that marker on a clean run. A copy that failed on a locked file
//     gets another go next launch, which is safe precisely because we never
//     overwrite.
const fs = require('fs');
const path = require('path');

// The old product name, and therefore the old directory name. This is history: it
// stays 'pixelcat' no matter what the app is called later.
const LEGACY_NAME = 'pixelcat';

// Everything the app persists per user. Kept in one place so a new store cannot
// quietly opt out of the migration: config.js, themes.js, mail.js and main.js each
// own one of these.
const DATA_FILES = ['settings.json', 'themes.json', 'email.cred', 'notify-history.json', 'notes.md'];

const MARKER = '.migrated-from-pixelcat';

// Copy the files `toDir` is missing across from `fromDir`. Pure filesystem work with
// no Electron in sight, so it is testable against real temp directories.
// Returns { ran, copied, kept, failed } - `kept` is the files left alone because the
// new directory already had them.
function migrate({ fromDir, toDir, files = DATA_FILES }) {
  const report = { ran: false, copied: [], kept: [], failed: [] };
  if (!fromDir || !toDir) return report;
  // Guard the day the names line up again: copying a directory onto itself would at
  // best be pointless and at worst truncate live files.
  if (path.resolve(fromDir) === path.resolve(toDir)) return report;

  const marker = path.join(toDir, MARKER);
  if (fs.existsSync(marker)) return report;      // already done, and done is forever
  if (!fs.existsSync(fromDir)) return report;    // clean install, nothing to carry over

  report.ran = true;
  try { fs.mkdirSync(toDir, { recursive: true }); }
  catch (e) { report.failed.push({ file: null, message: e.message }); return report; }

  for (const name of files) {
    const src = path.join(fromDir, name);
    const dst = path.join(toDir, name);
    try {
      if (!fs.existsSync(src)) continue;
      if (fs.existsSync(dst)) { report.kept.push(name); continue; }
      // Land it through a temp file in the destination: a crash halfway through a
      // copy would otherwise leave a truncated settings.json, which the loader would
      // read as corrupt and silently replace with defaults - the exact data loss
      // this whole module exists to prevent.
      const tmp = `${dst}.migrating`;
      fs.copyFileSync(src, tmp);
      fs.renameSync(tmp, dst);
      report.copied.push(name);
    } catch (e) {
      report.failed.push({ file: name, message: e.message });
      try { fs.unlinkSync(`${dst}.migrating`); } catch (e2) { /* nothing half-written to clear */ }
    }
  }

  // Only close the door behind a clean run; see the header note on retries.
  if (report.failed.length === 0) {
    const note = { migratedFrom: fromDir, at: new Date().toISOString(), copied: report.copied, kept: report.kept };
    try { fs.writeFileSync(marker, `${JSON.stringify(note, null, 2)}\n`); }
    catch (e) { /* the copies already landed; a missing marker only costs a re-check */ }
  }
  return report;
}

// Where the pre-rename build kept its data, alongside the current userData dir.
function legacyDir(app, name = LEGACY_NAME) {
  return path.join(app.getPath('appData'), name);
}

// Electron-facing wrapper: run this before anything reads settings/themes/mail.
function migrateFromLegacy(app, log = console.log) {
  let report;
  try { report = migrate({ fromDir: legacyDir(app), toDir: app.getPath('userData') }); }
  catch (e) { log(`[datadir] migration skipped: ${e.message}`); return null; }

  if (!report.ran) return report;                // silent on the common path
  if (report.copied.length) log(`[datadir] carried over from ${LEGACY_NAME}: ${report.copied.join(', ')}`);
  for (const f of report.failed) log(`[datadir] could not carry over ${f.file}: ${f.message} (will retry next launch)`);
  return report;
}

module.exports = { migrate, migrateFromLegacy, legacyDir, DATA_FILES, LEGACY_NAME, MARKER };
