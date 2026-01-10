import { Stack } from 'expo-router';

export default function AddLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'none', // Disable animation to prevent flicker
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Add',
          headerShown: false,
          animation: 'none', // Disable animation for this screen
        }}
      />
    </Stack>
  );
}



