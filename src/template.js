// Shared message-placeholder filler - the single source of truth for
// {name} {time} {date} {count} substitution plus the "tidy stray whitespace
// before punctuation" cleanup (so "Hi {name}!" with no name reads "Hi!").
//
// Loaded as a classic <script> by index.html so the overlay can call
// fillPlaceholders() as a bare global, and required as a CommonJS module by main.js
// and the tests. In a browser classic script `module` is undefined, so the export
// at the bottom is skipped and the declaration stays in the shared global scope.
function fillPlaceholders(msg, ctx) {
  ctx = ctx || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = ctx.time != null ? String(ctx.time) : `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const date = ctx.date != null ? String(ctx.date)
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const name = ctx.name == null ? '' : String(ctx.name);
  const count = ctx.count == null ? '' : String(ctx.count);
  return String(msg == null ? '' : msg)
    .replace(/\{name\}/g, name)
    .replace(/\{time\}/g, time)
    .replace(/\{date\}/g, date)
    .replace(/\{count\}/g, count)
    .replace(/\s+([,!?.])/g, '$1')
    .replace(/,\s*!/g, '!')
    .trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fillPlaceholders };
}
