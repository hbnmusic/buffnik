import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePng } from '../src/data/sheet/png';
import { sliceSheet } from '../src/data/sheet/slicer';
import { defaultRarity, listWarnings, parseSheetList, planSheetPack } from '../src/data/sheet/plan';
import { validateManifest } from '../src/data/packs';
import { buildCatalog } from '../src/state/looks';
import { itemCoinPrice, resolveLooks } from '../src/engine';
import { defaultBook, equipGear, repairLooks, updateCharacter, addCharacter } from '../src/state/characters';

const pieces = () => sliceSheet(decodePng(new Uint8Array(readFileSync(new URL('./fixtures/sheet-aa.png', import.meta.url))))).pieces;

const LIST = `CHARACTER | Test Hero
OUTFIT | Field Uniform | rare
OUTFIT | Evening Dress | epic
OUTFIT | Casual
OUTFIT | Battle Dress | legendary
1 | Black Blindfold | face | rare
2 | Steel Ring | hands | epic
3. Leather Boots | feet | common
4 | Long Sword | weapon | legendary
5 | Mystery Charm | gizmo | shiny
7 | Gym Towel | accessory | common`;

test('list: reads the format Gemini was asked for, tolerating small variations', () => {
  const l = parseSheetList(LIST);
  assert.equal(l.character, 'Test Hero');
  assert.deepEqual(l.outfits.map((o) => [o.name, o.rarity]), [['Field Uniform', 'rare'], ['Evening Dress', 'epic'], ['Casual', undefined], ['Battle Dress', 'legendary']]);
  assert.deepEqual(l.items.map((i) => i.number), [1, 2, 3, 4, 5, 7]);
  assert.equal(l.items[2].name, 'Leather Boots'); // "3." style
  assert.equal(l.items[4].slot, undefined); // unknown words are ignored, not guessed
  assert.equal(l.items[4].rarity, undefined);

  const loose = parseSheetList('**1** | **Red Hat** | Hat | Rare\n2) Blue Shoes - shoes - epic\n- not a line\n\n```\n3 | Gold Cape | back | LEGENDARY\n```');
  assert.deepEqual(loose.items.map((i) => [i.number, i.name, i.slot, i.rarity]), [[1, 'Red Hat', 'head', 'rare'], [2, 'Blue Shoes', 'feet', 'epic'], [3, 'Gold Cape', 'back', 'legendary']]);
});

test('plan: a sheet becomes a valid pack with a starter base character, outfits and slotted items', () => {
  const r = planSheetPack(pieces(), { packId: 'test-hero', packName: 'Test Hero', list: parseSheetList(LIST) });
  assert.ok(r.ok);
  if (!r.ok) return;
  const { manifest, files, added } = r.plan;
  assert.deepEqual(added, { character: true, outfits: 4, items: 18 });
  assert.equal(validateManifest(manifest).ok, true);
  assert.equal(files.length, 23);
  const base = manifest.looks.find((l) => l.starter)!;
  assert.equal(base.name, 'Test Hero');
  assert.equal(r.plan.baseLookId, base.id);
  const sword = manifest.looks.find((l) => l.name === 'Long Sword')!;
  assert.equal(sword.slot, 'weapon');
  assert.equal(sword.rarity, 'legendary');
  assert.equal(manifest.looks.find((l) => l.name === 'Evening Dress')!.slot, undefined); // outfits are full looks
  const unnamed = manifest.looks.find((l) => l.name === 'Item 9')!; // beyond the pasted list
  assert.equal(unnamed.slot, 'accessory');
  assert.ok(['common', 'rare', 'epic', 'legendary'].includes(unnamed.rarity));
  assert.deepEqual(files.map((f) => f.path).sort(), manifest.looks.map((l) => l.image).sort());
  assert.ok(files.every((f) => f.bytes[0] === 0x89)); // PNG
});

