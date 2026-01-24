import { Stack, useRouter, usePathname, useRootNavigationState } from 'expo-router';
import { shouldBlockRendering } from '../../src/services/oAuthFlowService';

export default function AuthLayout() {
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}











