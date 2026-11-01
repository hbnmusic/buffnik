import { Alert, Text, View } from 'react-native';

import { CONFIG, budgetRemainingUsd, checkRedeem, isDollarBacked, priceInCoins } from '@/engine';
import { catalog } from '@/state/service';
import { useGame } from '@/state/GameProvider';
import { usd } from '@/ui/format';
import { Btn, C, Card, Row, Screen, t } from '@/ui/theme';

export default function Shop() {
  const { loaded, purchase } = useGame();
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;
  const { state } = loaded;

  const real = catalog().filter((i) => isDollarBacked(i));
  const utility = catalog().filter((i) => !isDollarBacked(i));

  const confirm = (id: string, name: string, coinCost: number, dollars: number) => {
    const cost = [`${coinCost} coins`, dollars > 0 ? `${usd(dollars)} from this month's budget` : null].filter(Boolean).join(' and ');
    Alert.alert(name, `Spend ${cost}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          const r = await purchase(id);
          Alert.alert(r.ok ? 'Done' : 'Not yet', r.ok ? `${name} is yours. Enjoy it.` : r.reason);
        },
      },
    ]);
  };

  const item = (i: (typeof real)[number]) => {
    const check = checkRedeem(i, state.wallet, state.budget);
    const coinCost = check.ok ? check.coinCost : priceInCoins(i);
    const dollars = isDollarBacked(i) ? (i.priceUsd ?? 0) : 0;
    return (
      <Card key={i.id}>
        <Row left={i.name} right={`${coinCost} coins${dollars ? ` · ${usd(dollars)}` : ''}`} />
        {!check.ok && <Text style={t.small}>{check.reason}</Text>}
        <Btn label="Buy" onPress={() => confirm(i.id, i.name, coinCost, dollars)} disabled={!check.ok} secondary />
      </Card>
    );
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

      <Text style={t.h2}>Treats</Text>
      <View style={{ gap: 12 }}>{real.map(item)}</View>
      <Text style={t.h2}>Utilities</Text>
      <View style={{ gap: 12 }}>{utility.map(item)}</View>
    </Screen>
  );
}
