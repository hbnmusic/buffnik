/**
 * Steam wishlist. Three public web calls, all read-only and unauthenticated:
 *  1. vanity name -> 64-bit id  (steamcommunity.com/id/<name>/?xml=1)
 *  2. wishlist app ids           (api.steampowered.com/IWishlistService/GetWishlist/v1)
 *  3. name and price per app     (store.steampowered.com/api/appdetails)
 * The wishlist must be public on Steam for step 2 to return anything.
 * Fetch is injected so parsing and flow are tested without the network.
 */
export interface SteamGame {
  appid: number;
  name: string;
  /** Current price in US dollars after any discount. */
  priceUsd: number;
  /** Price before discount. */
  listUsd: number;
  discountPct: number;
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type SteamRef = { kind: 'id'; id: string } | { kind: 'vanity'; name: string };

/** Accepts a vanity name, a 64-bit id, or a steamcommunity.com profile link. */
export function parseSteamInput(input: string): SteamRef | null {
  const s = input.trim();
  if (!s) return null;
  const profiles = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profiles) return { kind: 'id', id: profiles[1] };
  const vanityUrl = s.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/i);
  if (vanityUrl) return { kind: 'vanity', name: vanityUrl[1] };
  if (/^\d{17}$/.test(s)) return { kind: 'id', id: s };
  if (/^[A-Za-z0-9_-]{2,64}$/.test(s)) return { kind: 'vanity', name: s };
  return null;
}

export function parseVanityXml(xml: string): string | null {
  return xml.match(/<steamID64>(\d{17})<\/steamID64>/)?.[1] ?? null;
}

export function parseWishlist(json: unknown): number[] {
  const items = (json as { response?: { items?: { appid?: number; priority?: number }[] } })?.response?.items;
  if (!Array.isArray(items)) return [];
  // Steam priority 1 is the top of the list; 0 means unranked.
  return items
    .filter((i): i is { appid: number; priority?: number } => typeof i.appid === 'number')
    .sort((a, b) => (a.priority || 1e9) - (b.priority || 1e9))
    .map((i) => i.appid);
}

/** One appdetails response for a single app, or null if the game has no price (free, unreleased, removed). */
export function parseAppDetails(json: unknown, appid: number): SteamGame | null {
  const entry = (json as Record<string, { success?: boolean; data?: { name?: string; is_free?: boolean; price_overview?: { final?: number; initial?: number; discount_percent?: number; currency?: string } } }>)?.[String(appid)];
  if (!entry?.success || !entry.data) return null;
  const price = entry.data.price_overview;
  if (!entry.data.name || !price || typeof price.final !== 'number' || price.currency !== 'USD') return null;
  return {
    appid,
    name: entry.data.name,
    priceUsd: Math.round(price.final) / 100,
    listUsd: Math.round(price.initial ?? price.final) / 100,
    discountPct: price.discount_percent ?? 0,
  };
}

export interface WishlistResult {
  games: SteamGame[];
  /** Wishlist entries without a USD price (free to play, unreleased, or lookup failed). */
  unpriced: number;
  /** What went wrong, in words the user can act on. Empty when everything worked. */
  problem: string | null;
}

const MAX_GAMES = 120;

async function getText(f: FetchLike, url: string): Promise<string> {
  const r = await f(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export async function fetchWishlist(input: string, f: FetchLike): Promise<WishlistResult> {
  const empty = (problem: string): WishlistResult => ({ games: [], unpriced: 0, problem });
  const ref = parseSteamInput(input);
  if (!ref) return empty('Enter your Steam profile name, link or 64-bit id in Settings.');

  let id: string;
  if (ref.kind === 'id') id = ref.id;
  else {
    try {
      const resolved = parseVanityXml(await getText(f, `https://steamcommunity.com/id/${encodeURIComponent(ref.name)}/?xml=1`));
      if (!resolved) return empty(`Could not find a Steam profile called "${ref.name}". If it is private or the name is different, paste the profile link or 64-bit id instead.`);
      id = resolved;
    } catch (e) {
      return empty(`Could not reach Steam to look up "${ref.name}" (${e instanceof Error ? e.message : String(e)}).`);
    }
  }

  let appids: number[];
  try {
    appids = parseWishlist(JSON.parse(await getText(f, `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${id}`)));
  } catch (e) {
    return empty(`Could not read the wishlist (${e instanceof Error ? e.message : String(e)}). Check that your Steam profile and game details are public.`);
  }
  if (appids.length === 0) return empty('The wishlist came back empty. Check that your Steam profile and game details are public, and that the wishlist has games on it.');

  const games: SteamGame[] = [];
  let unpriced = 0;
  const queue = appids.slice(0, MAX_GAMES);
  unpriced += appids.length - queue.length;
  let failures = 0;
  const worker = async () => {
    for (let a = queue.shift(); a !== undefined; a = queue.shift()) {
      try {
        const text = await getText(f, `https://store.steampowered.com/api/appdetails?appids=${a}&cc=us&filters=basic,price_overview`);
        const g = parseAppDetails(JSON.parse(text), a);
        if (g) games.push(g);
        else unpriced++;
      } catch {
        failures++;
        unpriced++;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const order = new Map(appids.map((a, i) => [a, i]));
  games.sort((x, y) => (order.get(x.appid) ?? 0) - (order.get(y.appid) ?? 0));
  return {
    games,
    unpriced,
    problem: failures > 0 && games.length === 0 ? 'Steam did not return prices. It may be rate limiting; try again in a few minutes.' : failures > 0 ? `${failures} games could not be priced (Steam may be rate limiting).` : null,
  };
}

export const steamItemId = (appid: number) => `steam:${appid}`;
