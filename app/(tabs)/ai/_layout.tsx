import { Stack } from 'expo-router';

export default function AdvisorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="receipt-split" />
    </Stack>
  );
}

