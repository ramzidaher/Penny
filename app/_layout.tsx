import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initFirebase, onAuthStateChanged, getAuth, setCurrentUser, setAuthStateCallback, getIsSigningOut, waitForFirebase, logoutUser } from '../src/services/firebase';
import { initDatabase } from '../src/database/db';
import { initializeNotifications } from '../src/services/notifications';
import { initializeAutoSync, cleanupAutoSync } from '../src/services/autoSyncService';
import { ActionMenuProvider } from '../src/contexts/ActionMenuContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { getSettings } from '../src/services/settingsService';
import { performBiometricLogin, hasBiometricCredentials, isBiometricAvailable } from '../src/services/biometricService';
import LoadingScreen from '../src/components/LoadingScreen';
import type { User } from 'firebase/auth';

// Module-level storage for TrueLayer callback URL to prevent route matching
let truelayerCallbackUrl: string | null = null;

export default function RootLayout() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:12',message:'RootLayout entry - Expo Router active',data:{entryPoint:'expo-router/entry'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Font loading kept for future use but not blocking app
  // When ready to use, uncomment the font below
  const [fontsLoaded] = useFonts({
    'Gulfs Display': require('../assets/fonts/GulfsDisplay-Normal.ttf'), // Used in AI screen title
    'GulfsDisplay-Normal': require('../assets/fonts/GulfsDisplay-Normal.ttf'), // PostScript name alternative
  });
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);
  const biometricPromptedRef = useRef(false);
  const hasCheckedInitialBiometric = useRef(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:20',message:'RootLayout segments and router initialized',data:{segments:segments,hasRouter:!!router},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [segments, router]);
  // #endregion

  // Handle deep links for TrueLayer OAuth callback
  // We need to prevent Expo Router from trying to route penny://truelayer-callback URLs
  useEffect(() => {
    // Track processed codes to prevent duplicate navigation
    const processedCodes = new Set<string>();
    
    // Helper to decode base64 (React Native compatible)
    const base64Decode = (str: string): string => {
      // Replace URL-safe characters
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      while (str.length % 4) {
        str += '=';
      }
      // Use Buffer for Node.js/React Native
      try {
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(str, 'base64').toString('utf-8');
        }
        // Fallback for environments without Buffer
        if (typeof atob !== 'undefined') {
          return atob(str);
        }
        // Manual base64 decode as last resort
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        for (let i = 0; i < str.length; i += 4) {
          const enc1 = chars.indexOf(str.charAt(i));
          const enc2 = chars.indexOf(str.charAt(i + 1));
          const enc3 = chars.indexOf(str.charAt(i + 2));
          const enc4 = chars.indexOf(str.charAt(i + 3));
          const chr1 = (enc1 << 2) | (enc2 >> 4);
          const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          const chr3 = ((enc3 & 3) << 6) | enc4;
          output += String.fromCharCode(chr1);
          if (enc3 !== 64) output += String.fromCharCode(chr2);
          if (enc4 !== 64) output += String.fromCharCode(chr3);
        }
        return output;
      } catch (error) {
        console.error('[RootLayout] Base64 decode error:', error);
        throw error;
      }
    };

    // Helper to extract code from JWT token (if needed for redirect URLs)
    const extractCodeFromToken = (token: string): string | null => {
      try {
        // JWT has 3 parts separated by dots: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        // Decode the payload (second part)
        const decoded = base64Decode(parts[1]);
        const payload = JSON.parse(decoded);
        
        // The code might be in jti or code field
        if (payload.jti && payload.jti.includes('code=')) {
          const codeMatch = payload.jti.match(/code=([^&]+)/);
          if (codeMatch) {
            return decodeURIComponent(codeMatch[1]);
          }
        }
        return payload.code || null;
      } catch (error) {
        console.error('[RootLayout] Error extracting code from token:', error);
        return null;
      }
    };

    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;
      
      if (!url) return;
      
      // Handle TrueLayer redirect URL (https://auth.truelayer.com/redirect?token=...)
      // This is an intermediate redirect that should eventually go to penny://truelayer-callback
      if (url.includes('auth.truelayer.com/redirect')) {
        console.log('[RootLayout] TrueLayer redirect URL detected, WebBrowser should handle this');
        // WebBrowser should handle this automatically, but if it doesn't, we can extract the code
        try {
          const parsedUrl = Linking.parse(url);
          const token = parsedUrl.queryParams?.token as string;
          
          if (token) {
            const code = extractCodeFromToken(token);
            if (code) {
              console.log('[RootLayout] Extracted code from redirect token');
              // Store for navigation after auth is ready
              truelayerCallbackUrl = `penny://truelayer-callback?code=${code}`;
              return;
            }
          }
        } catch (error) {
          console.error('[RootLayout] Error handling redirect URL:', error);
        }
        // If we can't extract the code, let WebBrowser handle it
        return;
      }
      
      // Handle direct TrueLayer callback (penny://truelayer-callback)
      if (url.includes('truelayer-callback') || (url.startsWith('penny://') && url.includes('truelayer-callback'))) {
        try {
          const parsedUrl = Linking.parse(url);
          const code = parsedUrl.queryParams?.code as string;
          const error = parsedUrl.queryParams?.error as string;

          console.log('[RootLayout] Deep link received (TrueLayer callback):', { url, code: !!code, error: !!error });

          // For codes, add a delay to give WebBrowser time to process first
          // WebBrowser.openAuthSessionAsync should handle it directly, this is a fallback
          if (code) {
            // Check if we've already processed this code
            if (processedCodes.has(code)) {
              console.log('[RootLayout] Code already processed, ignoring duplicate deep link');
              return;
            }
            
            // Mark as processed
            processedCodes.add(code);
            
            console.log('[RootLayout] OAuth callback received with code, waiting for WebBrowser...');
            // Wait 1.5 seconds to give WebBrowser.openAuthSessionAsync time to process first
            // If WebBrowser handled it, ConnectBankScreen will ignore this via processedCodesGlobal
            setTimeout(() => {
              if (user && isAuthReady) {
                console.log('[RootLayout] Navigating to ConnectBank with code (fallback)');
                // Note: ConnectBankScreen will check processedCodesGlobal and ignore if already processed
                router.replace({
                  pathname: '/(tabs)/finance/connect-bank' as any,
                  params: { code: code },
                });
              }
            }, 1500); // 1.5 second delay to let WebBrowser process first
            return;
          }

          if (error) {
            console.error('[RootLayout] TrueLayer OAuth error:', error);
            if (user && isAuthReady) {
              // For errors, navigate immediately (no WebBrowser processing)
              router.replace({
                pathname: '/(tabs)/finance/connect-bank' as any,
                params: { error: error },
              });
            }
            return;
          }
        } catch (error) {
          console.error('[RootLayout] Error handling deep link:', error);
        }
      }
    };

    // Handle initial URL - check if it's a TrueLayer callback or redirect and handle it BEFORE routing
    // On Android, this is critical - we need to intercept before Expo Router tries to match the route
    // Run this immediately, don't wait for dependencies
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) return;
        
        console.log('[RootLayout] Initial URL detected:', url);
        
        // Handle TrueLayer redirect URL
        if (url.includes('auth.truelayer.com/redirect')) {
          console.log('[RootLayout] Initial URL is TrueLayer redirect, extracting code');
          try {
            const parsedUrl = Linking.parse(url);
            const token = parsedUrl.queryParams?.token as string;
            
            if (token) {
              // Extract code from JWT token
              const code = extractCodeFromToken(token);
              if (code) {
                console.log('[RootLayout] Extracted code from redirect token, storing for navigation');
                truelayerCallbackUrl = `penny://truelayer-callback?code=${code}`;
                // On Android, try to navigate immediately if possible to prevent route error
                if (Platform.OS === 'android' && isAuthReady && user) {
                  // Use requestAnimationFrame for immediate navigation
                  requestAnimationFrame(() => {
                    router.replace({
                      pathname: '/(tabs)/finance/connect-bank' as any,
                      params: { code: code },
                    });
                  });
                }
                return;
              }
            }
          } catch (error) {
            console.error('[RootLayout] Error handling redirect URL:', error);
          }
          // If we can't extract, let WebBrowser handle it
          return;
        }
        
        // Handle direct TrueLayer callback
        if (url.includes('truelayer-callback') || (url.startsWith('penny://') && url.includes('truelayer-callback'))) {
          console.log('[RootLayout] Initial URL is TrueLayer callback, storing for later navigation:', url);
          // Store the URL to handle after auth is ready
          // We'll navigate in the navigation effect below to prevent route matching
          truelayerCallbackUrl = url;
          // On Android, try to navigate immediately if possible to prevent route error
          if (Platform.OS === 'android' && isAuthReady && user) {
            try {
              const parsedUrl = Linking.parse(url);
              const code = parsedUrl.queryParams?.code as string;
              const error = parsedUrl.queryParams?.error as string;
              
              // Use requestAnimationFrame for immediate navigation
              requestAnimationFrame(() => {
                if (code) {
                  router.replace({
                    pathname: '/(tabs)/finance/connect-bank' as any,
                    params: { code: code },
                  });
                } else if (error) {
                  router.replace({
                    pathname: '/(tabs)/finance/connect-bank' as any,
                    params: { error: error },
                  });
                }
              });
            } catch (err) {
              console.error('[RootLayout] Error in immediate Android navigation:', err);
            }
          }
        } else {
          console.log('[RootLayout] Initial URL on app start:', url);
          handleDeepLink({ url });
        }
      } catch (error) {
        console.error('[RootLayout] Error getting initial URL:', error);
      }
    })();

    // Handle deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[RootLayout] Deep link event received:', event.url);
      handleDeepLink(event);
    });

    return () => {
      subscription.remove();
    };
  }, [user, router, isAuthReady]);

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
            // Initialize auto-sync for TrueLayer accounts
            await initializeAutoSync();
          } else {
            console.log('User signed out, clearing state');
            // Cleanup auto-sync on logout
            cleanupAutoSync();
            biometricPromptedRef.current = false;
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

  // Check biometric on initial app load (for app restart after being killed)
  useEffect(() => {
    if (!isAuthReady || !user || hasCheckedInitialBiometric.current) return;
    
    const checkInitialBiometric = async () => {
      hasCheckedInitialBiometric.current = true;
      try {
        await waitForFirebase();
        const settings = await getSettings();
        const biometricAvailable = await isBiometricAvailable();
        const hasCredentials = await hasBiometricCredentials();
        
        // Only prompt if biometric is enabled, available, and credentials exist
        // This handles the case where app was killed and restarted with persisted session
        if (
          settings.enableBiometric &&
          biometricAvailable &&
          hasCredentials &&
          !biometricPromptedRef.current
        ) {
          biometricPromptedRef.current = true;
          
          // Delay to let app fully initialize
          setTimeout(async () => {
            try {
              await performBiometricLogin();
            } catch (error: any) {
              // If biometric fails (not cancelled), sign out user for security
              if (error.message && !error.message.includes('cancelled') && !error.message.includes('Authentication cancelled')) {
                console.error('Biometric authentication failed on app start, signing out:', error);
                try {
                  await logoutUser();
                } catch (logoutError) {
                  console.error('Error signing out after biometric failure:', logoutError);
                }
              }
            } finally {
              biometricPromptedRef.current = false;
            }
          }, 1500);
        }
      } catch (error) {
        console.error('Error checking biometric on app start:', error);
        biometricPromptedRef.current = false;
      }
    };
    
    checkInitialBiometric();
  }, [isAuthReady, user]);

  // Handle app state changes for biometric authentication
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user &&
        isAuthReady
      ) {
        // App has come to the foreground
        try {
          await waitForFirebase();
          const settings = await getSettings();
          const biometricAvailable = await isBiometricAvailable();
          const hasCredentials = await hasBiometricCredentials();
          
          // Only prompt if biometric is enabled, available, and credentials exist
          if (
            settings.enableBiometric &&
            biometricAvailable &&
            hasCredentials &&
            !biometricPromptedRef.current
          ) {
            biometricPromptedRef.current = true;
            
            // Small delay to ensure app is fully active
            setTimeout(async () => {
              try {
                await performBiometricLogin();
              } catch (error: any) {
                // If biometric fails (not cancelled), sign out user for security
                if (error.message && !error.message.includes('cancelled') && !error.message.includes('Authentication cancelled')) {
                  console.error('Biometric authentication failed on app resume, signing out:', error);
                  try {
                    await logoutUser();
                  } catch (logoutError) {
                    console.error('Error signing out after biometric failure:', logoutError);
                  }
                }
              } finally {
                biometricPromptedRef.current = false;
              }
            }, 300);
          }
        } catch (error) {
          console.error('Error checking biometric on app resume:', error);
          biometricPromptedRef.current = false;
        }
      }
      
      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, [user, isAuthReady]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!isAuthReady || !fontsLoaded) return;

    // Check if we have a stored TrueLayer callback URL to handle first
    // This prevents Expo Router from trying to match the route
    if (truelayerCallbackUrl && user) {
      console.log('[RootLayout] Handling stored TrueLayer callback URL to prevent route error');
      const storedUrl = truelayerCallbackUrl;
      truelayerCallbackUrl = null; // Clear it immediately
      
      try {
        const parsedUrl = Linking.parse(storedUrl);
        const code = parsedUrl.queryParams?.code as string;
        const error = parsedUrl.queryParams?.error as string;
        
        // Navigate immediately to prevent route matching
        // Use a very short delay to ensure router is ready, especially on Android
        const navigateDelay = Platform.OS === 'android' ? 50 : 0;
        
        setTimeout(() => {
          if (code) {
            router.replace({
              pathname: '/(tabs)/finance/connect-bank' as any,
              params: { code: code },
            });
          } else if (error) {
            router.replace({
              pathname: '/(tabs)/finance/connect-bank' as any,
              params: { error: error },
            });
          }
        }, navigateDelay);
        
        return; // Don't process normal navigation
      } catch (err) {
        console.error('[RootLayout] Error handling stored callback URL:', err);
      }
    }

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, segments, isAuthReady, fontsLoaded, router]);

  if (!fontsLoaded || !isAuthReady) {
    return showLoadingScreen ? (
      <LoadingScreen onFinish={() => setShowLoadingScreen(false)} />
    ) : null;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <ActionMenuProvider>
          <StatusBar style="dark" />
          {showLoadingScreen && (
            <LoadingScreen onFinish={() => setShowLoadingScreen(false)} />
          )}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen 
              name="profile" 
              options={{ 
                headerShown: false
              }} 
            />
          </Stack>
        </ActionMenuProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

