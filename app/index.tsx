import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { getCurrentUser } from '../src/services/firebase';
import { useEffect, useState, useRef } from 'react';
import * as Linking from 'expo-linking';

/**
 * Root index page - required for Android to prevent "Unmatched Route" errors
 * This handles the root route (/) and redirects based on auth state
 * Also checks for TrueLayer callback URLs immediately to prevent route errors
 */
export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useLocalSearchParams();
  const hasCheckedUrl = useRef(false);

  useEffect(() => {
    // Check for initial URL immediately - this runs before Expo Router processes it
    const checkInitialUrl = async () => {
      if (hasCheckedUrl.current) return;
      hasCheckedUrl.current = true;
      
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          // If it's a TrueLayer callback, redirect immediately to prevent route matching
          if (url.includes('truelayer-callback') || url.includes('penny://truelayer-callback')) {
            console.log('[Index] TrueLayer callback detected, redirecting immediately');
            const parsedUrl = Linking.parse(url);
            const code = parsedUrl.queryParams?.code as string;
            const error = parsedUrl.queryParams?.error as string;
            
            if (code || error) {
              // Redirect immediately using requestAnimationFrame
              requestAnimationFrame(() => {
                router.replace({
                  pathname: '/(tabs)/finance/connect-bank' as any,
                  params: code ? { code } : { error },
                });
              });
              return;
            }
          }
        }
      } catch (error) {
        console.error('[Index] Error checking initial URL:', error);
      }
    };

    // Get current user to determine redirect
    const checkUser = () => {
      const currentUser = getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };

    // Run both checks
    checkInitialUrl();
    checkUser();
  }, [router]);

  // Check if we have callback params (in case they were passed via route)
  useEffect(() => {
    if (params.code || params.error) {
      console.log('[Index] Callback params detected, redirecting to connect-bank');
      // Redirect to connect-bank with params immediately
      requestAnimationFrame(() => {
        router.replace({
          pathname: '/(tabs)/finance/connect-bank' as any,
          params: params.code ? { code: params.code as string } : { error: params.error as string },
        });
      });
      return;
    }
  }, [params, router]);

  // Show nothing while loading - _layout.tsx will handle navigation
  if (loading) {
    return null;
  }

  // Redirect based on auth state
  // Note: The actual navigation is handled in _layout.tsx navigation effect
  // This is just to satisfy Android's requirement for an index route
  if (user) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/(auth)/login" />;
  }
}

