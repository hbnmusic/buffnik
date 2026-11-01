import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWishlist, parseAppDetails, parseSteamInput, parseVanityXml, parseWishlist, type FetchLike } from '../src/data/steam';
import { addTreat, loadCatalog, removeTreat, saveCatalog, steamItems, updateTreat } from '../src/state/catalog';
import { buy, loadGame, refreshSteam } from '../src/state/service';
import { createMemoryStore } from '../src/state/store';
import { logWorkout } from '../src/state/service';

const details = (appid: number, name: string, finalCents: number, initialCents = finalCents, currency = 'USD') => ({
  [String(appid)]: { success: true, data: { name, is_free: false, price_overview: { currency, initial: initialCents, final: finalCents, discount_percent: Math.round((1 - finalCents / initialCents) * 100) } } },
});

const reply = (body: string, ok = true, status = 200) => ({ ok, status, text: async () => body });

function steamFetch(routes: { wishlist?: unknown; vanityXml?: string; apps?: Record<number, unknown>; failWishlist?: number }): { f: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const f: FetchLike = async (url) => {
    calls.push(url);
    if (url.includes('steamcommunity.com/id/')) return routes.vanityXml ? reply(routes.vanityXml) : reply('<response><error>not found</error></response>');
    if (url.includes('IWishlistService')) return routes.failWishlist ? reply('', false, routes.failWishlist) : reply(JSON.stringify(routes.wishlist ?? {}));
    const m = url.match(/appids=(\d+)/);
    const app = m ? routes.apps?.[Number(m[1])] : undefined;
    return app ? reply(JSON.stringify(app)) : reply('{}', false, 429);
  };
  return { f, calls };
}

test('steam: profile input forms', () => {
  assert.deepEqual(parseSteamInput('acowfromspace'), { kind: 'vanity', name: 'acowfromspace' });
  assert.deepEqual(parseSteamInput('https://steamcommunity.com/id/acowfromspace/'), { kind: 'vanity', name: 'acowfromspace' });
  assert.deepEqual(parseSteamInput('https://steamcommunity.com/profiles/76561198000000000'), { kind: 'id', id: '76561198000000000' });
  assert.deepEqual(parseSteamInput('76561198000000000'), { kind: 'id', id: '76561198000000000' });
  assert.equal(parseSteamInput('  '), null);
  assert.equal(parseSteamInput('not a name!'), null);
});

test('steam: parsers', () => {
  assert.equal(parseVanityXml('<profile><steamID64>76561198000000001</steamID64></profile>'), '76561198000000001');
  assert.equal(parseVanityXml('<response><error>x</error></response>'), null);
  assert.deepEqual(parseWishlist({ response: { items: [{ appid: 3, priority: 0 }, { appid: 2, priority: 2 }, { appid: 1, priority: 1 }] } }), [1, 2, 3]);
  assert.deepEqual(parseWishlist({}), []);
  const g = parseAppDetails(details(10, 'Hades II', 2999, 3999), 10)!;
  assert.deepEqual(g, { appid: 10, name: 'Hades II', priceUsd: 29.99, listUsd: 39.99, discountPct: 25 });
  assert.equal(parseAppDetails({ '10': { success: false } }, 10), null);
  assert.equal(parseAppDetails({ '10': { success: true, data: { name: 'Free', is_free: true } } }, 10), null);
  assert.equal(parseAppDetails(details(10, 'Euro', 1000, 1000, 'EUR'), 10), null);
});

test('steam: full flow resolves the vanity name, lists the wishlist and prices it', async () => {
  const { f, calls } = steamFetch({
    vanityXml: '<profile><steamID64>76561198000000001</steamID64></profile>',
    wishlist: { response: { items: [{ appid: 1, priority: 1 }, { appid: 2, priority: 2 }, { appid: 3, priority: 3 }] } },
    apps: { 1: details(1, 'Alpha', 1999), 2: details(2, 'Beta', 1500, 3000), 3: { '3': { success: true, data: { name: 'Free Game', is_free: true } } } },
  });
  const r = await fetchWishlist('acowfromspace', f);
  assert.equal(r.problem, null);
  assert.deepEqual(r.games.map((g) => [g.name, g.priceUsd]), [['Alpha', 19.99], ['Beta', 15]]);
  assert.equal(r.unpriced, 1);
  assert.ok(calls.some((c) => c.includes('steamid=76561198000000001')));
});

test('steam: problems come back as readable messages, never exceptions', async () => {
  assert.match((await fetchWishlist('', steamFetch({}).f)).problem!, /Settings/);
  assert.match((await fetchWishlist('nobody', steamFetch({}).f)).problem!, /Could not find a Steam profile/);
  assert.match((await fetchWishlist('76561198000000001', steamFetch({ failWishlist: 403 }).f)).problem!, /public/);
  assert.match((await fetchWishlist('76561198000000001', steamFetch({ wishlist: { response: {} } }).f)).problem!, /empty/);
  const throwing: FetchLike = async () => {
    throw new Error('Network request failed');
  };
  assert.match((await fetchWishlist('someone', throwing)).problem!, /Network request failed/);
});

test('catalog: add, edit and delete treats; utilities cannot be removed', () => {
  const store = createMemoryStore();
  return (async () => {
    let items = await loadCatalog(store);
    assert.ok(items.some((i) => i.id === 'freeze'));
    items = addTreat(items, 'Nice watch', 350, 'vault', 'custom-1');
    items = updateTreat(items, 'cocktail-home', { priceUsd: 9.5 });
    items = removeTreat(items, 'wine');
    items = removeTreat(items, 'freeze');
    await saveCatalog(store, items);
    const again = await loadCatalog(store);
    assert.equal(again.find((i) => i.id === 'custom-1')?.kind, 'vault');
    assert.equal(again.find((i) => i.id === 'cocktail-home')?.priceUsd, 9.5);
    assert.equal(again.some((i) => i.id === 'wine'), false);
    assert.ok(again.some((i) => i.id === 'freeze'));
    assert.throws(() => addTreat(again, '', 5, 'real', 'x'), /name/);
    assert.throws(() => addTreat(again, 'Free', 0, 'real', 'y'), /price/);
    assert.equal(steamItems([{ appid: 5, name: 'G', priceUsd: 10, listUsd: 10, discountPct: 0 }])[0].id, 'steam:5');
  })();
});

test('shop: a Steam game from the cached wishlist can be bought with budget and coins', async () => {
  const store = createMemoryStore();
  const today = '2026-11-10';
  const { f } = steamFetch({
    vanityXml: '<steamID64>76561198000000001</steamID64>',
    wishlist: { response: { items: [{ appid: 1, priority: 1 }] } },
    apps: { 1: details(1, 'Alpha', 2000) },
  });
  const cache = await refreshSteam(store, f, Date.parse('2026-11-10T12:00:00Z'));
  assert.equal(cache.games.length, 1);

  // A failed refresh keeps the last good list but shows the problem.
  const broken = await refreshSteam(store, async () => reply('', false, 500));
  assert.equal(broken.games.length, 1);
  assert.ok(broken.problem);

  for (let i = 0; i < 3; i++) await logWorkout(store, { kind: 'run', date: today, durationMin: 120, distanceKm: 20 });
  const loaded = await loadGame(store, today);
  assert.ok(loaded.shopItems.some((i) => i.id === 'steam:1'));
  const r = await buy(store, 'steam:1', today);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.purchase.usdFromMonth, 20);
});
