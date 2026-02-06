import { useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getCurrentUser } from '../src/services/firebase';

/**
 * Catch-all route handler for unmatched routes
 * This prevents "Unmatched Route" errors from showing to users
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
    
    // Generic redirect for unmatched routes.
    const redirect = async () => {
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
    redirect();
  }, [router, params]);

  // Return null IMMEDIATELY to prevent any UI from showing
  // The redirect happens in useEffect above
  return null;
}

