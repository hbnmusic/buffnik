import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { CONFIG, budgetRemainingUsd, checkRedeem, isDollarBacked, itemCoinPrice, priceInCoins, GEAR_SLOTS, type Look, type ShopItem } from '@/engine';
import { activeCharacter } from '@/state/characters';
import { useGame } from '@/state/GameProvider';
import { CharacterView, ItemIcon } from '@/ui/CharacterView';
import { shortDate, usd } from '@/ui/format';
import { Btn, C, Card, Chip, Row, Screen, t } from '@/ui/theme';

export default function Shop() {
  const { loaded, purchase, purchaseLook, refreshSteamWishlist } = useGame();
  const [steamBusy, setSteamBusy] = useState(false);
  const [gearFilter, setGearFilter] = useState<'all' | (typeof GEAR_SLOTS)[number]>('all');
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;
  const { state, shopItems, steam, lookCatalog, ownedLookIds, characters } = loaded;

  const treats = shopItems.filter((i) => i.kind === 'real' || i.kind === 'vault');
  const games = shopItems.filter((i) => i.kind === 'steam');
  const utility = shopItems.filter((i) => !isDollarBacked(i));
  const hero = activeCharacter(characters);
  const locked = lookCatalog.filter((l) => !ownedLookIds.includes(l.id));
  const lockedLooks = locked.filter((l) => !l.slot);
  const lockedGear = locked.filter((l) => l.slot && (gearFilter === 'all' || l.slot === gearFilter));
  const gearTotal = locked.filter((l) => l.slot).length;

  const confirm = (name: string, coinCost: number, dollars: number, buyIt: () => Promise<{ ok: boolean; reason?: string }>) => {
    const cost = [`${coinCost} coins`, dollars > 0 ? `${usd(dollars)} from this month's budget` : null].filter(Boolean).join(' and ');
    Alert.alert(name, `Spend ${cost}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          const r = await buyIt();
          Alert.alert(r.ok ? 'Done' : 'Not yet', r.ok ? `${name} is yours. Enjoy it.` : (r.reason ?? 'Something went wrong.'));
        },
      },
    ]);
  };

  const item = (i: ShopItem, note?: string) => {
    const check = checkRedeem(i, state.wallet, state.budget);
    const coinCost = check.ok ? check.coinCost : priceInCoins(i);
    const dollars = isDollarBacked(i) ? (i.priceUsd ?? 0) : 0;
    return (
      <Card key={i.id}>
        <Row left={i.name} right={`${coinCost} coins${dollars ? ` · ${usd(dollars)}` : ''}`} />
        {note ? <Text style={t.small}>{note}</Text> : null}
        {!check.ok && <Text style={t.small}>{check.reason}</Text>}
        <Btn label="Buy" onPress={() => confirm(i.name, coinCost, dollars, () => purchase(i.id))} disabled={!check.ok} secondary />
      </Card>
    );
  };

  const gearRow = (l: Look) => {
    const price = itemCoinPrice(l);
    return (
      <Card key={l.id}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ItemIcon look={l} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={t.body}>{l.name}</Text>
            <Text style={t.small}>{l.slot} · {l.rarity}</Text>
          </View>
          <View style={{ width: 120 }}>
            <Btn label={`${price} coins`} onPress={() => confirm(l.name, price, 0, () => purchaseLook(l.id))} disabled={state.coins < price} secondary />
          </View>
        </View>
      </Card>
    );
  };

  const lookCard = (l: Look) => {
    const price = itemCoinPrice(l);
    return (
      <Card key={l.id}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <CharacterView character={hero} look={l} tier={state.buildTier} width={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={t.body}>{l.name}</Text>
            <Text style={t.small}>{l.rarity}</Text>
            <Btn label={`Buy · ${price} coins`} onPress={() => confirm(l.name, price, 0, () => purchaseLook(l.id))} disabled={state.coins < price} secondary />
          </View>
        </View>
      </Card>
    );
  };

  const refreshSteam = async () => {
    setSteamBusy(true);
    try {
      await refreshSteamWishlist();
    } finally {
      setSteamBusy(false);
    }
  };

  return (
    <Screen>
      <Card title="Your treat budget">
        <Row left="Left this month" right={`${usd(budgetRemainingUsd(state.budget))} of ${usd(CONFIG.economy.monthlyBudgetUsd)}`} rightColor={C.good} />
        <Row left="Vault" right={`${usd(state.budget.vaultUsd)} (cap ${usd(CONFIG.economy.vaultCapUsd)})`} />
        <Row left="Coins" right={state.coins.toLocaleString()} rightColor={C.gold} />
        {state.wallet.vouchersUsd.length > 0 && <Row left="Vouchers" right={state.wallet.vouchersUsd.map(usd).join(', ')} />}
        <Text style={t.small}>
          {CONFIG.economy.coinsPerUsd} coins = $1. Unspent budget rolls into the vault each month. Buying here records the treat; you still pay for it yourself.
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={t.h2}>Treats</Text>
        <Text style={{ color: C.accentSoft, fontWeight: '600' }} onPress={() => router.push('/edit-shop')}>Edit list</Text>
      </View>
      <View style={{ gap: 12 }}>{treats.map((i) => item(i, i.kind === 'vault' ? 'Big-ticket: can also draw on the vault.' : undefined))}</View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={t.h2}>Steam wishlist</Text>
      </View>
      <Card>
        <Text style={t.muted}>
          {steam
            ? `${games.length} games priced · updated ${shortDate(steam.fetchedAt.slice(0, 10))}${steam.unpriced ? ` · ${steam.unpriced} unpriced (free or unreleased)` : ''}`
            : 'Pull your wishlist and current prices from Steam. Your profile and game details must be public.'}
        </Text>
        {steam?.problem ? <Text style={t.error}>{steam.problem}</Text> : null}
        <Btn label={steamBusy ? 'Checking Steam…' : steam ? 'Refresh prices' : 'Load my wishlist'} onPress={refreshSteam} disabled={steamBusy} secondary />
      </Card>
      <View style={{ gap: 12 }}>
        {games.map((i) => {
          const g = steam?.games.find((x) => `steam:${x.appid}` === i.id);
          return item(i, g && g.discountPct > 0 ? `${g.discountPct}% off (was ${usd(g.listUsd)})` : undefined);
        })}
      </View>

      <Text style={t.h2}>Outfits</Text>
      <Text style={t.small}>Full looks for your character. They also drop as loot.</Text>
      <View style={{ gap: 12 }}>{lockedLooks.length === 0 ? <Text style={t.muted}>You own every look.</Text> : lockedLooks.map(lookCard)}</View>

      {gearTotal > 0 && (
        <>
          <Text style={t.h2}>Gear</Text>
          <Text style={t.small}>Items your character wears, from your art packs. {gearTotal} left to unlock.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="All" selected={gearFilter === 'all'} onPress={() => setGearFilter('all')} />
            {GEAR_SLOTS.map((s) => (
              <Chip key={s} label={s} selected={gearFilter === s} onPress={() => setGearFilter(s)} />
            ))}
          </View>
          <View style={{ gap: 10 }}>{lockedGear.map(gearRow)}</View>
        </>
      )}

      <Text style={t.h2}>Utilities</Text>
      <View style={{ gap: 12 }}>{utility.map((i) => item(i))}</View>
    </Screen>
  );
}
