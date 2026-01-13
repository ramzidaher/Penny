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

// Module-level storage for TrueLayer callback URL to prevent route matching
let truelayerCallbackUrl: string | null = null;

export default function RootLayout() {
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
  const [isAppLocked, setIsAppLocked] = useState(false); // Start unlocked, will lock if user is authenticated
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const appWentToBackgroundRef = useRef(false);
  const hasCheckedPINSetup = useRef(false);
  const hasCheckedInitialLock = useRef(false); // Track if we've checked lock on initial load

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
        // Mark OAuth flow as active to prevent lock screen interference
        const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
        setOAuthFlowActive(true);
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
        // Mark OAuth flow as active to prevent lock screen interference
        const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
        setOAuthFlowActive(true);
        // Temporarily unlock if locked to allow OAuth callback handling
        if (isAppLocked) {
          console.log('[RootLayout] Temporarily unlocking app for OAuth callback handling');
          setIsAppLocked(false);
        }
        
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
              // Clear OAuth flow flag after processing - ConnectBankScreen will handle re-locking
              setTimeout(() => {
                setOAuthFlowActive(false);
              }, 2000);
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
              // Clear OAuth flow flag after navigation - ConnectBankScreen will handle re-locking
              setTimeout(() => {
                setOAuthFlowActive(false);
              }, 2000);
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
            // Clear OAuth flow flag after error handling - ConnectBankScreen will handle re-locking
            setTimeout(() => {
              setOAuthFlowActive(false);
            }, 2000);
            return;
          }
        } catch (error) {
          console.error('[RootLayout] Error handling deep link:', error);
          // Clear OAuth flow flag on error
          const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
          setOAuthFlowActive(false);
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
          // Mark OAuth flow as active
          const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
          setOAuthFlowActive(true);
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
          // Mark OAuth flow as active
          const { setOAuthFlowActive } = await import('../src/services/oAuthFlowService');
          setOAuthFlowActive(true);
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
    
    // Reset initial lock check on mount (handles hot reload)
    hasCheckedInitialLock.current = false;
    
    const initialize = async () => {
      await initFirebase();
      
      const auth = getAuth();
      if (auth) {
        const handleAuthStateChange = async (user: User | null) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:313',message:'handleAuthStateChange START',data:{hasUser:!!user,email:user?.email,hasCheckedInitialLock:hasCheckedInitialLock.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.log('Auth state changed:', user ? `User: ${user.email}` : 'User: null');
          
          if (getIsSigningOut() && user !== null) {
            console.log('Ignoring auto-restore during sign out');
            return;
          }
          
          setCurrentUser(user);
          setUser(user);
          setIsAuthReady(true);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:323',message:'setIsAuthReady(true) called',data:{hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          if (user) {
            console.log('[RootLayout] User authenticated:', user.email);
            
            // CRITICAL: Check PIN FIRST (before heavy initialization) for faster lock screen response
            // This prevents login screen flash and ensures lock screen shows immediately
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:339',message:'BEFORE isPINSetupRequired check (EARLY)',data:{hasCheckedInitialLock:hasCheckedInitialLock.current},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.log('[RootLayout] Checking if PIN setup is required (early check)...');
            const requiresPIN = await isPINSetupRequired();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:342',message:'AFTER isPINSetupRequired check (EARLY)',data:{requiresPIN,hasCheckedInitialLock:hasCheckedInitialLock.current},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.log('[RootLayout] PIN setup required:', requiresPIN);
            setPinSetupRequired(requiresPIN);
            hasCheckedPINSetup.current = true;
            
            // CRITICAL FIX: Lock the app on initial load if PIN is set (unless in OAuth flow)
            // Only skip locking if we've already checked initial lock (prevents re-locking after unlock in same session)
            // OR if we're in a TrueLayer OAuth flow (to allow OAuth callback handling)
            const isOAuthFlow = getOAuthFlowActive();
            if (!hasCheckedInitialLock.current && !isOAuthFlow) {
              if (!requiresPIN) {
                // PIN is set - lock the app on app start
                console.log('[RootLayout] PIN is set, locking app on initial load');
                setIsAppLocked(true);
                hasCheckedInitialLock.current = true;
              } else {
                // PIN setup is required - don't lock, let user set up PIN
                console.log('[RootLayout] PIN setup required, not locking app');
                setIsAppLocked(false);
                hasCheckedInitialLock.current = true;
              }
            } else {
              // Already checked initial lock or in OAuth flow - don't change lock state
              if (isOAuthFlow) {
                console.log('[RootLayout] In TrueLayer OAuth flow, skipping lock');
              } else {
                console.log('[RootLayout] Initial lock already checked, keeping current lock state');
              }
            }
            
            // Now do heavy initialization (can happen in parallel or after PIN check)
            await initDatabase();
            await initializeNotifications();
            // Initialize auto-sync for TrueLayer accounts
            await initializeAutoSync();
            
            appWentToBackgroundRef.current = false;
            
            // Mark initialization as complete - safe to render now
            setIsInitializing(false);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:349',message:'handleAuthStateChange END - user authenticated',data:{requiresPIN,hasCheckedInitialLock:hasCheckedInitialLock.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
          } else {
            console.log('User signed out, clearing state');
            // Cleanup auto-sync on logout
            cleanupAutoSync();
            setIsAppLocked(false); // Unlock when no user so login screen can show
            appWentToBackgroundRef.current = false;
            setPinSetupRequired(false);
            hasCheckedPINSetup.current = false;
            hasCheckedInitialLock.current = false; // Reset on logout
            
            // Mark initialization as complete - safe to render login screen now
            setIsInitializing(false);
          }
        };
        
        setAuthStateCallback(handleAuthStateChange);
        unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);
        
        // Check initial user state - onAuthStateChanged will also fire, but we set initial state here
        // for immediate rendering. The lock check will happen in handleAuthStateChange when it fires.
        const initialUser = auth.currentUser;
        console.log('Initial auth state:', initialUser ? `User: ${initialUser.email}` : 'User: null');
        if (initialUser) {
          // Trigger auth state change handler for initial user to ensure lock check happens
          // This handles the case where onAuthStateChanged might not fire immediately
          handleAuthStateChange(initialUser).catch(err => {
            console.error('[RootLayout] Error in initial auth state check:', err);
            setIsInitializing(false); // Ensure initialization completes even on error
          });
        } else {
          // No initial user, just set ready state
          setCurrentUser(null);
          setUser(null);
          setIsAuthReady(true);
          // Unlock app when no user so login screen can show
          setIsAppLocked(false);
          // Mark initialization as complete - safe to render login screen now
          setIsInitializing(false);
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:402',message:'AppState change',data:{previousState,nextAppState,hasUser:!!user,isAuthReady,pinSetupRequired,appWentToBackground:appWentToBackgroundRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Track when app goes to background
      if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
        // App is going to background - lock it if user is logged in (unless in OAuth flow)
        const isOAuthFlow = getOAuthFlowActive();
        if (user && isAuthReady && !isOAuthFlow) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:409',message:'App going to background - BEFORE lock',data:{hasUser:!!user,isAuthReady,isOAuthFlow},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          console.log('[AppLock] App going to background, locking app');
          appWentToBackgroundRef.current = true;
          setIsAppLocked(true);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:412',message:'App going to background - AFTER lock',data:{hasUser:!!user,isAuthReady},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        } else if (isOAuthFlow) {
          console.log('[AppLock] App going to background during OAuth flow, not locking');
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:420',message:'App coming to foreground - BEFORE lock check',data:{appWentToBackground:appWentToBackgroundRef.current,pinSetupRequired,hasUser:!!user,isAuthReady,isOAuthFlow},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // App has come to the foreground - show lock screen if app went to background
        // Only lock if PIN is already set (don't lock during PIN setup or OAuth flow)
        if (appWentToBackgroundRef.current && !pinSetupRequired && !isOAuthFlow) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:425',message:'App coming to foreground - BEFORE setIsAppLocked(true)',data:{appWentToBackground:appWentToBackgroundRef.current,pinSetupRequired},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          console.log('[AppLock] App came to foreground, showing lock screen');
          setIsAppLocked(true);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:427',message:'App coming to foreground - AFTER setIsAppLocked(true)',data:{appWentToBackground:appWentToBackgroundRef.current,pinSetupRequired},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        } else if (isOAuthFlow) {
          console.log('[AppLock] App came to foreground during OAuth flow, not locking');
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:440',message:'Navigation effect START',data:{isAuthReady,fontsLoaded,hasUser:!!user,pinSetupRequired,isAppLocked,segments:segments.join('/')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log('[RootLayout] Navigation effect triggered:', {
      isAuthReady,
      fontsLoaded,
      hasUser: !!user,
      pinSetupRequired,
      isAppLocked,
      segments: segments.join('/')
    });
    
    if (!isAuthReady || !fontsLoaded) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:452',message:'Navigation effect SKIPPED - not ready',data:{isAuthReady,fontsLoaded},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('[RootLayout] Navigation effect skipped - not ready');
      return;
    }

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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:491',message:'Navigation check - BEFORE decision',data:{hasUser:!!user,inAuthGroup,inTabsGroup,pinSetupRequired,isAppLocked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log('[RootLayout] Navigation check:', {
      hasUser: !!user,
      inAuthGroup,
      inTabsGroup,
      pinSetupRequired
    });

    // Navigation rules:
    // 1. If not logged in and not on auth screen → go to login
    // 2. If logged in and on auth screen → go to main app (unless PIN setup required OR app is locked)
    // 3. PIN setup and lock screens are handled by conditional rendering above
    // 4. CRITICAL: Don't navigate if app is locked or PIN setup required - let lock/PIN screens handle it
    
    // If app is locked or PIN setup required, don't navigate - lock/PIN screens will be shown
    if (user && (isAppLocked || pinSetupRequired)) {
      console.log('[RootLayout] App is locked or PIN setup required, skipping navigation');
      return;
    }
    
    if (!user && !inAuthGroup) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:506',message:'Navigation DECISION: navigate to login',data:{hasUser:!!user,inAuthGroup},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('[RootLayout] No user, navigating to login');
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup && !pinSetupRequired && !isAppLocked) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:509',message:'Navigation DECISION: navigate to tabs',data:{hasUser:!!user,inAuthGroup,pinSetupRequired,isAppLocked},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Only navigate away from auth if PIN is set AND app is not locked
      console.log('[RootLayout] User in auth group, PIN set, app unlocked, navigating to tabs');
      router.replace('/(tabs)');
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:513',message:'Navigation DECISION: no navigation',data:{hasUser:!!user,inAuthGroup,pinSetupRequired,isAppLocked},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('[RootLayout] Navigation check complete, no navigation needed');
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:515',message:'Navigation effect END',data:{isAuthReady,fontsLoaded,hasUser:!!user,pinSetupRequired,isAppLocked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  }, [user, segments, isAuthReady, fontsLoaded, router, pinSetupRequired, isAppLocked]);

  // Don't render anything until fonts are loaded, auth is ready, AND initialization is complete
  // This prevents login screen flash and ensures correct screen shows immediately
  if (!fontsLoaded || !isAuthReady || isInitializing) {
    return null;
  }

  // Don't render login screen if we're waiting for auth state to restore (app is locked)
  // OR if user exists (even if lock check is in progress) - prevents login screen flash
  // This prevents the login screen from flashing before lock screen appears
  const shouldShowLogin = !user && !isAppLocked;

  const handleUnlock = () => {
    console.log('[RootLayout] handleUnlock called - unlocking app');
    setIsAppLocked(false);
    appWentToBackgroundRef.current = false; // Reset background flag after successful unlock
    hasCheckedInitialLock.current = true; // Mark as checked so we don't lock again on this session
    console.log('[RootLayout] App unlocked, isAppLocked:', false);
    
    // If user is in auth group after unlock, navigate to tabs
    // This handles the case where user just registered and unlocked
    if (user && segments[0] === '(auth)') {
      console.log('[RootLayout] User unlocked and in auth group, navigating to tabs');
      router.replace('/(tabs)');
    }
  };

  const handlePINSetupComplete = async () => {
    console.log('[RootLayout] handlePINSetupComplete called');
    setPinSetupRequired(false);
    hasCheckedPINSetup.current = true;
    // Don't lock after PIN setup - user should go directly to main app
    setIsAppLocked(false);
    appWentToBackgroundRef.current = false;
    console.log('[RootLayout] PIN setup complete, navigating to main app');
  };

  return (
    <SafeAreaProvider>
      <DialogProvider>
        <ToastProvider>
          <ActionMenuProvider>
          <StatusBar style="dark" />
          {/* PIN Setup Screen - Show if user is logged in but PIN not set */}
          {user && pinSetupRequired && (() => {
            console.log('[RootLayout] Rendering PIN Setup Screen');
            return <PINSetupScreen onComplete={handlePINSetupComplete} />;
          })()}
          {/* Lock Screen - Show if user is logged in, PIN is set, and app is locked */}
          {user && !pinSetupRequired && isAppLocked && (() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:551',message:'RENDERING: App Lock Screen',data:{hasUser:!!user,pinSetupRequired,isAppLocked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            console.log('[RootLayout] Rendering App Lock Screen');
            return <AppLockScreen onUnlock={handleUnlock} />;
          })()}
          {/* Main App - Show if user is logged in, PIN is set, and app is not locked */}
          {/* CRITICAL: Only render Stack when app is NOT locked to prevent login screen flash */}
          {user && !pinSetupRequired && !isAppLocked && (() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:556',message:'RENDERING: Main App Stack',data:{hasUser:!!user,pinSetupRequired,isAppLocked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            console.log('[RootLayout] Rendering Main App Stack');
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
                </Stack>
              </>
            );
          })()}
          {/* Login Screen - Show if user is not logged in AND app is not locked */}
          {/* Don't show login screen if app is locked - wait for auth state to restore */}
          {shouldShowLogin && (() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/_layout.tsx:576',message:'RENDERING: Login Stack',data:{hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            console.log('[RootLayout] Rendering Login Stack (no user)');
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
              </Stack>
            );
          })()}
        </ActionMenuProvider>
      </ToastProvider>
      </DialogProvider>
    </SafeAreaProvider>
  );
}

