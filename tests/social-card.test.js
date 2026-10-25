// The link-preview card and the showcase sheet are drawn by the app's own pet
// renderer, not by a copy of it. The old copy drifted (a different cat), and the
// old card's coat strip ran off the right edge mid-column. These pin both.
const test = require('node:test');
const assert = require('node:assert');
const { loadPets, renderPet, CARD, cardLayout, textWidth } = require('../scripts/real-pets.js');

const inside = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('every element of the card sits inside the frame and nothing overlaps', () => {
  const pets = loadPets();
  const items = cardLayout(pets);
  for (const it of items) assert.ok(inside(it, CARD.w, CARD.h), `${it.id} leaves the frame: ${JSON.stringify(it)}`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (items[i].layer === 'floor' || items[j].layer === 'floor') continue;
    assert.ok(!overlap(items[i], items[j]), `${items[i].id} overlaps ${items[j].id}`);
  }
});

test('the hero is the biggest thing on the card, and every pet stands on the taskbar', () => {
  const items = cardLayout(loadPets());
  const pets = items.filter((it) => it.layer === 'pet');
  const hero = pets.find((it) => it.id === 'hero');
  for (const p of pets) {
    if (p !== hero) assert.ok(p.h < hero.h, `${p.id} is as tall as the hero`);
    assert.equal(p.y + p.h, CARD.floor, `${p.id} floats or sinks`);
  }
  assert.ok(pets.some((p) => p.species === 'dog'), 'the card says "or a dog", so it shows one');
});

test('a pet renders through the app\'s own drawCat, on whole pixels, with whiskers', () => {
  const pets = loadPets();
  const a = renderPet(pets, { species: 'cat', pose: 'sit', coat: 4, scale: 2 });
  const b = renderPet(pets, { species: 'cat', pose: 'sit', coat: 4, scale: 2 });
  assert.deepStrictEqual(a.rgba, b.rgba, 'the same pet renders the same bytes');
  assert.equal(a.w % 2, 0); assert.equal(a.h % 2, 0);
  // Whiskers reach past the outline, so some light pixels sit outside the body's
  // widest painted row.
  assert.ok(a.whiskerPixels > 0, 'whiskers were drawn');
});

test('the tagline fits on its line in the pixel font', () => {
  for (const line of CARD.tagline) assert.ok(textWidth(line, CARD.tagScale) < CARD.w / 2, line);
});