test('plan: deleted pieces keep the numbers of the others, and a second sheet adds to the pack', () => {
  const list = parseSheetList(LIST);
  const first = planSheetPack(pieces(), { packId: 'test-hero', packName: 'Test Hero', list, skipItems: [2], skipOutfits: [3], skipCharacter: false });
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.equal(first.plan.added.items, 17);
  assert.equal(first.plan.manifest.looks.some((l) => l.name === 'Steel Ring'), false);
  assert.ok(first.plan.manifest.looks.some((l) => l.name === 'Leather Boots')); // number 3 still named from list number 3

  // Second sheet: items only, same names again (ids must not collide).
  const items = pieces().filter((p) => p.kind === 'item').slice(0, 6);
  const second = planSheetPack(items, { packId: 'test-hero', packName: 'ignored', list, existing: first.plan.manifest });
  assert.ok(second.ok);
  if (!second.ok) return;
  const ids = second.plan.manifest.looks.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(second.plan.manifest.name, 'Test Hero');
  assert.ok(second.plan.files.every((f) => f.path.startsWith('s2/')));
  assert.equal(second.plan.added.character, false);
  assert.equal(second.plan.manifest.looks.length, first.plan.manifest.looks.length + 6);
});

test('plan: removing everything is an error; list warnings describe mismatches', () => {
  const ps = pieces();
  const r = planSheetPack(ps.slice(0, 2), { packId: 'p', packName: 'P', list: { outfits: [], items: [] }, skipCharacter: true, skipOutfits: [1] });
  assert.equal(r.ok, false);
  assert.match(listWarnings({ outfits: [], items: [] }, ps)[0], /No item list/);
  assert.match(listWarnings(parseSheetList(LIST), ps).join(' '), /6 items but 18 pieces/);
  assert.deepEqual(listWarnings({ outfits: [], items: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, name: 'x' })) }, ps), []);
});

test('rarity default is stable and roughly 60/25/10/5', () => {
  assert.equal(defaultRarity('a:1:1'), defaultRarity('a:1:1'));
  const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < 2000; i++) counts[defaultRarity(`pack:1:${i}`)]++;
  assert.ok(counts.common > 1000 && counts.common < 1400, JSON.stringify(counts));
  assert.ok(counts.legendary > 40 && counts.legendary < 180, JSON.stringify(counts));
});

test('gear: pack items join the catalog, cost less than outfits, and can be won as loot', () => {
  const r = planSheetPack(pieces(), { packId: 'test-hero', packName: 'Test Hero', list: parseSheetList(LIST) });
  assert.ok(r.ok);
  if (!r.ok) return;
  const catalog = buildCatalog([r.plan.manifest]);
  const base = catalog.find((l) => l.pack && l.starter)!;
  const gear = catalog.filter((l) => l.slot);
  assert.equal(gear.length, 18);
  assert.ok(itemCoinPrice(gear.find((g) => g.rarity === 'common')!) < itemCoinPrice({ rarity: 'common' }));
  const res = resolveLooks(catalog, [{ date: '2026-11-02', kind: 'drop', eventId: 'd1', rarity: 'rare' }]);
  assert.ok(res.owned.includes(base.id), 'the base character is owned from the start');
  assert.equal(Object.keys(res.picks).length, 1);
});

test('gear: equip, unequip, and drop what is no longer owned', () => {
  let book = defaultBook();
  book = equipGear(book, 'hero-1', 'weapon', 'p:sword');
  book = equipGear(book, 'hero-1', 'head', 'p:hat');
  assert.deepEqual(book.slots[0].gear, { weapon: 'p:sword', head: 'p:hat' });
  book = equipGear(book, 'hero-1', 'head', null);
  assert.deepEqual(book.slots[0].gear, { weapon: 'p:sword' });
  assert.deepEqual(repairLooks(book, ['gym-tee']).slots[0].gear, {}); // sword not owned any more
  assert.deepEqual(repairLooks(book, ['gym-tee', 'p:sword']).slots[0].gear, { weapon: 'p:sword' });
  const added = addCharacter(updateCharacter(book, 'hero-1', { name: 'A' }), 'B', 'hero-2');
  assert.deepEqual(added.slots[1].gear, {}); // a new character starts with nothing equipped
});
