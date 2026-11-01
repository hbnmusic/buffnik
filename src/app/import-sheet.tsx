import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from 'react-native';

import { listWarnings, parseSheetList, planSheetPack } from '@/data/sheet/plan';
import { DEFAULT_SLICE, sliceSheet, type Piece, type SliceResult } from '@/data/sheet/slicer';
import { loadSheetImage, pieceKey, writePreviews } from '@/data/sheetImport';
import { useGame } from '@/state/GameProvider';
import { Btn, C, Card, Chip, inputStyle, Screen, t } from '@/ui/theme';

const SENSITIVITY = [
  { label: 'Strict', tolerance: 28 },
  { label: 'Normal', tolerance: DEFAULT_SLICE.tolerance },
  { label: 'Loose', tolerance: 60 },
];
const MERGE = [
  { label: 'Split more', gap: 0.003 },
  { label: 'Normal', gap: DEFAULT_SLICE.mergeGap },
  { label: 'Merge more', gap: 0.02 },
];

const slugPack = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);

export default function ImportSheet() {
  const { loaded, importSheet, pendingImage, setPendingImage } = useGame();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [listText, setListText] = useState('');
  const [packName, setPackName] = useState('');
  const [addTo, setAddTo] = useState<string | null>(null); // existing pack id
  const [hasCharacter, setHasCharacter] = useState(true);
  const [sens, setSens] = useState(1);
  const [merge, setMerge] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SliceResult | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const run = useRef(0);

  useEffect(() => {
    if (pendingImage) {
      setImageUri(pendingImage);
      setImageName('Shared image');
      setPendingImage(null);
    }
  }, [pendingImage, setPendingImage]);

  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;
  const existing = loaded.packs.find((p) => p.id === addTo);
  const list = parseSheetList(listText);
  const fail = (title: string, e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));

  const choose = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      setImageUri(res.assets[0].uri);
      setImageName(res.assets[0].name);
      setResult(null);
    } catch (e) {
      fail('Could not open that image', e);
    }
  };

  const cut = async () => {
    if (!imageUri) return;
    setBusy(true);
    setResult(null);
    try {
      await new Promise((r) => setTimeout(r, 50)); // let the spinner draw before the heavy work
      const img = await loadSheetImage(imageUri);
      await new Promise((r) => setTimeout(r, 20));
      const r = sliceSheet(img, { tolerance: SENSITIVITY[sens].tolerance, mergeGap: MERGE[merge].gap, hasCharacter });
      run.current += 1;
      setPreviews(writePreviews(r.pieces, run.current));
      setRemoved(new Set());
      setResult(r);
    } catch (e) {
      fail('Could not cut the sheet', e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (p: Piece) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      const k = pieceKey(p);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const doImport = async () => {
    if (!result) return;
    const name = existing?.name ?? packName.trim();
    if (!name) return Alert.alert('Name the pack', 'Enter a name for the new pack, or choose a pack to add to.');
    const packId = existing?.id ?? (slugPack(name) || 'sheet-pack');
    if (!existing && loaded.packs.some((p) => p.id === packId)) {
      return Alert.alert('That name is taken', 'A pack with that name exists. Pick it under "Add to a pack", or use a different name.');
    }
    const plan = planSheetPack(result.pieces, {
      packId,
      packName: name,
      list,
      existing,
      skipCharacter: removed.has('character'),
      skipItems: result.pieces.filter((p) => p.kind === 'item' && removed.has(pieceKey(p))).map((p) => p.number),
      skipOutfits: result.pieces.filter((p) => p.kind === 'outfit' && removed.has(pieceKey(p))).map((p) => p.outfit),
    });
    if (!plan.ok) return Alert.alert('Cannot import', plan.errors.join('\n'));
    setBusy(true);
    try {
      await importSheet(plan.plan, false);
      const a = plan.plan.added;
      Alert.alert('Imported', `${a.character ? 'Base character, ' : ''}${a.outfits} outfits and ${a.items} items added to ${name}.${a.character ? ' A character slot now wears the base character.' : ''}`);
      setResult(null);
      setImageUri(null);
    } catch (e) {
      fail('Import failed', e);
    } finally {
      setBusy(false);
    }
  };

  const items = result?.pieces.filter((p) => p.kind === 'item') ?? [];
  const warnings = result ? [...result.warnings, ...listWarnings(list, result.pieces)] : [];
  const kept = result ? result.pieces.filter((p) => !removed.has(pieceKey(p))).length : 0;

  const tile = (p: Piece) => {
    const k = pieceKey(p);
    const listed = p.kind === 'item' ? list.items.find((i) => i.number === p.number) : p.kind === 'outfit' ? list.outfits[p.outfit - 1] : undefined;
    const label = p.kind === 'character' ? list.character ?? 'Character' : (listed?.name ?? (p.kind === 'item' ? `Item ${p.number}` : `Outfit ${p.outfit}`));
    const off = removed.has(k);
    return (
      <Pressable key={k} onPress={() => toggle(p)} style={{ width: '31%', alignItems: 'center', gap: 4, opacity: off ? 0.3 : 1 }}>
        <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#2A2540', borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Image source={{ uri: previews[k] }} style={{ width: '88%', height: '88%' }} resizeMode="contain" />
          {off ? <Text style={{ position: 'absolute', color: C.bad, fontSize: 40, fontWeight: '700' }}>×</Text> : null}
        </View>
        <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center' }} numberOfLines={2}>
          {p.kind === 'item' ? `${p.number}. ` : ''}
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Card title="1. Sheet image">
        <Text style={t.muted}>The image Gemini made, using the prompt in docs/gemini-sheet-prompt.md. You can also share the image to Buffnik from Gemini or your gallery.</Text>
        <Btn label={imageUri ? 'Choose a different image' : 'Choose image'} onPress={choose} secondary />
        {imageUri ? <Text style={t.small}>Selected: {imageName}</Text> : null}
      </Card>

      <Card title="2. Pack">
        <Text style={t.small}>Add to a pack</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="New pack" selected={addTo === null} onPress={() => { setAddTo(null); setHasCharacter(true); }} />
          {loaded.packs.map((p) => (
            <Chip key={p.id} label={p.name} selected={addTo === p.id} onPress={() => { setAddTo(p.id); setHasCharacter(false); }} />
          ))}
        </View>
        {addTo === null ? (
          <TextInput style={inputStyle} value={packName} onChangeText={setPackName} placeholder="Pack name, for example the character's name" placeholderTextColor={C.faint} maxLength={40} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Chip label="Sheet has the character on top" selected={hasCharacter} onPress={() => setHasCharacter(true)} />
          <Chip label="Items only" selected={!hasCharacter} onPress={() => setHasCharacter(false)} />
        </View>
      </Card>

      <Card title="3. List from Gemini (optional)">
        <Text style={t.muted}>Paste the numbered list Gemini wrote after the image. It names the items and sets their slot and rarity.</Text>
        <TextInput
          style={[inputStyle, { minHeight: 120, textAlignVertical: 'top' }]}
          value={listText}
          onChangeText={setListText}
          multiline
          placeholder={'CHARACTER | Name\nOUTFIT | Name | rare\n1 | Black Blindfold | face | rare'}
          placeholderTextColor={C.faint}
        />
        <Text style={t.small}>{list.items.length} items, {list.outfits.length} outfits read from the list.</Text>
      </Card>

      <Card title="4. Cut the sheet">
        <Text style={t.small}>Background detection</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {SENSITIVITY.map((o, i) => (
            <Chip key={o.label} label={o.label} selected={sens === i} onPress={() => setSens(i)} />
          ))}
        </View>
        <Text style={t.small}>Joining nearby parts</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {MERGE.map((o, i) => (
            <Chip key={o.label} label={o.label} selected={merge === i} onPress={() => setMerge(i)} />
          ))}
        </View>
        <Btn label={busy ? 'Working…' : result ? 'Cut again with these settings' : 'Cut the sheet'} onPress={cut} disabled={!imageUri || busy} />
        {busy ? <ActivityIndicator color={C.accentSoft} /> : null}
        <Text style={t.small}>If items are split in two, use Merge more. If separate items are stuck together, use Split more. If the background leaves specks, use Loose; if parts of items vanish, use Strict.</Text>
      </Card>

      {result ? (
        <Card title={`Preview: ${result.pieces.length} pieces found`}>
          {warnings.map((w) => (
            <Text key={w} style={t.error}>{w}</Text>
          ))}
          <Text style={t.small}>Tap a piece to leave it out (for example a stray mark). Items keep their list number.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            {result.pieces.filter((p) => p.kind !== 'item').map(tile)}
            {items.map(tile)}
          </View>
          <Btn label={`Import ${kept} pieces`} onPress={doImport} disabled={busy || kept === 0} />
        </Card>
      ) : null}
    </Screen>
  );
}
