import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/colors';

export default function SubscriptionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: '',
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ headerShown: false }} 
      />
      <Stack.Screen name="add" options={{ title: 'Add Subscription' }} />
    </Stack>
  );
}

