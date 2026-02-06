import { useEffect, useState, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import {
  initFirebase,
  onAuthStateChanged,
  getAuth,
  setCurrentUser,
  setAuthStateCallback,
  getIsSigningOut,
  logoutUser,
  refreshAccountDeletionStatus,
} from '../services/firebase';
import { initDatabase } from '../database/db';
import { initializeNotifications } from '../services/notifications';
import { isPINSetupRequired } from '../services/pinEnforcement';
import { getOAuthFlowActive } from '../services/oAuthFlowService';
import { initPurchases } from '../services/subscriptionService';
import type { User } from 'firebase/auth';

const PIN_CHECK_TIMEOUT_MS = 8000;

export interface UseAuthAndLockResult {
  user: User | null;
  isAuthReady: boolean;
  isInitializing: boolean;
  isAppLocked: boolean;
  isPinSet: boolean;
  lockStateDetermined: boolean;
  handleUnlock: () => void;
  refreshPinState: () => Promise<void>;
}

export function useAuthAndLock(): UseAuthAndLockResult {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAppLocked, setIsAppLocked] = useState(true);
  const [isPinSet, setIsPinSet] = useState(false);
  const [lockStateDetermined, setLockStateDetermined] = useState(false);

  const appState = useRef(AppState.currentState);
  const appWentToBackgroundRef = useRef(false);
  const hasCheckedInitialLock = useRef(false);
  const authStateChangedFired = useRef(false);

  // Auth subscription and initialization
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    hasCheckedInitialLock.current = false;
    setLockStateDetermined(false);
    authStateChangedFired.current = false;

    const initialize = async () => {
      await initFirebase();

      const auth = getAuth();
      if (auth) {
        const handleAuthStateChange = async (user: User | null) => {
          if (getIsSigningOut() && user !== null) {
            return;
          }

          authStateChangedFired.current = true;
          setCurrentUser(user);
          setUser(user);
          setIsAuthReady(true);

          if (user) {
            const deletionStatus = await refreshAccountDeletionStatus();
            if (deletionStatus.status !== 'active') {
              await logoutUser();
              return;
            }
            initPurchases(user.uid).catch((error) => {
              console.warn('[useAuthAndLock] RevenueCat init failed:', error);
            });

            // Ensure Firestore is ready before reading PIN (avoids false "no PIN" on new device / cold start)
            await initDatabase();

            const pinCheckWithTimeout = Promise.race([
              isPINSetupRequired(),
              new Promise<boolean>((resolve) =>
                setTimeout(() => {
                  console.warn('[useAuthAndLock] PIN check timed out, requiring PIN setup');
                  resolve(true);
                }, PIN_CHECK_TIMEOUT_MS)
              ),
            ]);
            const requiresPIN = await pinCheckWithTimeout;
            const pinIsSet = !requiresPIN;
            setIsPinSet(pinIsSet);

            const isOAuthFlow = getOAuthFlowActive();
            if (!hasCheckedInitialLock.current && !isOAuthFlow) {
              if (pinIsSet) {
                setIsAppLocked(true);
                hasCheckedInitialLock.current = true;
              } else {
                setIsAppLocked(false);
                hasCheckedInitialLock.current = true;
              }
            }

            setLockStateDetermined(true);

            initializeNotifications().catch((err) => {
              console.error('[useAuthAndLock] Error in notifications initialization:', err);
            });

            appWentToBackgroundRef.current = false;
            setIsInitializing(false);
          } else {
            initPurchases(undefined).catch((error) => {
              console.warn('[useAuthAndLock] RevenueCat sign-out failed:', error);
            });
            setIsAppLocked(false);
            appWentToBackgroundRef.current = false;
            setIsPinSet(false);
            hasCheckedInitialLock.current = false;
            setLockStateDetermined(true);
            setIsInitializing(false);
          }
        };

        setAuthStateCallback(handleAuthStateChange);
        unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);

        const initialUser = auth.currentUser;
        if (initialUser) {
          handleAuthStateChange(initialUser).catch((err) => {
            console.error('[useAuthAndLock] Error in initial auth state check:', err);
            setIsInitializing(false);
            setLockStateDetermined(true);
          });
        } else {
          setIsAuthReady(true);

          const setInitialState = () => {
            if (!authStateChangedFired.current) {
              setCurrentUser(null);
              setUser(null);
              setIsAppLocked(false);
              setLockStateDetermined(true);
              setIsInitializing(false);
            }
          };

          if (Platform.OS === 'android') {
            const checkAuthState = async (attempt: number, maxAttempts: number = 5) => {
              if (authStateChangedFired.current) return;
              const delay = Math.min(200 * attempt, 1000);
              await new Promise((resolve) => setTimeout(resolve, delay));
              const restoredUser = auth.currentUser;
              if (restoredUser && !authStateChangedFired.current) {
                handleAuthStateChange(restoredUser).catch((err) => {
                  console.error('[useAuthAndLock] Error in restored user check:', err);
                });
                return;
              }
              if (attempt < maxAttempts && !authStateChangedFired.current) {
                checkAuthState(attempt + 1, maxAttempts);
              } else if (!authStateChangedFired.current) {
                setInitialState();
              }
            };
            setTimeout(() => checkAuthState(1), 100);
            setTimeout(() => {
              if (!authStateChangedFired.current) setInitialState();
            }, 2000);
          } else {
            setTimeout(() => {
              if (!authStateChangedFired.current) setInitialState();
            }, 500);
          }
        }
      } else {
        setIsAuthReady(true);
        setIsInitializing(false);
      }
    };

    initialize();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // App state changes for lock on background/foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousState = appState.current;

      if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
        const isOAuthFlow = getOAuthFlowActive();
        if (user && isAuthReady && !isOAuthFlow) {
          appWentToBackgroundRef.current = true;
          setIsAppLocked(true);
        }
      }

      if (
        previousState.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user &&
        isAuthReady
      ) {
        const isOAuthFlow = getOAuthFlowActive();
        // Show lock when returning from background if user has PIN (don't rely on appWentToBackgroundRef in case auth state cleared it)
        if (isPinSet && !isOAuthFlow) {
          setIsAppLocked(true);
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [user, isAuthReady, isPinSet]);

  const handleUnlock = useCallback(() => {
    setIsAppLocked(false);
    appWentToBackgroundRef.current = false;
    hasCheckedInitialLock.current = true;
  }, []);

  const refreshPinState = useCallback(async () => {
    try {
      const requiresPIN = await isPINSetupRequired();
      const pinIsSet = !requiresPIN;
      setIsPinSet(pinIsSet);
      if (pinIsSet) {
        setIsAppLocked(true);
        hasCheckedInitialLock.current = true;
      }
    } catch (err) {
      console.error('[useAuthAndLock] refreshPinState failed:', err);
      setIsPinSet(false);
    }
  }, []);

  return {
    user,
    isAuthReady,
    isInitializing,
    isAppLocked,
    isPinSet,
    lockStateDetermined,
    handleUnlock,
    refreshPinState,
  };
}
