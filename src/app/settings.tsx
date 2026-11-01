import { useState } from 'react';
import { Alert, Switch, Text, TextInput, View } from 'react-native';

import { parseTime, type Settings } from '@/state/settings';
import { useGame } from '@/state/GameProvider';
import { Btn, C, Card, inputStyle, Screen, t } from '@/ui/theme';

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={[t.body, { flexShrink: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.card2 }} thumbColor="#FFFFFF" />
    </View>
  );
}

function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={t.muted}>{label}</Text>
      <TextInput
        style={[inputStyle, { width: 100, textAlign: 'center' }]}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const [h, m] = parseTime(text, [-1, -1]);
          if (h < 0) setText(value);
          else onCommit(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }}
        keyboardType="numbers-and-punctuation"
        placeholder="18:00"
        placeholderTextColor={C.faint}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { loaded, updateSettings, enableNotifications, makeBackup, chooseBackup } = useGame();
  const [message, setMessage] = useState<string | null>(null);
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;

  const s = loaded.settings;
  const set = (patch: Partial<Settings['notifications']>) => updateSettings({ ...s, notifications: { ...s.notifications, ...patch } });

  return (
    <Screen>
      <Card title="Notifications">
        <Btn
          label="Allow notifications"
          secondary
          onPress={async () => setMessage((await enableNotifications()) ? 'Notifications are allowed.' : 'Android blocked it. Turn Buffnik on in the phone’s notification settings.')}
        />
        {message && <Text style={t.small}>{message}</Text>}
        <ToggleRow label="Daily nudge, until the week's target is met" value={s.notifications.dailyNudge} onChange={(v) => set({ dailyNudge: v })} />
        <TimeField label="Nudge time" value={s.notifications.dailyNudgeTime} onCommit={(v) => set({ dailyNudgeTime: v })} />
        <ToggleRow label="Weekly summary on Sundays" value={s.notifications.weeklySummary} onChange={(v) => set({ weeklySummary: v })} />
        <TimeField label="Summary time" value={s.notifications.weeklySummaryTime} onCommit={(v) => set({ weeklySummaryTime: v })} />
        <ToggleRow label="Unlocks: levels, loot, bosses, weekly results" value={s.notifications.unlocks} onChange={(v) => set({ unlocks: v })} />
        <ToggleRow label="Remind me to back up" value={s.notifications.backupReminder} onChange={(v) => set({ backupReminder: v })} />
      </Card>

      <Card title="Heart rate">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={[t.body, { flexShrink: 1 }]}>Max heart rate (bpm)</Text>
          <MaxHr value={s.maxHr} onCommit={(v) => updateSettings({ ...s, maxHr: v })} />
        </View>
        <Text style={t.small}>Workout minutes above 70% of this earn intensity XP. A common estimate is 220 minus your age.</Text>
      </Card>

      <Card title="Steam">
        <Text style={t.muted}>Profile name, link or 64-bit id for your wishlist. Your profile and game details must be public.</Text>
        <SteamField value={s.steamId} onCommit={(v) => updateSettings({ ...s, steamId: v })} />
      </Card>

      <Card title="Backup">
        <Text style={t.muted}>
          {loaded.daysSinceBackup === null ? 'No backup yet.' : loaded.daysSinceBackup === 0 ? 'Backed up today.' : `Last backup ${loaded.daysSinceBackup} days ago.`}
        </Text>
        <Btn
          label="Back up now (save to Drive)"
          onPress={async () => {
            try {
              await makeBackup();
            } catch (e) {
              Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
            }
          }}
        />
        <Btn
          label="Restore from a backup file"
          secondary
          onPress={async () => {
            try {
              const picked = await chooseBackup();
              if (!picked) return;
              Alert.alert('Replace everything?', `This replaces all data in the app with the backup: ${picked.summary}.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Restore',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await picked.apply();
                      Alert.alert('Restored', 'Your data is back.');
                    } catch (e) {
                      Alert.alert('Restore failed', e instanceof Error ? e.message : String(e));
                    }
                  },
                },
              ]);
            } catch (e) {
              Alert.alert('Could not read that file', e instanceof Error ? e.message : String(e));
            }
          }}
        />
        <Text style={t.small}>
          The backup is a JSON file with your workouts, weigh-ins, purchases and settings. In the share sheet pick Drive. Art pack images are not included; import the zip again after a restore.
        </Text>
      </Card>
    </Screen>
  );
}

function SteamField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <TextInput
      style={inputStyle}
      value={text}
      onChangeText={setText}
      onEndEditing={() => onCommit(text.trim())}
      autoCapitalize="none"
      autoCorrect={false}
      placeholder="acowfromspace"
      placeholderTextColor={C.faint}
    />
  );
}

function MaxHr({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <TextInput
      style={[inputStyle, { width: 100, textAlign: 'center' }]}
      value={text}
      onChangeText={setText}
      onEndEditing={() => {
        const n = parseInt(text, 10);
        if (n >= 120 && n <= 230) onCommit(n);
        else setText(String(value));
      }}
      keyboardType="number-pad"
    />
  );
}
