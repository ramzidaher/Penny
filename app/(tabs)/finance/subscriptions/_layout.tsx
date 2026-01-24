import { Stack, useRouter, usePathname, useRootNavigationState } from 'expo-router';
import { colors } from '../../../../src/theme/colors';
import { shouldBlockRendering } from '../../../../src/services/oAuthFlowService';

export default function SubscriptionsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const isRootNavReady = Array.isArray(rootState?.routes) && rootState.routes.length > 0;

  // Guard: Don't render Stack if router state isn't ready
  // This prevents the "Cannot read property 'filter' of undefined" error
  // CRITICAL: If OAuth flow is active OR navigation is transitioning, don't render
  if (shouldBlockRendering() || !isRootNavReady || !router || !pathname) {
    // During OAuth flow or navigation transition, router state is transitioning
    // and state.routes is undefined - don't render Stack at all
    return null;
  }

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










