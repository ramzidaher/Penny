import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform } from 'react-native';

/**
 * TrueLayer OAuth callback route.
 *
 * For custom-scheme URLs like `penny://truelayer-callback?code=...&state=...`,
 * the host (`truelayer-callback`) is treated like the first path segment by Expo Router,
 * so this file ensures the callback is a *real* route (not +not-found).
 *
 * We then forward the params into the Connect Bank screen.
 */
export default function TrueLayerCallbackRoute() {
  const router = useRouter();
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    // Use rAF to avoid dispatching navigation actions in the same tick as route hydration.
    requestAnimationFrame(() => {
      // Small platform-specific buffer helps Android avoid transient nav-state issues on deep-link return.
      const delayMs = Platform.OS === 'android' ? 50 : 0;
      setTimeout(() => {
        router.replace({
          pathname: '/connect-bank' as any,
          params: code
            ? { code: code as string, ...(state ? { state: state as string } : {}) }
            : error
              ? { error: error as string }
              : {},
        });
      }, delayMs);
    });
  }, [code, error, router, state]);

  return null;
}

