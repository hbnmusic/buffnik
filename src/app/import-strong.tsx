import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { WeightUnit } from '@/data/strongCsv';
import type { StrongImportSummary } from '@/state/service';
import { useGame } from '@/state/GameProvider';
import { Btn, Card, Chip, Row, Screen, t } from '@/ui/theme';

export default function ImportStrong() {
  const { loaded, importStrongCsv, pendingShare, setPendingShare } = useGame();
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ result: StrongImportSummary; unit: WeightUnit } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastText = useRef<string | null>(null);

  useEffect(() => {
    if (loaded) setUnit(loaded.strongUnit);
  }, [loaded?.strongUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (text: string, u: WeightUnit) => {
    setError(null);
    setSummary(null);
    setBusy(true);
    try {
      lastText.current = text;
      setUnit(u);
      setSummary({ result: await importStrongCsv(text, u), unit: u });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // A file shared from Strong imports straight away, using the unit from the last import.
  useEffect(() => {
    if (pendingShare === null || !loaded) return;
    const text = pendingShare;
    setPendingShare(null);
    if (text === '') setError('That did not look like a Strong export. In Strong, use Export and send the CSV file.');
    else run(text, loaded.strongUnit);
  }, [pendingShare, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      await run(await new File(res.assets[0].uri).text(), unit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const other: WeightUnit = summary?.unit === 'lb' ? 'kg' : 'lb';

  return (
    <Screen>
      <Card title="Fastest way">
        <Text style={t.body}>In Strong, tap Export and choose Buffnik in the share list. It imports straight away.</Text>
        <Text style={t.small}>
          Importing the same file again is harmless. A workout that Health Connect also recorded counts once and keeps your sets. Workouts from before the game started only set your lifting records.
        </Text>
      </Card>

      {busy && <Text style={t.muted}>Importing…</Text>}
      {error && <Text style={t.error}>{error}</Text>}

      {summary && (
        <Card title="Imported">
          <Row left="Workouts in the file" right={String(summary.result.inFile)} />
          <Row left="New" right={String(summary.result.added)} />
          <Row left="Already imported before" right={String(summary.result.alreadyImported)} />
          <Row left="Also recorded by Health Connect (counted once)" right={String(summary.result.matchedHealthConnect)} />
          <Row left="Before the game started (records only)" right={String(summary.result.beforeStart)} />
          {summary.result.skippedRows > 0 && <Row left="Rows skipped" right={String(summary.result.skippedRows)} />}
          <Text style={t.small}>Weights were read as {summary.unit === 'lb' ? 'pounds' : 'kilograms'}.</Text>
          <Btn label={`Weights were in ${other === 'lb' ? 'pounds' : 'kilograms'}? Re-import`} onPress={() => lastText.current && run(lastText.current, other)} secondary disabled={busy} />
        </Card>
      )}

      <Card title="Or pick a saved file">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Pounds" selected={unit === 'lb'} onPress={() => setUnit('lb')} />
          <Chip label="Kilograms" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
        </View>
        <Btn label="Choose the CSV file" onPress={pick} disabled={busy} secondary />
      </Card>
    </Screen>
  );
}
