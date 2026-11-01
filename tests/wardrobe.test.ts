import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_LOOKS, lookCoinPrice, ownedLookIds, type LookEvent } from '../src/engine';

const drop = (id: string, rarity: LookEvent['rarity'], date = '2026-11-03'): LookEvent => ({ date, kind: 'drop', eventId: id, rarity });

test('wardrobe: you start with the starter looks only', () => {
  const owned = ownedLookIds(STARTER_LOOKS, []);
  assert.deepEqual(owned, ['gym-tee', 'navy-tee', 'red-tank']);
});

test('wardrobe: a look drop unlocks one look of that rarity, and the same drop always gives the same one', () => {
  const a = ownedLookIds(STARTER_LOOKS, [drop('w1', 'rare')]);
  const b = ownedLookIds(STARTER_LOOKS, [drop('w1', 'rare')]);
  assert.deepEqual(a, b);
  const added = a.filter((id) => !['gym-tee', 'navy-tee', 'red-tank'].includes(id));
  assert.equal(added.length, 1);
  assert.equal(STARTER_LOOKS.find((l) => l.id === added[0])!.rarity, 'rare');
});

test('wardrobe: drops never duplicate a look you own', () => {
  const events = Array.from({ length: 8 }, (_, i) => drop(`d${i}`, 'rare', `2026-11-0${i + 1}`));
  const owned = ownedLookIds(STARTER_LOOKS, events);
  assert.equal(new Set(owned).size, owned.length);
  // Only six rare looks exist; the extra drops fall back to other rarities instead of being lost.
  assert.equal(owned.length, 3 + 8);
});

test('wardrobe: buying a look owns it, and later drops skip it', () => {
  const buy: LookEvent = { date: '2026-11-01', kind: 'purchase', eventId: 'p1', lookId: 'dojo-gi' };
  const owned = ownedLookIds(STARTER_LOOKS, [buy]);
  assert.ok(owned.includes('dojo-gi'));
  const rare = STARTER_LOOKS.filter((l) => l.rarity === 'rare');
  const events = [buy, ...rare.slice(1).map((_, i) => drop(`d${i}`, 'rare', '2026-11-02'))];
  const all = ownedLookIds(STARTER_LOOKS, events);
  assert.equal(rare.every((l) => all.includes(l.id)), true);
});

test('wardrobe: an unknown purchased look is ignored, and prices rise with rarity', () => {
  assert.equal(ownedLookIds(STARTER_LOOKS, [{ date: '2026-11-01', kind: 'purchase', eventId: 'p', lookId: 'nope' }]).length, 3);
  assert.ok(lookCoinPrice('common') < lookCoinPrice('rare') && lookCoinPrice('epic') < lookCoinPrice('legendary'));
});
