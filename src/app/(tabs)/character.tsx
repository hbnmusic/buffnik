import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { addCharacter, activeCharacter, MAX_CHARACTERS, removeCharacter, setActive, updateCharacter, type Character } from '@/state/characters';
import { useGame } from '@/state/GameProvider';
import { CharacterView } from '@/ui/CharacterView';
import { EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '@/ui/characterSpec';
import { Btn, C, Card, Chip, Screen, inputStyle, t } from '@/ui/theme';
import type { Look } from '@/engine';

const RARITY_COLOR: Record<string, string> = { common: '#A9A3C7', rare: '#6EA8FF', epic: '#C58BFF', legendary: '#FFD166' };

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {colors.map((c) => (
        <Pressable
          key={c}
          onPress={() => onPick(c)}
          accessibilityLabel={`colour ${c}`}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: value === c ? 3 : 1, borderColor: value === c ? '#FFFFFF' : '#00000055' }}
        />
      ))}
    </View>
  );
}

export default function CharacterTab() {
  const { loaded, saveCharacterBook, importPack, deletePack } = useGame();
  const [busy, setBusy] = useState(false);
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;

  const { characters: book, lookCatalog, ownedLookIds, state, packs } = loaded;
  const hero = activeCharacter(book);
  const look = lookCatalog.find((l) => l.id === hero.lookId) ?? lookCatalog[0];
  const owned = lookCatalog.filter((l) => ownedLookIds.includes(l.id));
  const patch = (p: Partial<Omit<Character, 'id'>>) => saveCharacterBook(updateCharacter(book, hero.id, p));
  const fail = (e: unknown) => Alert.alert('Could not do that', e instanceof Error ? e.message : String(e));

  const pickPack = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], copyToCacheDirectory: true });
      if (res.canceled) return;
      setBusy(true);
      const name = await importPack(res.assets[0].uri);
      Alert.alert('Pack added', `${name} is installed. Its looks drop as loot and appear in the shop.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const lookTile = (l: Look) => (
    <Pressable key={l.id} onPress={() => patch({ lookId: l.id })} style={{ width: '31%', alignItems: 'center', gap: 4 }}>
      <View style={{ borderWidth: 2, borderRadius: 18, borderColor: hero.lookId === l.id ? '#FFFFFF' : 'transparent', padding: 2 }}>
        <CharacterView character={hero} look={l} tier={state.buildTier} width={86} />
      </View>
      <Text style={{ color: RARITY_COLOR[l.rarity], fontSize: 12, textAlign: 'center' }} numberOfLines={1}>{l.name}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <CharacterView character={hero} look={look} tier={state.buildTier} width={220} />
        <Text style={t.h2}>{hero.name}</Text>
        <Text style={t.small}>{look.name} · build tier {state.buildTier} (changes as your strength and body composition do)</Text>
      </View>

      <Card title="Characters">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {book.slots.map((c) => (
            <Chip key={c.id} label={c.name} selected={c.id === book.activeId} onPress={() => saveCharacterBook(setActive(book, c.id))} />
          ))}
        </View>
        <TextInput
          style={inputStyle}
          defaultValue={hero.name}
          key={hero.id}
          placeholder="Name"
          placeholderTextColor={C.faint}
          maxLength={20}
          onEndEditing={(e) => patch({ name: e.nativeEvent.text.trim() || hero.name })}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Btn
              label="Add character"
              secondary
              disabled={book.slots.length >= MAX_CHARACTERS}
              onPress={() => {
                try {
                  saveCharacterBook(addCharacter(book, `Hero ${book.slots.length + 1}`, `hero-${Date.now()}`));
                } catch (e) {
                  fail(e);
                }
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Btn
              label="Delete"
              secondary
              disabled={book.slots.length <= 1}
              onPress={() =>
                Alert.alert(`Delete ${hero.name}?`, 'Looks you own stay in your wardrobe.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => saveCharacterBook(removeCharacter(book, hero.id)) },
                ])
              }
            />
          </View>
        </View>
      </Card>

      <Card title="Appearance">
        <Text style={t.small}>Skin</Text>
        <Swatches colors={SKIN_TONES} value={hero.skin} onPick={(c) => patch({ skin: c })} />
        <Text style={t.small}>Hair style</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HAIR_STYLES.map((name, i) => (
            <Chip key={name} label={name} selected={hero.hairStyle === i} onPress={() => patch({ hairStyle: i })} />
          ))}
        </View>
        <Text style={t.small}>Hair colour</Text>
        <Swatches colors={HAIR_COLORS} value={hero.hairColor} onPick={(c) => patch({ hairColor: c })} />
        <Text style={t.small}>Eyes</Text>
        <Swatches colors={EYE_COLORS} value={hero.eyeColor} onPick={(c) => patch({ eyeColor: c })} />
      </Card>

      <Card title={`Wardrobe · ${owned.length} of ${lookCatalog.length} looks`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>{owned.map(lookTile)}</View>
        <Text style={t.small}>Looks drop as loot after workouts, or you can buy them in the Shop with coins.</Text>
      </Card>

      <Card title="Art packs">
        <Text style={t.muted}>
          Import a zip of your own character art (a pack.json plus images). Pack looks join the loot pool and the shop and replace the drawn figure when worn.
        </Text>
        {packs.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={t.body}>{p.name} · {p.looks.length} looks</Text>
            <Pressable
              onPress={() =>
                Alert.alert(`Remove ${p.name}?`, 'Its looks leave your wardrobe and the shop.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => deletePack(p.id).catch(fail) },
                ])
              }
            >
              <Text style={{ color: C.bad }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Btn label={busy ? 'Importing…' : 'Import art pack (.zip)'} onPress={pickPack} disabled={busy} secondary />
      </Card>
    </Screen>
  );
}
