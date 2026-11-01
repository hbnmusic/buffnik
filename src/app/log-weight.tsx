import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { addDays } from '@/engine';
import { useGame } from '@/state/GameProvider';
import { Btn, C, Card, Chip, inputStyle, Screen, t } from '@/ui/theme';

export default function LogWeight() {
  const { loaded, addWeight } = useGame();
  const [lb, setLb] = useState(loaded?.latestWeightLb ? String(loaded.latestWeightLb) : '');
  const [fat, setFat] = useState('');
  const [daysAgo, setDaysAgo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!loaded) return;
    setError(null);
    setBusy(true);
    try {
      const bf = parseFloat(fat.replace(',', '.'));
      await addWeight(addDays(loaded.today, -daysAgo), parseFloat(lb.replace(',', '.')), bf > 0 ? bf : undefined);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card title="Weight (pounds)">
        <TextInput style={inputStyle} value={lb} onChangeText={setLb} keyboardType="decimal-pad" placeholder="188.4" placeholderTextColor={C.faint} />
      </Card>
      <Card title="Body fat % (optional)">
        <TextInput style={inputStyle} value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="20.5" placeholderTextColor={C.faint} />
      </Card>
      <Card title="When">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['Today', 'Yesterday'].map((label, i) => (
            <Chip key={label} label={label} selected={daysAgo === i} onPress={() => setDaysAgo(i)} />
          ))}
        </View>
      </Card>
      <Text style={t.small}>One entry per day. A reading you type replaces the synced one for that day. The weight bosses follow the 7-day average.</Text>
      {error && <Text style={t.error}>{error}</Text>}
      <Btn label="Save" onPress={save} disabled={busy || !loaded} />
    </Screen>
  );
}
