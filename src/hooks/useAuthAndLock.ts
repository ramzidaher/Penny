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
import { initDatabase, invalidateCaches } from '../database/db';
import { clearSettingsCache } from '../services/settingsService';
import { initializeNotifications } from '../services/notifications';
import { isPINSetupRequired } from '../services/pinEnforcement';
import { getOAuthFlowActive } from '../services/oAuthFlowService';
import { getTransientUIActive, setTransientUIActive } from '../services/transientUIActiveService';
import { initPurchases } from '../services/subscriptionService';
import type { User } from 'firebase/auth';

const PIN_CHECK_TIMEOUT_MS = 12000;
const PIN_CHECK_RETRY_DELAY_MS = 2000;
const PIN_CHECK_MAX_RETRIES = 2;

export interface UseAuthAndLockResult {
  user: User | null;
  isAuthReady: boolean;
  isInitializing: boolean;
  isAppLocked: boolean;
  isPinSet: boolean;
  lockStateDetermined: boolean;
  handleUnlock: () => void;
  refreshPinState: () => Promise<void>;
  /** Call after setting PIN (e.g. in onboarding) so lock screen shows immediately without waiting for Firestore. */
  reportPinJustSet: () => void;
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
  /** Timestamp of last unlock; used to avoid re-locking when Face ID dialog briefly sends app to inactive. */
  const justUnlockedAtRef = useRef<number>(0);
  const JUST_UNLOCKED_GRACE_MS = 2500;

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
            // Reset lock state so we don't use stale values from a previous user/session.
            // Without this, nav can run with isAppLocked=false and send user to tabs before PIN check completes.
            setLockStateDetermined(false);
            setIsAppLocked(true);
            setIsPinSet(false);

            const deletionStatus = await refreshAccountDeletionStatus();
            if (deletionStatus.status !== 'active') {
              await logoutUser();
              return;
            }
            initPurchases(user.uid).catch((error) => {
              console.warn('[useAuthAndLock] RevenueCat init failed:', error);
            });

            // Run PIN check in parallel with initDatabase so we don't burn time; PIN is in Firestore, not local DB.
            type PinCheckResult = { requiresSetup: boolean; timedOut: boolean };
            const runPinCheckOnce = (): Promise<PinCheckResult> =>
              Promise.race([
                isPINSetupRequired().then((requiresSetup) => ({ requiresSetup, timedOut: false })),
                new Promise<PinCheckResult>((resolve) =>
                  setTimeout(
                    () => resolve({ requiresSetup: true, timedOut: true }),
                    PIN_CHECK_TIMEOUT_MS
                  )
                ),
              ]);

            const runPinCheckWithRetries = async (attempt: number): Promise<boolean> => {
              const result = await runPinCheckOnce();
              if (!result.timedOut && !result.requiresSetup) return false;
              if (!result.timedOut && result.requiresSetup && attempt > 0) return true;
              if (result.timedOut && attempt >= PIN_CHECK_MAX_RETRIES) {
                console.warn('[useAuthAndLock] PIN check timed out after retries, requiring PIN setup');
                return true;
              }
              const shouldRetry =
                result.timedOut ||
                (result.requiresSetup && attempt === 0);
              if (shouldRetry) {
                if (result.timedOut) console.warn('[useAuthAndLock] PIN check timed out, retrying...');
                else console.warn('[useAuthAndLock] PIN not found (e.g. just set in onboarding), retrying...');
                await new Promise((r) => setTimeout(r, PIN_CHECK_RETRY_DELAY_MS));
                return runPinCheckWithRetries(attempt + 1);
              }
              return result.requiresSetup;
            };

            const [_, requiresPIN] = await Promise.all([
              initDatabase(),
              runPinCheckWithRetries(0),
            ]);
            // Invalidate caches so new device gets fresh theme, accounts, and net worth from cloud
            invalidateCaches();
            clearSettingsCache();
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

  // App state changes: lock only when user fully leaves the app (background), not on inactive (e.g. notification center)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousState = appState.current;

      // Lock only when going to background (app fully left), not when going to inactive (notification/control center)
      if (previousState === 'active' && nextAppState === 'background') {
        const isOAuthFlow = getOAuthFlowActive();
        const isTransientUI = getTransientUIActive();
        if (user && isAuthReady && !isOAuthFlow && !isTransientUI) {
          appWentToBackgroundRef.current = true;
          setIsAppLocked(true);
        }
      }

      // Show lock when returning from background (user had fully left the app)
      if (
        previousState === 'background' &&
        nextAppState === 'active' &&
        user &&
        isAuthReady
      ) {
        const isOAuthFlow = getOAuthFlowActive();
        const isTransientUI = getTransientUIActive();
        if (isTransientUI) setTransientUIActive(false);
        const justUnlocked = Date.now() - justUnlockedAtRef.current < JUST_UNLOCKED_GRACE_MS;
        if (justUnlocked) justUnlockedAtRef.current = 0;
        if (isPinSet && !isOAuthFlow && !isTransientUI && !justUnlocked) {
          setIsAppLocked(true);
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [user, isAuthReady, isPinSet]);

  const handleUnlock = useCallback(() => {
    justUnlockedAtRef.current = Date.now();
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

  const reportPinJustSet = useCallback(() => {
    setIsPinSet(true);
    setIsAppLocked(true);
    hasCheckedInitialLock.current = true;
    setLockStateDetermined(true);
    setIsInitializing(false);
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
    reportPinJustSet,
  };
}
