/** Character slots: each has its own look and appearance. Stored as one JSON document. */
import type { GearSlot } from '../engine/wardrobe';
import type { GearFit } from '../ui/gearPlacement';
import type { Store } from './store';

export const MAX_CHARACTERS = 5;

export interface Character {
  id: string;
  name: string;
  skin: string;
  hairStyle: number;
  hairColor: string;
  eyeColor: string;
  /** Equipped look id (starter look ids, or 'packId:lookId' for art packs). */
  lookId: string;
  /** Gear item worn in each slot (catalog ids). */
  gear?: Partial<Record<GearSlot, string>>;
  /** How each worn item is placed on this character, by item id. */
  fit?: Record<string, GearFit>;
}

export interface CharacterBook {
  slots: Character[];
  activeId: string;
}

export function defaultCharacter(id = 'hero-1', name = 'Buffnik'): Character {
  return { id, name, skin: '#F4C7A1', hairStyle: 0, hairColor: '#5B3A29', eyeColor: '#4C7DD9', lookId: 'gym-tee' };
}

export function defaultBook(): CharacterBook {
  const c = defaultCharacter();
  return { slots: [c], activeId: c.id };
}

export const activeCharacter = (book: CharacterBook): Character => book.slots.find((c) => c.id === book.activeId) ?? book.slots[0];

export function addCharacter(book: CharacterBook, name: string, id: string): CharacterBook {
  if (book.slots.length >= MAX_CHARACTERS) throw new Error(`You can have up to ${MAX_CHARACTERS} characters.`);
  const base = activeCharacter(book);
  const c: Character = { ...base, id, name: name.trim() || `Hero ${book.slots.length + 1}`, gear: {}, fit: {} };
  return { slots: [...book.slots, c], activeId: c.id };
}

export function updateCharacter(book: CharacterBook, id: string, patch: Partial<Omit<Character, 'id'>>): CharacterBook {
  return { ...book, slots: book.slots.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function removeCharacter(book: CharacterBook, id: string): CharacterBook {
  if (book.slots.length <= 1) throw new Error('Keep at least one character.');
  const slots = book.slots.filter((c) => c.id !== id);
  return { slots, activeId: book.activeId === id ? slots[0].id : book.activeId };
}

export const setActive = (book: CharacterBook, id: string): CharacterBook => (book.slots.some((c) => c.id === id) ? { ...book, activeId: id } : book);

/** If a character wears a look that is no longer owned (or no longer exists), put them back in a safe one. */
export function repairLooks(book: CharacterBook, ownedIds: string[]): CharacterBook {
  const fallback = ownedIds[0] ?? 'gym-tee';
  return {
    ...book,
    slots: book.slots.map((c) => {
      const lookId = ownedIds.includes(c.lookId) ? c.lookId : fallback;
      const worn = Object.entries(c.gear ?? {}) as [GearSlot, string][];
      const keep = worn.filter(([, id]) => ownedIds.includes(id));
      if (lookId === c.lookId && keep.length === worn.length) return c;
      return { ...c, lookId, gear: Object.fromEntries(keep) };
    }),
  };
}

/** Wear a gear item in its slot, or take the slot's item off with `null`. */
export function equipGear(book: CharacterBook, id: string, slot: GearSlot, itemId: string | null): CharacterBook {
  return {
    ...book,
    slots: book.slots.map((c) => {
      if (c.id !== id) return c;
      const gear = { ...(c.gear ?? {}) };
      if (itemId === null) delete gear[slot];
      else gear[slot] = itemId;
      return { ...c, gear };
    }),
  };
}

export async function loadBook(store: Store): Promise<CharacterBook> {
  const raw = await store.getMeta('characters');
  if (!raw) return defaultBook();
  try {
    const b = JSON.parse(raw) as CharacterBook;
    return b.slots?.length ? b : defaultBook();
  } catch {
    return defaultBook();
  }
}

export async function saveBook(store: Store, book: CharacterBook): Promise<void> {
  await store.setMeta('characters', JSON.stringify(book));
}
