import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#18181b',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', headerTitle: 'Papaya' }}
      />
      <Tabs.Screen
        name="claims"
        options={{ title: 'Claims', headerTitle: 'Claims' }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', headerTitle: 'Settings' }}
      />
    </Tabs>
  );
}
