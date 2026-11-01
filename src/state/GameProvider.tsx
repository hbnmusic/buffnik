import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { ActivityKind } from '../engine';
import type { WeightUnit } from '../data/strongCsv';
import { buy, importStrong, loadGame, logWeight, logWorkout, type BuyResult, type Loaded, type StrongImportSummary } from './service';
import { openSqliteStore } from './sqliteStore';
import type { Store } from './store';
import { syncFromHealthConnect } from './sync';

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

  const refresh = useCallback(async () => {
    if (storeRef.current) setLoaded(await loadGame(storeRef.current));
  }, []);

  const sync = useCallback(
    async (askPermission = true) => {
      const store = storeRef.current;
      if (!store) return;
      setSyncing(true);
      try {
        const outcome = await syncFromHealthConnect(store, askPermission);
        setSyncMessage(outcome.message);
        await refresh();
      } finally {
        setSyncing(false);
      }
    },
    [refresh],
  );

  // Open the database once, then sync quietly (no permission prompt) on start.
  useEffect(() => {
    (async () => {
      try {
        storeRef.current = await openSqliteStore();
        await refresh();
        await sync(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refresh, sync]);

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
    sync,
    importStrongCsv: async (text, unit) => {
      const summary = await withStore((s) => importStrong(s, text, unit));
      await refresh();
      return summary;
    },
    addWorkout: async (w) => {
      await withStore((s) => logWorkout(s, w));
      await refresh();
    },
    addWeight: async (date, lb, bf) => {
      await withStore((s) => logWeight(s, date, lb, bf));
      await refresh();
    },
    purchase: async (itemId) => {
      const result = await withStore((s) => buy(s, itemId));
      await refresh();
      return result;
    },
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
