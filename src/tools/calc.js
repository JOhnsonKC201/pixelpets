// A tiny calculator for the Quick Tools launcher ("=12*7.5", "sqrt(2)/2").
//
// This is a hand-written recursive-descent parser on purpose. The input is text a
// person typed into a global hotkey box, so eval / new Function are off the table:
// the only things this file can ever produce are numbers. Every limit below (input
// length, token count, nesting depth) exists so a pasted wall of text costs nothing.
//
// Grammar, loosest binding first:
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/' | '%') unary)*
//   unary   := ('-' | '+') unary | power
//   power   := postfix (('^' | '**') unary)?     right-associative, so 2^3^2 = 512
//   postfix := primary '%'?                      "20%" is 0.2 when nothing follows it
//   primary := number | constant | fn '(' expr ')' | '(' expr ')'
// Unary minus sits ABOVE power, so -2^2 is -(2^2) = -4, the way people write it.

const MAX_LEN = 200;
const MAX_TOKENS = 64;
const MAX_DEPTH = 32;

const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const FUNCTIONS = Object.freeze({
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
});
// Lookups go through hasOwn so "constructor" or "__proto__" can never resolve to
// something inherited from Object.prototype.
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i += 1; continue; }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const word = /^[a-z]+/i.exec(src.slice(i));
    if (word) { tokens.push({ t: 'id', v: word[0].toLowerCase() }); i += word[0].length; continue; }
    if (src.startsWith('**', i)) { tokens.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/%^()'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i += 1; continue; }
    return null;   // anything else (quotes, commas, semicolons, dots on their own) is not maths
  }
  return tokens.length > MAX_TOKENS ? null : tokens;
}

class ParseError extends Error {}

function parse(tokens) {
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const fail = () => { throw new ParseError(); };
  const startsPrimary = (tok) => !!tok && (tok.t === 'num' || tok.t === 'id' || (tok.t === 'op' && tok.v === '('));

  const enter = () => { depth += 1; if (depth > MAX_DEPTH) fail(); };
  const leave = () => { depth -= 1; };

  function expr() {
    enter();
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    leave();
    return v;
  }
  function term() {
    let v = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[pos++].v;
      const r = unary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function unary() {
    if (isOp('-') || isOp('+')) {
      const op = tokens[pos++].v;
      enter();
      const v = unary();
      leave();
      return op === '-' ? -v : v;
    }
    return power();
  }
  function power() {
    const base = postfix();
    if (!isOp('^')) return base;
    pos += 1;
    enter();
    const exp = unary();
    leave();
    return base ** exp;
  }
  function postfix() {
    const v = primary();
    // "20%" means twenty percent unless a value follows, in which case "%" is modulo.
    if (isOp('%') && !startsPrimary(tokens[pos + 1])) { pos += 1; return v / 100; }
    return v;
  }
  function primary() {
    const tok = peek();
    if (!tok) fail();
    if (tok.t === 'num') { pos += 1; return tok.v; }
    if (tok.t === 'op' && tok.v === '(') {
      pos += 1;
      const v = expr();
      if (!isOp(')')) fail();
      pos += 1;
      return v;
    }
    if (tok.t === 'id') {
      pos += 1;
      if (has(FUNCTIONS, tok.v)) {
        if (!isOp('(')) fail();
        pos += 1;
        const arg = expr();
        if (!isOp(')')) fail();
        pos += 1;
        return FUNCTIONS[tok.v](arg);
      }
      if (has(CONSTANTS, tok.v)) return CONSTANTS[tok.v];
    }
    return fail();
  }

  const value = expr();
  if (pos !== tokens.length) fail();   // "1 2", "pi(2)", "1 + 2)" all leave tokens behind
  return value;
}

// Never throws. Returns { ok: true, value } or { ok: false }.
function evaluate(input) {
  const src = String(input == null ? '' : input).trim().replace(/^=\s*/, '');
  if (!src || src.length > MAX_LEN) return { ok: false };
  const tokens = tokenize(src);
  if (!tokens || !tokens.length) return { ok: false };
  try {
    const value = parse(tokens);
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

// Should a query be offered as a sum without the "=" prefix? Only when it has
// digits, an operator or function call, and actually evaluates, so "42", "notes"
// and "10m tea" stay out of the calculator's way.
function looksLikeMath(input) {
  const s = String(input == null ? '' : input).trim();
  if (s.startsWith('=')) return s.length > 1;
  if (!/\d/.test(s) || !/^[\d\s.+\-*/%^()a-z]+$/i.test(s)) return false;
  if (!/[+*/%^(]|\d\s*-/.test(s)) return false;
  return evaluate(s).ok;
}

// 12 significant digits hides binary float noise (0.1 + 0.2) without hiding
// anything a person would type. Unit conversions pass fewer: nobody needs a
// mile to eleven decimal places.
function formatNumber(n, digits = 12) {
  const v = Number(n.toPrecision(digits));
  return Object.is(v, -0) ? '0' : String(v);
}

module.exports = { evaluate, looksLikeMath, formatNumber, MAX_LEN };
