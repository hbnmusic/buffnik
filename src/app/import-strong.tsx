import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { StrongImportSummary } from '@/state/service';
import { useGame } from '@/state/GameProvider';
import { Btn, Card, Chip, Row, Screen, t } from '@/ui/theme';

export default function ImportStrong() {
  const { importStrongCsv } = useGame();
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<StrongImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    setSummary(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      setBusy(true);
      const text = await new File(res.assets[0].uri).text();
      setSummary(await importStrongCsv(text, unit));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card title="How">
        <Text style={t.body}>In Strong: Settings, Export Strong Data, then save the CSV to your phone. Pick that file here.</Text>
        <Text style={t.small}>
          Importing the same file again is harmless. A workout that Health Connect also recorded counts once and keeps your sets. Workouts from before the game started only set your lifting records.
        </Text>
      </Card>

      <Card title="Weights in the file are in">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Pounds" selected={unit === 'lb'} onPress={() => setUnit('lb')} />
          <Chip label="Kilograms" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
        </View>
        <Text style={t.small}>This is the unit you picked in Strong's settings.</Text>
      </Card>

      <Btn label={busy ? 'Importing…' : 'Choose the CSV file'} onPress={pick} disabled={busy} />
      {error && <Text style={t.error}>{error}</Text>}

      {summary && (
        <Card title="Imported">
          <Row left="Workouts in the file" right={String(summary.inFile)} />
          <Row left="New" right={String(summary.added)} />
          <Row left="Already imported before" right={String(summary.alreadyImported)} />
          <Row left="Also recorded by Health Connect (counted once)" right={String(summary.matchedHealthConnect)} />
          <Row left="Before the game started (records only)" right={String(summary.beforeStart)} />
          {summary.skippedRows > 0 && <Row left="Rows skipped" right={String(summary.skippedRows)} />}
        </Card>
      )}
    </Screen>
  );
}
