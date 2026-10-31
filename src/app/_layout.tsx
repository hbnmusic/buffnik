import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#14121F' },
          headerTintColor: '#F4F1FF',
          contentStyle: { backgroundColor: '#14121F' },
        }}
      />
    </>
  );
}
