import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { CONFIG } from '@/engine';
import { addTreat, removeTreat, updateTreat } from '@/state/catalog';
import { useGame } from '@/state/GameProvider';
import { usd } from '@/ui/format';
import { Btn, C, Card, Chip, inputStyle, Screen, t } from '@/ui/theme';

function PriceField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <TextInput
      style={[inputStyle, { width: 90, textAlign: 'right' }]}
      value={text}
      onChangeText={setText}
      keyboardType="decimal-pad"
      onEndEditing={() => {
        const n = Number(text.replace(/[^0-9.]/g, ''));
        if (n > 0) onCommit(n);
        else setText(String(value));
      }}
    />
  );
}

export default function EditShop() {
  const { loaded, saveShopCatalog } = useGame();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [kind, setKind] = useState<'real' | 'vault'>('real');
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;
  const items = loaded.catalog;
  const treats = items.filter((i) => i.kind === 'real' || i.kind === 'vault');
  const fail = (e: unknown) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
  const save = (next: typeof items) => saveShopCatalog(next).catch(fail);

  return (
    <Screen>
      <Text style={t.muted}>Prices are in dollars. Coins are 10 per dollar. Changing a price does not change treats you already bought.</Text>
      {treats.map((i) => (
        <Card key={i.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[t.body, { flex: 1 }]}>{i.name}</Text>
            <Text style={t.muted}>$</Text>
            <PriceField value={i.priceUsd ?? 0} onCommit={(n) => save(updateTreat(items, i.id, { priceUsd: n }))} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Chip label="Everyday" selected={i.kind === 'real'} onPress={() => save(updateTreat(items, i.id, { kind: 'real' }))} />
            <Chip label="Big-ticket (vault)" selected={i.kind === 'vault'} onPress={() => save(updateTreat(items, i.id, { kind: 'vault' }))} />
            <View style={{ flex: 1 }} />
            <Text
              style={{ color: C.bad, fontWeight: '600' }}
              onPress={() =>
                Alert.alert(`Delete ${i.name}?`, undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => save(removeTreat(items, i.id)) },
                ])
              }
            >
              Delete
            </Text>
          </View>
        </Card>
      ))}

      <Card title="Add a treat">
        <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Name, for example Nice watch" placeholderTextColor={C.faint} />
        <TextInput style={inputStyle} value={price} onChangeText={setPrice} placeholder="Price in dollars" placeholderTextColor={C.faint} keyboardType="decimal-pad" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Everyday" selected={kind === 'real'} onPress={() => setKind('real')} />
          <Chip label="Big-ticket (vault)" selected={kind === 'vault'} onPress={() => setKind('vault')} />
        </View>
        <Text style={t.small}>Big-ticket treats can use savings from the vault ({usd(CONFIG.economy.vaultCapUsd)} cap) on top of this month's budget, so watches and trips fit here.</Text>
        <Btn
          label="Add"
          onPress={async () => {
            try {
              await saveShopCatalog(addTreat(items, name, Number(price.replace(/[^0-9.]/g, '')), kind, `custom-${Date.now()}`));
              setName('');
              setPrice('');
            } catch (e) {
              fail(e);
            }
          }}
        />
      </Card>
    </Screen>
  );
}
