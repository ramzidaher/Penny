import { useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { getCurrentUser } from '../src/services/firebase';

/**
 * Catch-all route handler for unmatched routes
 * This prevents "Unmatched Route" errors from showing to users
 * and handles TrueLayer callback URLs that might slip through
 * IMPORTANT: This redirects immediately without showing any UI
 */
export default function NotFound() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Prevent multiple redirects
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    
    // First, check if we have callback params in the route (fastest check)
    if (params.code || params.error) {
      console.log('[NotFound] Callback params detected in route, redirecting immediately');
      router.replace({
        pathname: '/(tabs)/finance/connect-bank' as any,
        params: params.code ? { code: params.code as string } : { error: params.error as string },
      });
      return;
    }
    
    // Check if this is a TrueLayer callback that wasn't handled
    const checkCallback = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url && (url.includes('truelayer-callback') || url.includes('penny://truelayer-callback'))) {
          console.log('[NotFound] TrueLayer callback detected, redirecting immediately to connect-bank');
          
          // Extract params and redirect immediately
          const parsedUrl = Linking.parse(url);
          const code = parsedUrl.queryParams?.code as string;
          const error = parsedUrl.queryParams?.error as string;
          
          if (code || error) {
            // Redirect immediately - no delay
            router.replace({
              pathname: '/(tabs)/finance/connect-bank' as any,
              params: code ? { code } : { error },
            });
            return;
          }
        }
      } catch (err) {
        console.error('[NotFound] Error checking callback:', err);
      }
      
      // Check current segments to determine where to redirect
      const user = getCurrentUser();
      
      // Redirect immediately - no delay
      if (user) {
        // User is logged in, redirect to tabs
        router.replace('/(tabs)' as any);
      } else {
        // User not logged in, redirect to login
        router.replace('/(auth)/login' as any);
      }
    };

    // Run immediately - don't wait
    checkCallback();
  }, [router, params]);

  // Return null IMMEDIATELY to prevent any UI from showing
  // The redirect happens in useEffect above
  return null;
}

