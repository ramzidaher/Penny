import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Plaid Hosted Link completion callback route.
 *
 * Hosted Link will open the configured `completion_redirect_uri` (custom scheme)
 * when the session finishes (success or exit). The public_token is obtained via
 * `/link/token/get`, so this route only returns the user to the Connect Bank screen.
 */
export default function PlaidCallbackRoute() {
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    requestAnimationFrame(() => {
      const delayMs = Platform.OS === 'android' ? 50 : 0;
      setTimeout(() => {
        router.replace('/connect-bank' as any);
      }, delayMs);
    });
  }, [router]);

  return null;
}

