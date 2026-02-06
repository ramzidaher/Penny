import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActionMenuProvider } from '../src/contexts/ActionMenuContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DialogProvider } from '../src/contexts/DialogContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import AppLockScreen from '../src/components/AppLockScreen';
import { getOAuthFlowActive } from '../src/services/oAuthFlowService';
import { useAuthAndLock } from '../src/hooks/useAuthAndLock';

function RootLayoutInner() {
  const [fontsLoaded] = useFonts({
    'Gulfs Display': require('../assets/fonts/GulfsDisplay-Normal.ttf'),
    'GulfsDisplay-Normal': require('../assets/fonts/GulfsDisplay-Normal.ttf'),
  });

  const {
    user,
    isAuthReady,
    isInitializing,
    isAppLocked,
    isPinSet,
    lockStateDetermined,
    handleUnlock,
  } = useAuthAndLock();

  const segments = useSegments();
  const router = useRouter();

  // Deep link when user taps a notification (app opened from background or cold start)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    const routeFromNotificationData = (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      const type = data.type as string | undefined;
      if (type === 'subscription' || type === 'payment_reminder') router.replace('/(tabs)/finance/subscriptions' as any);
      else if (type === 'debt') router.replace('/(tabs)/finance/debts' as any);
      else if (type === 'low_balance' || type === 'negative_balance') router.replace('/(tabs)/finance/accounts' as any);
      else if (type === 'budget') router.replace('/(tabs)/finance/budgets' as any);
      else if (type === 'daily_update') router.replace('/(tabs)' as any);
    };
    import('expo-notifications').then((NotificationsModule) => {
      if (cancelled) return;
      const Notifications = NotificationsModule.default;
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (cancelled) return;
        if (response?.notification?.request?.content?.data) {
          routeFromNotificationData(response.notification.request.content.data as Record<string, unknown>);
        }
      });
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        routeFromNotificationData(response.notification.request.content.data as Record<string, unknown>);
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);

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

  const handleUnlockAndMaybeNavigate = () => {
    handleUnlock();
    if (user && segments[0] === '(auth)') {
      router.replace('/(tabs)' as any);
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
            {user && isPinSet && isAppLocked && <AppLockScreen onUnlock={handleUnlockAndMaybeNavigate} />}
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