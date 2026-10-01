#!/usr/bin/env node
// Refuse to build a release whose tag and package.json disagree.
//
// The installer, the update manifest (latest.yml) and the app's own "About"
// version all come from package.json; the GitHub Release is named after the
// tag. If they differ, the updater compares against one version and downloads
// another, and a user can be offered the release they already have forever.
//
//   node scripts/release-check.js v0.5.0     (the release workflow passes the tag)
const fs = require('node:fs');
const path = require('node:path');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Returns null when the tag matches, or a sentence saying what is wrong. */
function checkTag(tag, version) {
  if (!SEMVER.test(String(version))) return `package.json version "${version}" is not a plain semver version`;
  if (!/^v/.test(String(tag))) return `tag "${tag}" should start with v`;
  const tagged = String(tag).slice(1);
  if (tagged !== version) return `tag ${tag} does not match package.json version ${version}; bump one of them`;
  return null;
}

/** True for a pre-release version like 0.5.0-beta.1. */
function isPrerelease(version) {
  return String(version).includes('-');
}

if (require.main === module) {
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const problem = checkTag(tag, version);
  if (problem) {
    console.error(`release check failed: ${problem}`);
    process.exit(1);
  }
  console.log(`release check ok: ${tag}${isPrerelease(version) ? ' (pre-release)' : ''}`);
}

module.exports = { checkTag, isPrerelease };
