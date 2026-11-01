import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { GameProvider } from '@/state/GameProvider';

export default function RootLayout() {
  return (
    <GameProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#14121F' },
          headerTintColor: '#F4F1FF',
          contentStyle: { backgroundColor: '#14121F' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="import-strong" options={{ title: 'Import from Strong' }} />
        <Stack.Screen name="log-workout" options={{ title: 'Log a workout' }} />
        <Stack.Screen name="log-weight" options={{ title: 'Log your weight' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Data sources' }} />
      </Stack>
    </GameProvider>
  );
}
