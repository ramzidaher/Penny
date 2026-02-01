import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initFirebase, onAuthStateChanged, getAuth, setCurrentUser, setAuthStateCallback, getIsSigningOut, logoutUser } from '../src/services/firebase';
import { initDatabase } from '../src/database/db';
import { initializeNotifications } from '../src/services/notifications';
// NOTE: TrueLayer auto-sync removed (manual-only mode).
import { ActionMenuProvider } from '../src/contexts/ActionMenuContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DialogProvider } from '../src/contexts/DialogContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { isPINSetupRequired } from '../src/services/pinEnforcement';
import AppLockScreen from '../src/components/AppLockScreen';
import { getOAuthFlowActive } from '../src/services/oAuthFlowService';
import { initPurchases } from '../src/services/subscriptionService';
import type { User } from 'firebase/auth';

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
  const [isPinSet, setIsPinSet] = useState(false);
  const [lockStateDetermined, setLockStateDetermined] = useState(false); // Track if we've determined lock state
  const appWentToBackgroundRef = useRef(false);
  const hasCheckedInitialLock = useRef(false); // Track if we've checked lock on initial load
  const authStateChangedFired = useRef(false); // Track if onAuthStateChanged has fired at least once

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
            initPurchases(user.uid).catch((error) => {
              console.warn('[RootLayout] RevenueCat init failed:', error);
            });
            // CRITICAL: Check PIN FIRST (before heavy initialization) for faster lock screen response
            // This prevents login screen flash and ensures lock screen shows immediately
            const requiresPIN = await isPINSetupRequired();
            const pinIsSet = !requiresPIN;
            setIsPinSet(pinIsSet);
            
            // CRITICAL FIX: Lock the app on initial load if PIN is set (unless in OAuth flow)
            // Only skip locking if we've already checked initial lock (prevents re-locking after unlock in same session)
            // OR if we're in an OAuth flow (to allow callback handling)
            const isOAuthFlow = getOAuthFlowActive();
            if (!hasCheckedInitialLock.current && !isOAuthFlow) {
              if (pinIsSet) {
                // PIN is set - lock the app on app start
                setIsAppLocked(true);
                hasCheckedInitialLock.current = true;
              } else {
                // No PIN set - don't lock
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
            ]).catch(err => {
              console.error('[RootLayout] Error in background initialization:', err);
            });
            
            appWentToBackgroundRef.current = false;
            
            // Mark initialization as complete - safe to render now
            setIsInitializing(false);
          } else {
            initPurchases(undefined).catch((error) => {
              console.warn('[RootLayout] RevenueCat sign-out failed:', error);
            });
            setIsAppLocked(false); // Unlock when no user so login screen can show
            appWentToBackgroundRef.current = false;
            setIsPinSet(false);
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
        if (appWentToBackgroundRef.current && isPinSet && !isOAuthFlow) {
          setIsAppLocked(true);
        }
      }
      
      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, [user, isAuthReady, isPinSet]);

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

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    // Navigation rules:
    // 1. If not logged in and not on auth screen → go to login
    // 2. If logged in and on auth screen → go to main app (unless app is locked)
    // 3. Lock screen is handled by conditional rendering above
    // 4. CRITICAL: Don't navigate if app is locked - lock screen will be shown
    if (user && isAppLocked) {
      return;
    }
    // Note: OAuth flow check already done above, no need to check again here
    
    if (!user && !inAuthGroup) {
      console.log('[RootLayout] 🔵 Navigating to login - user not logged in');
      router.replace('/(auth)/login' as any);
    } else if (user && inAuthGroup && !isAppLocked) {
      // Only navigate away from auth if app is not locked
      console.log('[RootLayout] 🟢 Navigating to tabs - user logged in and on auth screen');
      router.replace('/(tabs)' as any);
    }
  }, [user, segments, isAuthReady, fontsLoaded, router, isAppLocked, lockStateDetermined]);

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

    // If user is in auth group after unlock, navigate to tabs
    // This handles the case where user just registered and unlocked
    if (user && segments[0] === '(auth)') {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DialogProvider>
          <ToastProvider>
            <ActionMenuProvider>
            <StatusBar style="dark" />
            {/* Lock Screen - Show if user is logged in, PIN is set, and app is locked */}
            {user && isPinSet && isAppLocked && <AppLockScreen onUnlock={handleUnlock} />}
            {/* Main App - Show if user is logged in and app is not locked */}
            {/* CRITICAL: Only render Stack when app is NOT locked to prevent login screen flash */}
            {user && !isAppLocked && (() => {
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
                    <Stack.Screen 
                      name="feature-request" 
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
                  <Stack.Screen 
                    name="feature-request" 
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
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default RootLayoutInner;


// Lock screen now shows directly without login screen flash
// Initialization is optimized to check PIN status early and render lock screen immediately