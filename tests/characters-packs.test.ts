import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { looksLikeZip, planPackImport, planPackZip, validateManifest } from '../src/data/packs';
import { addCharacter, defaultBook, loadBook, removeCharacter, repairLooks, saveBook, setActive, updateCharacter, MAX_CHARACTERS } from '../src/state/characters';
import { createMemoryStore } from '../src/state/store';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const manifest = (over: object = {}) => ({ format: 1, id: 'ember-pack', name: 'Ember Pack', looks: [{ id: 'ember', name: 'Ember', rarity: 'rare', image: 'ember.png', tiers: { '1': 'ember_1.png' } }], ...over });

test('characters: add, edit, switch and remove slots, with a limit', () => {
  let book = defaultBook();
  book = updateCharacter(book, 'hero-1', { name: 'Hana', hairStyle: 2 });
  book = addCharacter(book, 'Ren', 'hero-2');
  assert.equal(book.slots.length, 2);
  assert.equal(book.activeId, 'hero-2');
  assert.equal(book.slots[1].hairStyle, 2); // a new slot starts as a copy of the active one
  book = setActive(book, 'hero-1');
  assert.equal(book.activeId, 'hero-1');
  book = removeCharacter(book, 'hero-1');
  assert.deepEqual(book.slots.map((c) => c.id), ['hero-2']);
  assert.equal(book.activeId, 'hero-2');
  assert.throws(() => removeCharacter(book, 'hero-2'), /at least one/);
  for (let i = 0; i < MAX_CHARACTERS - 1; i++) book = addCharacter(book, `x${i}`, `h${i}`);
  assert.throws(() => addCharacter(book, 'too many', 'zz'), /up to 5/);
});

test('characters: a look that is no longer owned is replaced, and the book round-trips through storage', async () => {
  const book = updateCharacter(defaultBook(), 'hero-1', { lookId: 'golden-champion' });
  assert.equal(repairLooks(book, ['gym-tee', 'navy-tee']).slots[0].lookId, 'gym-tee');
  assert.equal(repairLooks(book, ['golden-champion']).slots[0].lookId, 'golden-champion');
  const store = createMemoryStore();
  assert.deepEqual(await loadBook(store), defaultBook());
  await saveBook(store, book);
  assert.deepEqual(await loadBook(store), book);
});

test('packs: a valid manifest passes, bad ones say what is wrong', () => {
  assert.equal(validateManifest(manifest()).ok, true);
  const bad = validateManifest(manifest({ id: 'Bad ID', looks: [{ id: 'a', name: 'A', rarity: 'mythic', image: '../x.png' }] }));
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.some((e) => e.includes('"id"')));
    assert.ok(bad.errors.some((e) => e.includes('rarity')));
    assert.ok(bad.errors.some((e) => e.includes('image')));
  }
  assert.equal(validateManifest(manifest({ looks: [] })).ok, false);
  assert.equal(validateManifest(null).ok, false);
});

test('packs: duplicate look ids are rejected', () => {
  const look = { id: 'a', name: 'A', rarity: 'common', image: 'a.png' };
  assert.equal(validateManifest(manifest({ looks: [look, look] })).ok, false);
});

test('packs: a zip with pack.json and its images imports, including from inside a folder', () => {
  const flat = planPackZip(zipSync({ 'pack.json': strToU8(JSON.stringify(manifest())), 'ember.png': png, 'ember_1.png': png, 'unused.png': png }));
  assert.equal(flat.ok, true);
  if (flat.ok) assert.deepEqual(flat.files.map((f) => f.path).sort(), ['ember.png', 'ember_1.png']); // only referenced files

  const nested = planPackZip(zipSync({ 'MyPack/pack.json': strToU8(JSON.stringify(manifest())), 'MyPack/ember.png': png, 'MyPack/ember_1.png': png }));
  assert.equal(nested.ok, true);
});

test('packs: missing images, missing manifest and non-zip files give clear errors', () => {
  const missing = planPackImport({ 'pack.json': strToU8(JSON.stringify(manifest())), 'ember.png': png });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.some((e) => e.includes('ember_1.png')));
  const none = planPackImport({ 'readme.txt': strToU8('hi') });
  assert.equal(none.ok, false);
  assert.equal(planPackZip(new Uint8Array([1, 2, 3])).ok, false);
  assert.equal(looksLikeZip(zipSync({ a: png })), true);
  assert.equal(looksLikeZip(png), false);
});
