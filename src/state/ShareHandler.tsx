import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { looksLikeStrongCsv } from '@/data/strongCsv';
import { useGame } from './GameProvider';

/**
 * Receives a file shared from Strong ("Export" then "Buffnik"), checks it, and opens the import screen,
 * which imports it straight away. Renders nothing.
 */
export function ShareHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { setPendingShare } = useGame();

  useEffect(() => {
    if (!hasShareIntent) return;
    (async () => {
      let text: string | null = null;
      const file = shareIntent.files?.[0];
      if (file?.path) {
        try {
          text = await new File(file.path).text();
        } catch {
          text = null;
        }
      }
      if (!text && shareIntent.text) text = shareIntent.text;
      resetShareIntent();

      // Even a wrong file opens the import screen, so the user sees a clear message.
      setPendingShare(text && looksLikeStrongCsv(text) ? text : '');
      setTimeout(() => router.push('/import-strong'), 0);
    })();
  }, [hasShareIntent, shareIntent, resetShareIntent, setPendingShare]);

  return null;
}
