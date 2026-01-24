import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initFirebase, onAuthStateChanged, getAuth, setCurrentUser, setAuthStateCallback, getIsSigningOut, logoutUser } from '../src/services/firebase';
import { initDatabase } from '../src/database/db';
import { initializeNotifications } from '../src/services/notifications';
import { initializeAutoSync, cleanupAutoSync } from '../src/services/autoSyncService';
import { ActionMenuProvider } from '../src/contexts/ActionMenuContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DialogProvider } from '../src/contexts/DialogContext';
import { isPINSetupRequired } from '../src/services/pinEnforcement';
import AppLockScreen from '../src/components/AppLockScreen';
import PINSetupScreen from '../src/components/PINSetupScreen';
import { getOAuthFlowActive } from '../src/services/oAuthFlowService';
import type { User } from 'firebase/auth';

// NOTE: TrueLayer callback is handled by `app/truelayer-callback.tsx` (a real route).
// RootLayout should avoid storing/redirecting callback URLs to prevent double-navigation.

function RootLayoutInner() {
  // Font loading kept for future use but not blocking app
  // When ready to use, uncomment the font below
  const [fontsLoaded] = useFonts({
    'Gulfs Display': require('../assets/fonts/GulfsDisplay-Normal.ttf'), // Used in AI screen title
    'GulfsDisplay-Normal': require('../assets/fonts/GulfsDisplay-Normal.ttf'), // PostScript name alternative
  });
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true); // Track initialization to prevent premature rendering
  const [user, setUser] = useState<User | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);
  const [isAppLocked, setIsAppLocked] = useState(true); // Start locked optimistically - will unlock if no user or PIN setup required
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const [lockStateDetermined, setLockStateDetermined] = useState(false); // Track if we've determined lock state
  const appWentToBackgroundRef = useRef(false);
  const hasCheckedPINSetup = useRef(false);
  const hasCheckedInitialLock = useRef(false); // Track if we've checked lock on initial load
  const authStateChangedFired = useRef(false); // Track if onAuthStateChanged has fired at least once

  // Handle deep links for TrueLayer OAuth callback.
  // RootLayout should NOT navigate/redirect on callback URLs (double redirects can crash React Navigation).
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
      
      // CRITICAL: If OAuth flow just started (WebBrowser opened), ignore non-callback URLs
      // This prevents reload when WebBrowser opens
      const { getOAuthFlowActive } = await import('../src/services/oAuthFlowService');
      const isOAuthFlow = getOAuthFlowActive();
      const isTrueLayerCallback = url.includes('truelayer-callback') || 
                                  (url.startsWith('penny://') && url.includes('truelayer-callback')) ||
                                  url.includes('auth.truelayer.com/redirect');
      
      // If OAuth flow is active but this is NOT a TrueLayer callback, ignore it
      // This prevents processing of other deep links that might cause reload
      if (isOAuthFlow && !isTrueLayerCallback) {
        console.log('[RootLayout] OAuth flow active, ignoring non-callback deep link:', url);
        return;
      }
      
      // Handle TrueLayer redirect URL (https://auth.truelayer.com/redirect?token=...)
      // This is an intermediate redirect that should eventually go to penny://truelayer-callback
      if (url.includes('auth.truelayer.com/redirect')) {
        // Mark OAuth flow as active to prevent lock screen interference
        const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
        setOAuthFlowActive(true);
        // WebBrowser should handle this automatically, but if it doesn't, we can extract the code
        try {
          const parsedUrl = Linking.parse(url);
          const token = parsedUrl.queryParams?.token as string;
          
          // Let the browser continue; we expect to receive the final `penny://truelayer-callback?...` deep link.
          // We do not perform any navigation here.
          return;
        } catch (error) {
          console.error('[RootLayout] Error handling redirect URL:', error);
        }
        // If we can't extract the code, let WebBrowser handle it
        return;
      }
      
      // Handle direct TrueLayer callback (penny://truelayer-callback)
      if (url.includes('truelayer-callback') || (url.startsWith('penny://') && url.includes('truelayer-callback'))) {
        console.log('[RootLayout] Received TrueLayer callback deep link:', url);
        console.log('[RootLayout] Platform:', Platform.OS);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:callback',message:'RootLayout received callback deep link',data:{platform:Platform.OS},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        // Mark OAuth flow as active to prevent lock screen interference
        const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
        setOAuthFlowActive(true);
        // Temporarily unlock if locked to allow OAuth callback handling
        if (isAppLocked) {
          console.log('[RootLayout] Temporarily unlocking app for OAuth callback');
          setIsAppLocked(false);
        }
        
        try {
          const parsedUrl = Linking.parse(url);
          const code = parsedUrl.queryParams?.code as string;
          const error = parsedUrl.queryParams?.error as string;
          const state = parsedUrl.queryParams?.state as string;

          console.log('[RootLayout] Parsed OAuth callback:', { hasCode: !!code, hasError: !!error, hasState: !!state });

          // Do NOT navigate here. The callback is routed to `app/truelayer-callback.tsx`,
          // which forwards params into the Connect Bank screen safely.
          // Keep OAuth flow flag active; ConnectBankScreen will clear it after processing.
          return;
        } catch (error) {
          console.error('[RootLayout] Error handling deep link:', error);
          // Clear OAuth flow flag on error
          const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
          setOAuthFlowActive(false);
        }
      }
    };

    // Handle initial URL - check if it's a TrueLayer callback or redirect.
    // We no longer perform any router navigation here (the callback is a real route).
    // Run this immediately, don't wait for dependencies.
    (async () => {
      try {
        // CRITICAL: Check if OAuth flow is active - if so, don't process initial URL
        // This prevents reload when WebBrowser opens
        const { getOAuthFlowActive } = await import('../src/services/oAuthFlowService');
        if (getOAuthFlowActive()) {
          console.log('[RootLayout] OAuth flow active, skipping initial URL check to prevent reload');
          return;
        }
        
        const url = await Linking.getInitialURL();
        if (!url) return;
        
        // Only process TrueLayer callbacks - ignore other URLs during potential OAuth flow
        const isTrueLayerCallback = url.includes('truelayer-callback') || 
                                   (url.startsWith('penny://') && url.includes('truelayer-callback')) ||
                                   url.includes('auth.truelayer.com/redirect');
        
        if (!isTrueLayerCallback) {
          // Not a TrueLayer callback, process normally
          handleDeepLink({ url });
          return;
        }
        
        // Handle TrueLayer redirect URL
        if (url.includes('auth.truelayer.com/redirect')) {
          // Mark OAuth flow as active
          const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
          setOAuthFlowActive(true);
          // Do not attempt to parse/navigate on the intermediate redirect URL.
          // We expect the flow to continue and eventually deep link back with `penny://truelayer-callback?...`,
          // which is handled by `app/truelayer-callback.tsx`.
          return;
        }
        
        // Handle direct TrueLayer callback
        if (url.includes('truelayer-callback') || (url.startsWith('penny://') && url.includes('truelayer-callback'))) {
          console.log('[RootLayout] Received initial TrueLayer callback URL:', url);
          console.log('[RootLayout] Platform:', Platform.OS);
          // Mark OAuth flow as active
          const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
          setOAuthFlowActive(true);
          // No navigation here — router will load `app/truelayer-callback.tsx`.
        }
      } catch (error) {
        console.error('[RootLayout] Error getting initial URL:', error);
      }
    })();

    // Handle deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      // CRITICAL: Check OAuth flow before processing any deep link
      // This prevents reload when WebBrowser opens
      (async () => {
        const { getOAuthFlowActive } = await import('../src/services/oAuthFlowService');
        const isOAuthFlow = getOAuthFlowActive();
        const isTrueLayerCallback = event.url.includes('truelayer-callback') || 
                                    (event.url.startsWith('penny://') && event.url.includes('truelayer-callback')) ||
                                    event.url.includes('auth.truelayer.com/redirect');
        
        // If OAuth flow is active but this is NOT a TrueLayer callback, ignore it
        // This prevents processing of other deep links that might cause reload
        if (isOAuthFlow && !isTrueLayerCallback) {
          console.log('[RootLayout] OAuth flow active, ignoring non-callback deep link event:', event.url);
          return;
        }
        
        // Process the deep link
        handleDeepLink(event);
      })();
    });

    return () => {
      subscription.remove();
    };
  }, [user, router, isAuthReady]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    // Reset initial lock check on mount (handles hot reload)
    hasCheckedInitialLock.current = false;
    setLockStateDetermined(false); // Reset lock state determination
    authStateChangedFired.current = false; // Reset auth state change flag
    
    const initialize = async () => {
      await initFirebase();
      
      const auth = getAuth();
      if (auth) {
        const handleAuthStateChange = async (user: User | null) => {
          if (getIsSigningOut() && user !== null) {
            return;
          }
          
          // Mark that auth state change has fired at least once
          // This is used to prevent showing login screen prematurely on app start
          authStateChangedFired.current = true;
          
          setCurrentUser(user);
          setUser(user);
          setIsAuthReady(true);
          
          if (user) {
            // CRITICAL: Check PIN FIRST (before heavy initialization) for faster lock screen response
            // This prevents login screen flash and ensures lock screen shows immediately
            const requiresPIN = await isPINSetupRequired();
            setPinSetupRequired(requiresPIN);
            hasCheckedPINSetup.current = true;
            
            // CRITICAL FIX: Lock the app on initial load if PIN is set (unless in OAuth flow)
            // Only skip locking if we've already checked initial lock (prevents re-locking after unlock in same session)
            // OR if we're in a TrueLayer OAuth flow (to allow OAuth callback handling)
            const isOAuthFlow = getOAuthFlowActive();
            if (!hasCheckedInitialLock.current && !isOAuthFlow) {
              if (!requiresPIN) {
                // PIN is set - lock the app on app start
                setIsAppLocked(true);
                hasCheckedInitialLock.current = true;
              } else {
                // PIN setup is required - don't lock, let user set up PIN
                setIsAppLocked(false);
                hasCheckedInitialLock.current = true;
              }
            }
            
            // Mark lock state as determined - safe to render now
            setLockStateDetermined(true);
            
            // Now do heavy initialization (can happen in parallel or after PIN check)
            // Don't block rendering on these - they can happen in background
            Promise.all([
              initDatabase(),
              initializeNotifications(),
              initializeAutoSync(),
            ]).catch(err => {
              console.error('[RootLayout] Error in background initialization:', err);
            });
            
            appWentToBackgroundRef.current = false;
            
            // Mark initialization as complete - safe to render now
            setIsInitializing(false);
          } else {
            // Cleanup auto-sync on logout
            cleanupAutoSync();
            setIsAppLocked(false); // Unlock when no user so login screen can show
            appWentToBackgroundRef.current = false;
            setPinSetupRequired(false);
            hasCheckedPINSetup.current = false;
            hasCheckedInitialLock.current = false; // Reset on logout
            setLockStateDetermined(true); // Mark lock state as determined
            
            // Mark initialization as complete - safe to render login screen now
            setIsInitializing(false);
          }
        };
        
        setAuthStateCallback(handleAuthStateChange);
        unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);
        
        // Check initial user state - onAuthStateChanged will also fire, but we set initial state here
        // for immediate rendering. The lock check will happen in handleAuthStateChange when it fires.
        const initialUser = auth.currentUser;
        if (initialUser) {
          // Trigger auth state change handler for initial user to ensure lock check happens
          // This handles the case where onAuthStateChanged might not fire immediately
          handleAuthStateChange(initialUser).catch(err => {
            console.error('[RootLayout] Error in initial auth state check:', err);
            setIsInitializing(false); // Ensure initialization completes even on error
            setLockStateDetermined(true); // Mark lock state as determined even on error
          });
        } else {
          // No initial user - wait for onAuthStateChanged to fire before showing login screen
          // This prevents login screen flash when Firebase is still restoring auth state
          // On Android, auth state restoration can be slower, so we need more robust handling
          setIsAuthReady(true);
          
          // CRITICAL: Set lockStateDetermined to true after a short delay to allow rendering
          // But keep user as null until onAuthStateChanged confirms it
          // This prevents the app from being stuck in loading state
          const setInitialState = () => {
            // Only set if auth state change hasn't fired yet (meaning no user was found)
            if (!authStateChangedFired.current) {
              setCurrentUser(null);
              setUser(null);
              setIsAppLocked(false);
              setLockStateDetermined(true);
              setIsInitializing(false);
            }
          };
          
          // On Android, Firebase auth state restoration from AsyncStorage can be delayed
          // We'll check auth.currentUser again after a short delay as a fallback
          if (Platform.OS === 'android') {
            // Give Firebase time to restore auth state from AsyncStorage
            // Check multiple times to catch delayed restoration
            const checkAuthState = async (attempt: number, maxAttempts: number = 5) => {
              if (authStateChangedFired.current) {
                // Auth state change already fired, no need to check
                return;
              }
              
              // Wait progressively longer for each attempt
              const delay = Math.min(200 * attempt, 1000);
              await new Promise(resolve => setTimeout(resolve, delay));
              
              // Re-check auth.currentUser (it might have been restored from AsyncStorage)
              const restoredUser = auth.currentUser;
              if (restoredUser && !authStateChangedFired.current) {
                console.log('[RootLayout] Android: Found restored user after delay, triggering auth state change');
                // Manually trigger auth state change handler
                handleAuthStateChange(restoredUser).catch(err => {
                  console.error('[RootLayout] Error in restored user check:', err);
                });
                return;
              }
              
              // If we haven't found a user and haven't reached max attempts, try again
              if (attempt < maxAttempts && !authStateChangedFired.current) {
                checkAuthState(attempt + 1, maxAttempts);
              } else if (!authStateChangedFired.current) {
                // After all attempts, if auth state change still hasn't fired, show login screen
                console.log('[RootLayout] Android: No user found after all attempts, showing login screen');
                setInitialState();
              }
            };
            
            // Start checking after a short initial delay
            setTimeout(() => {
              checkAuthState(1);
            }, 100);
            
            // Fallback: Set state after max time (2 seconds) to prevent infinite loading
            setTimeout(() => {
              if (!authStateChangedFired.current) {
                console.log('[RootLayout] Android: Timeout reached, showing login screen');
                setInitialState();
              }
            }, 2000);
          } else {
            // On iOS/web, use simpler timeout fallback
            setTimeout(() => {
              // Only show login if auth state change hasn't fired yet (shouldn't happen normally)
              if (!authStateChangedFired.current) {
                console.warn('[RootLayout] onAuthStateChanged did not fire, showing login screen as fallback');
                setInitialState();
              }
            }, 500); // Shorter timeout for iOS/web since it's usually faster
          }
          // Note: handleAuthStateChange will be called by onAuthStateChanged and will handle the login screen
        }
      } else {
        setIsAuthReady(true);
        setIsInitializing(false); // No auth available, safe to render
      }
    };
    
    initialize();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // REMOVED: Auto-login biometric check
  // Banking apps don't auto-login on app start - they show lock screen
  // Lock screen handles biometric unlock (not full login)
  // This prevents security conflicts and follows banking app patterns

  // Handle app state changes for app lock
  useEffect(() => {
      const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      const previousState = appState.current;
      
      // Track when app goes to background
      if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
        // App is going to background - lock it if user is logged in (unless in OAuth flow)
        const isOAuthFlow = getOAuthFlowActive();
        if (user && isAuthReady && !isOAuthFlow) {
          appWentToBackgroundRef.current = true;
          setIsAppLocked(true);
        }
      }
      
      // Handle app coming to foreground
      if (
        previousState.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user &&
        isAuthReady
      ) {
        const isOAuthFlow = getOAuthFlowActive();
        // App has come to the foreground - show lock screen if app went to background
        // Only lock if PIN is already set (don't lock during PIN setup or OAuth flow)
        if (appWentToBackgroundRef.current && !pinSetupRequired && !isOAuthFlow) {
          setIsAppLocked(true);
        }
      }
      
      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, [user, isAuthReady, pinSetupRequired]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!isAuthReady || !fontsLoaded || !lockStateDetermined) {
      return;
    }

    // CRITICAL: Don't interfere with navigation during OAuth flow
    // This prevents auto-refresh when OAuth callback comes back or when WebBrowser opens
    const isOAuthFlow = getOAuthFlowActive();
    if (isOAuthFlow) {
      console.log('[RootLayout] OAuth flow active, skipping navigation logic to prevent reload');
      return;
    }

    // TrueLayer callback navigation is handled by `app/truelayer-callback.tsx`.

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const isOnConnectBank = segments.includes('connect-bank');
    const isOnAccounts = segments.includes('accounts');

    // Navigation rules:
    // 1. If not logged in and not on auth screen → go to login
    // 2. If logged in and on auth screen → go to main app (unless PIN setup required OR app is locked)
    // 3. PIN setup and lock screens are handled by conditional rendering above
    // 4. CRITICAL: Don't navigate if app is locked or PIN setup required - let lock/PIN screens handle it
    // 5. CRITICAL: Don't navigate away from connect-bank screen during OAuth flow
    
    // If app is locked or PIN setup required, don't navigate - lock/PIN screens will be shown
    if (user && (isAppLocked || pinSetupRequired)) {
      return;
    }
    
    // Don't navigate away from connect-bank screen (OAuth might be in progress)
    if (user && isOnConnectBank) {
      console.log('[RootLayout] 🚫 Skipping navigation - user on connect-bank screen (OAuth in progress)');
      return;
    }
    
    // Don't navigate away from accounts screen if OAuth flow is still active
    // This prevents navigation loops when OAuth completes and navigates to accounts
    if (user && isOnAccounts) {
      const recentOAuthFlow = getOAuthFlowActive();
      if (recentOAuthFlow) {
        console.log('[RootLayout] 🚫 Skipping navigation - on accounts screen after OAuth flow (preventing screen switching)');
        return;
      }
    }
    
    // Note: OAuth flow check already done at line 671, no need to check again here
    
    if (!user && !inAuthGroup) {
      console.log('[RootLayout] 🔵 Navigating to login - user not logged in');
      router.replace('/(auth)/login' as any);
    } else if (user && inAuthGroup && !pinSetupRequired && !isAppLocked) {
      // Only navigate away from auth if PIN is set AND app is not locked
      console.log('[RootLayout] 🟢 Navigating to tabs - user logged in and on auth screen');
      router.replace('/(tabs)' as any);
    }
  }, [user, segments, isAuthReady, fontsLoaded, router, pinSetupRequired, isAppLocked, lockStateDetermined]);

  // Don't render anything until fonts are loaded, auth is ready, initialization is complete,
  // AND lock state is determined. This prevents login screen flash and ensures correct screen shows immediately
  if (!fontsLoaded || !isAuthReady || isInitializing || !lockStateDetermined) {
    return null;
  }

  // Don't render login screen if we're waiting for auth state to restore (app is locked)
  // OR if user exists (even if lock check is in progress) - prevents login screen flash
  // This prevents the login screen from flashing before lock screen appears
  const shouldShowLogin = !user && !isAppLocked;

  const handleUnlock = async () => {
    setIsAppLocked(false);
    appWentToBackgroundRef.current = false; // Reset background flag after successful unlock
    hasCheckedInitialLock.current = true; // Mark as checked so we don't lock again on this session
    
    // TrueLayer callback navigation is handled by `app/truelayer-callback.tsx`.
    
    // If user is in auth group after unlock, navigate to tabs
    // This handles the case where user just registered and unlocked
    if (user && segments[0] === '(auth)') {
      router.replace('/(tabs)');
    }
  };

  const handlePINSetupComplete = async () => {
    setPinSetupRequired(false);
    hasCheckedPINSetup.current = true;
    // Don't lock after PIN setup - user should go directly to main app
    setIsAppLocked(false);
    appWentToBackgroundRef.current = false;
  };

  return (
    <SafeAreaProvider>
      <DialogProvider>
        <ToastProvider>
          <ActionMenuProvider>
          <StatusBar style="dark" />
          {/* PIN Setup Screen - Show if user is logged in but PIN not set */}
          {user && pinSetupRequired && <PINSetupScreen onComplete={handlePINSetupComplete} />}
          {/* Lock Screen - Show if user is logged in, PIN is set, and app is locked */}
          {user && !pinSetupRequired && isAppLocked && <AppLockScreen onUnlock={handleUnlock} />}
          {/* Main App - Show if user is logged in, PIN is set, and app is not locked */}
          {/* CRITICAL: Only render Stack when app is NOT locked to prevent login screen flash */}
          {user && !pinSetupRequired && !isAppLocked && (() => {
            return (
              <>
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
                  <Stack.Screen 
                    name="settings" 
                    options={{ 
                      headerShown: false
                    }} 
                  />
                  <Stack.Screen 
                    name="help" 
                    options={{ 
                      headerShown: false
                    }} 
                  />
                  <Stack.Screen 
                    name="about" 
                    options={{ 
                      headerShown: false
                    }} 
                  />
                </Stack>
              </>
            );
          })()}
          {/* Login Screen - Show if user is not logged in AND app is not locked */}
          {/* Don't show login screen if app is locked - wait for auth state to restore */}
          {shouldShowLogin && (() => {
            return (
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
                <Stack.Screen 
                  name="settings" 
                  options={{ 
                    headerShown: false
                  }} 
                />
                <Stack.Screen 
                  name="help" 
                  options={{ 
                    headerShown: false
                  }} 
                />
                <Stack.Screen 
                  name="about" 
                  options={{ 
                    headerShown: false
                  }} 
                />
              </Stack>
            );
          })()}
        </ActionMenuProvider>
      </ToastProvider>
      </DialogProvider>
    </SafeAreaProvider>
  );
}

export default RootLayoutInner;


// Lock screen now shows directly without login screen flash
// Initialization is optimized to check PIN status early and render lock screen immediately