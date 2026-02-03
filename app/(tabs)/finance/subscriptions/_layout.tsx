import { Stack, usePathname, useRootNavigationState } from 'expo-router';
import { colors } from '../../../../src/theme/colors';
import { shouldBlockRendering } from '../../../../src/services/oAuthFlowService';

export default function SubscriptionsLayout() {
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const isRootNavReady = Array.isArray(rootState?.routes) && rootState.routes.length > 0;

  if (shouldBlockRendering() || !isRootNavReady || !pathname) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: 'Subscriptions',
        headerBackTitleVisible: true,
      }}
    >
      {/* List: header comes from parent finance stack (same style as Budgets/Transactions) */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="add"
        options={{
          title: 'Add Subscription',
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
    </Stack>
  );
}










