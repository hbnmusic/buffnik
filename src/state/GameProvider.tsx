import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { ActivityKind } from '../engine';
import type { WeightUnit } from '../data/strongCsv';
import { registerBackgroundSync } from './background';
import { announceAndSchedule, runSyncCycle } from './cycle';
import { requestNotificationPermission } from './notify';
import { buy, buyLook, importStrong, loadGame, logWeight, logWorkout, saveCharacters, refreshSteam, type BuyResult, type Loaded, type StrongImportSummary } from './service';
import { installPackFromZip, deletePackFiles } from '../data/packFiles';
import { addPack, removePack } from './looks';
import type { CharacterBook } from './characters';
import { saveCatalog } from './catalog';
import type { ShopItem } from '../engine';
import { saveSettings, type Settings } from './settings';
import { openSqliteStore } from './sqliteStore';
import type { Store } from './store';

interface GameContextValue {
  loaded: Loaded | null;
  error: string | null;
  syncing: boolean;
  /** Result of the last sync attempt, shown on the home screen. */
  syncMessage: string | null;
  sync: (askPermission?: boolean) => Promise<void>;
  importStrongCsv: (text: string, unit: WeightUnit) => Promise<StrongImportSummary>;
  addWorkout: (w: { kind: ActivityKind; date: string; durationMin: number; distanceKm?: number }) => Promise<void>;
  addWeight: (date: string, weightLb: number, bodyFatPct?: number) => Promise<void>;
  purchase: (itemId: string) => Promise<BuyResult>;
  purchaseLook: (lookId: string) => Promise<BuyResult>;
  saveCharacterBook: (book: CharacterBook) => Promise<void>;
  /** Install an art pack from a zip file; returns the pack name. */
  importPack: (zipUri: string) => Promise<string>;
  deletePack: (packId: string) => Promise<void>;
  saveShopCatalog: (items: ShopItem[]) => Promise<void>;
  refreshSteamWishlist: () => Promise<void>;
  /** CSV text shared into the app from Strong, waiting for the import screen. */
  pendingShare: string | null;
  setPendingShare: (text: string | null) => void;
  updateSettings: (settings: Settings) => Promise<void>;
  /** Asks Android for notification permission; true if granted. */
  enableNotifications: () => Promise<boolean>;
  /** Reload from storage, for screens that changed it directly (backup restore, catalog edits). */
  reload: () => Promise<void>;
  store: () => Store;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

const AUTO_SYNC_MIN_AGE_MS = 10 * 60_000;

export function GameProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<Store | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pendingShare, setPendingShare] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!storeRef.current) return;
    const l = await loadGame(storeRef.current);
    setLoaded(l);
    return l;
  }, []);

  /** After a change the user made themselves: no unlock alerts, but reminders are rescheduled. */
  const refreshQuietly = useCallback(async () => {
    const l = await refresh();
    if (l && storeRef.current) await announceAndSchedule(storeRef.current, l, false);
  }, [refresh]);

  const sync = useCallback(
    async (askPermission = true) => {
      const store = storeRef.current;
      if (!store) return;
      setSyncing(true);
      try {
        const { outcome, loaded: l } = await runSyncCycle(store, askPermission);
        setSyncMessage(outcome.message);
        setLoaded(l);
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  // Open the database once, then sync quietly (no permission prompt) on start.
  useEffect(() => {
    (async () => {
      try {
        storeRef.current = await openSqliteStore();
        await refreshQuietly();
        await sync(false);
        await registerBackgroundSync();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshQuietly, sync]);

  // Sync again when the app returns to the foreground, at most every ten minutes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || !storeRef.current) return;
      const last = await storeRef.current.getMeta('lastSync');
      if (!last || Date.now() - Date.parse(last) > AUTO_SYNC_MIN_AGE_MS) await sync(false);
      else await refresh(); // the date may have changed
    });
    return () => sub.remove();
  }, [refresh, sync]);

  const withStore = <T,>(fn: (s: Store) => Promise<T>): Promise<T> => {
    if (!storeRef.current) return Promise.reject(new Error('Still loading. Try again in a moment.'));
    return fn(storeRef.current);
  };

  const value: GameContextValue = {
    loaded,
    error,
    syncing,
    syncMessage,
    pendingShare,
    setPendingShare,
    sync,
    importStrongCsv: async (text, unit) => {
      const summary = await withStore((s) => importStrong(s, text, unit));
      await refreshQuietly();
      return summary;
    },
    addWorkout: async (w) => {
      await withStore((s) => logWorkout(s, w));
      await refreshQuietly();
    },
    addWeight: async (date, lb, bf) => {
      await withStore((s) => logWeight(s, date, lb, bf));
      await refreshQuietly();
    },
    purchase: async (itemId) => {
      const result = await withStore((s) => buy(s, itemId));
      await refreshQuietly();
      return result;
    },
    purchaseLook: async (lookId) => {
      const result = await withStore((s) => buyLook(s, lookId));
      await refreshQuietly();
      return result;
    },
    saveCharacterBook: async (book) => {
      await withStore((s) => saveCharacters(s, book));
      await refresh();
    },
    importPack: async (zipUri) => {
      const manifest = await installPackFromZip(zipUri);
      await withStore((s) => addPack(s, manifest));
      await refresh();
      return manifest.name;
    },
    deletePack: async (packId) => {
      await withStore((s) => removePack(s, packId));
      deletePackFiles(packId);
      await refresh();
    },
    saveShopCatalog: async (items) => {
      await withStore((s) => saveCatalog(s, items));
      await refresh();
    },
    refreshSteamWishlist: async () => {
      await withStore((s) => refreshSteam(s, (url) => fetch(url)));
      await refresh();
    },
    updateSettings: async (settings) => {
      await withStore((s) => saveSettings(s, settings));
      await refreshQuietly();
    },
    enableNotifications: async () => {
      const ok = await requestNotificationPermission();
      await refreshQuietly();
      return ok;
    },
    reload: async () => {
      await refreshQuietly();
    },
    store: () => {
      if (!storeRef.current) throw new Error('Still loading. Try again in a moment.');
      return storeRef.current;
    },
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
