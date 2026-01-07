import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initFirebase, onAuthStateChanged, getAuth, setCurrentUser, setAuthStateCallback, getIsSigningOut } from '../src/services/firebase';
import { initDatabase } from '../src/database/db';
import { initializeNotifications } from '../src/services/notifications';
import type { User } from 'firebase/auth';

export default function RootLayout() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:12',message:'RootLayout entry - Expo Router active',data:{entryPoint:'expo-router/entry'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Font loading kept for future use but not blocking app
  // When ready to use, uncomment the font below
  const [fontsLoaded] = useFonts({
    // 'Gulfs Display': require('../assets/fonts/GulfsDisplay-Normal.ttf'), // Kept for future use
  });
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const segments = useSegments();
  const router = useRouter();
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:20',message:'RootLayout segments and router initialized',data:{segments:segments,hasRouter:!!router},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [segments, router]);
  // #endregion

  // Handle deep links for TrueLayer OAuth callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;
      
      if (url.includes('truelayer-callback') || url.includes('penny://')) {
        try {
          const parsedUrl = Linking.parse(url);
          const code = parsedUrl.queryParams?.code as string;
          const error = parsedUrl.queryParams?.error as string;

          console.log('Deep link received:', { url, code: !!code, error: !!error });

          if (error) {
            console.error('TrueLayer OAuth error:', error);
            if (user) {
              setTimeout(() => {
                router.push({
                  pathname: '/finance/connect-bank' as any,
                  params: { error: error },
                });
              }, 100);
            }
            return;
          }

          if (code) {
            console.log('TrueLayer OAuth callback received with code');
            if (user) {
              setTimeout(() => {
                router.push({
                  pathname: '/finance/connect-bank' as any,
                  params: { code: code },
                });
              }, 100);
            }
          }
        } catch (error) {
          console.error('Error handling deep link:', error);
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL on app start:', url);
        handleDeepLink({ url });
      }
    }).catch((error) => {
      console.error('Error getting initial URL:', error);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link event received:', event.url);
      handleDeepLink(event);
    });

    return () => {
      subscription.remove();
    };
  }, [user, router]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    const initialize = async () => {
      await initFirebase();
      
      const auth = getAuth();
      if (auth) {
        const handleAuthStateChange = async (user: User | null) => {
          console.log('Auth state changed:', user ? `User: ${user.email}` : 'User: null');
          
          if (getIsSigningOut() && user !== null) {
            console.log('Ignoring auto-restore during sign out');
            return;
          }
          
          setCurrentUser(user);
          setUser(user);
          setIsAuthReady(true);
          
          if (user) {
            await initDatabase();
            await initializeNotifications();
          } else {
            console.log('User signed out, clearing state');
          }
        };
        
        setAuthStateCallback(handleAuthStateChange);
        unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);
        
        const initialUser = auth.currentUser;
        console.log('Initial auth state:', initialUser ? `User: ${initialUser.email}` : 'User: null');
        setCurrentUser(initialUser);
        setUser(initialUser);
        setIsAuthReady(true);
      } else {
        setIsAuthReady(true);
      }
    };
    
    initialize();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!isAuthReady || !fontsLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, segments, isAuthReady, fontsLoaded, router]);

  if (!fontsLoaded || !isAuthReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}

