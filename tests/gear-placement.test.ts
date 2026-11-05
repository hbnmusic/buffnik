import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustFit, DEFAULT_PLACEMENT, figureRect, NO_FIT, placeGear, wornGear } from '../src/ui/gearPlacement';
import type { Look } from '../src/engine';

test('gear placement: the figure box is the contain-fitted picture, centred', () => {
  const r = figureRect(220, 352, 369, 827); // tall figure in a 200:320 box: fits by height
  assert.ok(Math.abs(r.h - 352) < 0.001);
  assert.ok(Math.abs(r.x * 2 + r.w - 220) < 0.001);
  assert.equal(figureRect(200, 320).w, 120); // no picture size: a typical figure box
});

test('gear placement: each slot lands in a sensible part of the figure', () => {
  const rect = { x: 50, y: 0, w: 100, h: 400 };
  const at = (slot: Parameters<typeof placeGear>[0]) => placeGear(slot, undefined, rect);
  const centreY = (slot: Parameters<typeof placeGear>[0]) => at(slot).top + at(slot).size / 2;
  assert.ok(centreY('head') < centreY('face') && centreY('face') < centreY('body') && centreY('body') < centreY('hands') && centreY('hands') < centreY('feet'));
  assert.equal(at('back').behind, true);
  assert.equal(at('weapon').behind, false);
  assert.ok(Math.abs(at('head').left + at('head').size / 2 - 100) < 0.001, 'head is centred on the figure');
});

test('gear placement: fits move and resize an item, within limits', () => {
  const rect = { x: 0, y: 0, w: 100, h: 400 };
  const base = placeGear('feet', undefined, rect);
  const moved = placeGear('feet', adjustFit(undefined, { dx: 0.1, dy: -0.05, scaleBy: 2 }), rect);
  assert.ok(moved.size > base.size * 1.99);
  assert.ok(moved.left + moved.size / 2 > base.left + base.size / 2);
  assert.ok(moved.top + moved.size / 2 < base.top + base.size / 2);
  let f = NO_FIT;
  for (let i = 0; i < 100; i++) f = adjustFit(f, { dx: 0.1, scaleBy: 2 });
  assert.equal(f.dx, 0.8);
  assert.equal(f.scale, 3);
  assert.equal(adjustFit(NO_FIT, { scaleBy: 0.001 }).scale, 0.3);
  assert.ok(DEFAULT_PLACEMENT.head.size > 0);
});

test('gear placement: worn gear lists items in slot order and skips missing ones', () => {
  const look = (id: string, slot: Look['slot']): Look => ({ id, name: id, rarity: 'common', slot, pack: { packId: 'p', image: `${id}.png` } }) as Look;
  const catalog = [look('boots', 'feet'), look('band', 'head'), look('sword', 'weapon')];
  const worn = wornGear({ feet: 'boots', head: 'band', weapon: 'gone' }, { band: { dx: 0.1, dy: 0, scale: 1 } }, catalog);
  assert.deepEqual(worn.map((w) => w.slot), ['head', 'feet']);
  assert.equal(worn[0].fit?.dx, 0.1);
  assert.equal(worn[1].fit, undefined);
});
