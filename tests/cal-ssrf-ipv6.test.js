// The calendar fetch refuses addresses that reach this machine or its network.
// IPv6 can carry an IPv4 address inside it; each such form must be judged, or
// refused outright, rather than waved through as "some public IPv6".
const test = require('node:test');
const assert = require('node:assert');
const { isBlockedIp } = require('../src/cal-worker');

test('IPv6 forms that wrap an IPv4 address are refused', () => {
  for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::127.0.0.1', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '2002:a9fe:a9fe::']) {
    assert.strictEqual(isBlockedIp(ip), true, `${ip} should be refused`);
  }
});

test('an ordinary public IPv6 address is still allowed', () => {
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.strictEqual(isBlockedIp(ip), false, `${ip} should be allowed`);
  }
});

test('a mapped public IPv4 address is judged by the IPv4 inside it', () => {
  assert.strictEqual(isBlockedIp('::ffff:8.8.8.8'), false);
  assert.strictEqual(isBlockedIp('::ffff:10.0.0.1'), true);
});

test('the whole of each reserved range is refused, not just its first spelling', () => {
  // fe80::/10 runs to febf, and fec0::/10 is the old site-local block; prefix
  // text checks on "fe80" let fe81 through febf straight past.
  for (const ip of ['fe81::1', 'fe9a::1', 'febf::ffff', 'fec0::1', 'feff::1',
    '2001::1', '2001:0:4136:e378::1', '100::1', '192.0.0.8', '198.18.0.1', '198.19.255.254']) {
    assert.strictEqual(isBlockedIp(ip), true, `${ip} should be refused`);
  }
  // Real public addresses right next to those ranges still work.
  for (const ip of ['2001:4860:4860::8888', '2606:4700::1111', '198.20.0.1', '192.0.1.1']) {
    assert.strictEqual(isBlockedIp(ip), false, `${ip} should be allowed`);
  }
});
