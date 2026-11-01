import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#14121F' },
        headerTintColor: '#F4F1FF',
        sceneStyle: { backgroundColor: '#14121F' },
        tabBarStyle: { backgroundColor: '#1C1930', borderTopColor: '#221E35' },
        tabBarActiveTintColor: '#B9A7FF',
        tabBarInactiveTintColor: '#8E88AD',
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts', tabBarLabel: 'Workouts' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarLabel: 'Shop' }} />
      <Tabs.Screen name="bosses" options={{ title: 'Bosses', tabBarLabel: 'Bosses' }} />
    </Tabs>
  );
}
