// "Report a problem": builds a GitHub bug-form URL with diagnostics prefilled.
//
// Nothing is sent by the app. The person sees the exact text first (report
// window), then their browser opens GitHub where they can still edit or cancel.
// The diagnostics are what a maintainer needs and nothing personal: versions,
// OS, which features are switched on (names only, never values) and the tail of
// the already-redacted local log (logger.js).

const ISSUE_URL = 'https://github.com/JOhnsonKC201/pixelpets/issues/new';
const TEMPLATE = 'bug_report.yml';
// GitHub rejects very long URLs; stay well under the ~8 KB where it starts to.
const MAX_URL = 7500;

const OS_NAME = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

// Switches only. Each entry is [path into the config, label].
const FEATURES = [
  ['workMode', 'work mode'], ['pomodoro.on', 'pomodoro'], ['email.on', 'mail alerts'], ['calendar.on', 'calendar'],
  ['tools.clipboard', 'clipboard history'], ['tools.eyeRest', 'eye-rest nudges'], ['lobbyJam.on', 'lobby jam'],
  ['lowPower', 'low power'], ['reducedMotion', 'reduced motion'],
];
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

// A stored log line is JSON for the machine; the report shows it for a person:
// "03:17:24 error overlay renderer gone {...}". A line that is not ours is kept
// as it is.
function formatLogLine(line) {
  try {
    const o = JSON.parse(line);
    const time = String(o.t || '').slice(11, 19);
    return `${time} ${String(o.l || '').padEnd(5)} ${o.m || ''}${o.d ? ` ${o.d}` : ''}`;
  } catch (e) { return String(line); }
}

function enabledFeatures(cfg) {
  return FEATURES.filter(([key]) => get(cfg, key) === true).map(([, label]) => label);
}

function contextText(info, logLines, dropped) {
  const fence = '```';
  return [
    '**Diagnostics** (added by pixelpets; you can edit or delete any of this)',
    `- pixelpets ${info.version}`,
    `- ${OS_NAME[info.platform] || info.platform} ${info.osRelease} (${info.arch})`,
    `- Electron ${info.electron}`,
    `- On: ${info.features.length ? info.features.join(', ') : 'defaults'}`,
    '',
    `**Recent log** (emails, links, tokens and your user name are already removed${dropped ? `; ${dropped} older lines left out` : ''})`,
    fence,
    ...logLines,
    fence,
  ].join('\n');
}

function buildIssue(info) {
  const title = `Problem report: pixelpets ${info.version}`;
  let lines = (info.logLines || []).map(formatLogLine);
  let dropped = 0;
  for (;;) {
    const body = contextText(info, lines, dropped);
    const params = new URLSearchParams({ template: TEMPLATE, title, version: info.version, context: body });
    const url = `${ISSUE_URL}?${params.toString()}`;
    if (url.length <= MAX_URL || !lines.length) return { url, title, body };
    const cut = Math.max(1, Math.ceil(lines.length / 10));   // drop the oldest tenth and try again
    lines = lines.slice(cut);
    dropped += cut;
  }
}

module.exports = { buildIssue, enabledFeatures, formatLogLine, MAX_URL, ISSUE_URL };
