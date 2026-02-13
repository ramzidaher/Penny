import { Stack, useRouter, useSegments, usePathname, useRootNavigationState } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { shouldBlockRendering } from '../../../src/services/oAuthFlowService';
import { useTheme } from '../../../src/contexts/ThemeContext';
import LoadingScreen from '../../../src/components/LoadingScreen';

function CustomBackButton({ fromProfile }: { fromProfile?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => {
        if (fromProfile) {
          router.push('/profile' as any);
        } else {
          router.back();
        }
      }}
      style={{ marginLeft: 8, padding: 4 }}
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
  );
}

export default function FinanceLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const segmentsRaw = useSegments();
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const hasMountedStackRef = useRef(false);
  const previousPathnameRef = useRef<string | null>(null);
  const previousSegmentsRef = useRef<string[]>([]);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingFromProfileRef = useRef(false);
  const oAuthWasActiveRef = useRef(false);
  
  // Normalize segments to always be an array with default empty array fallback
  // This prevents "Cannot read property 'filter' of undefined" errors
  const segments: string[] = Array.isArray(segmentsRaw) ? segmentsRaw : [];
  
  // Initialize canRender - start as false if OAuth might have been active
  // This ensures we wait after OAuth completes
  const [canRender, setCanRender] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // Monitor OAuth flow and router readiness
  useEffect(() => {
    let oAuthCompletionTimer: NodeJS.Timeout | undefined;
    let pollInterval: NodeJS.Timeout | undefined;
    let renderCheckTimer: NodeJS.Timeout | undefined;
    
    const checkOAuthAndRender = () => {
      // Check if we should block rendering (OAuth or navigation transition)
      const shouldBlock = shouldBlockRendering();

      if (shouldBlock) {
        // OAuth or navigation transition is active.
        // CRITICAL:
        // - Never set canRender=false here (unmount/remount is what triggers the stack crash).
        // - BUT if the Finance stack has never mounted yet (fresh mount) we MUST allow the stack
        //   to render so screens can mount and clear the OAuth flag.
        if (!hasMountedStackRef.current && !canRender) {
          setCanRender(true);
        }
        oAuthWasActiveRef.current = true;
        return;
      }

      // OAuth is not active
      if (router && pathname && Array.isArray(segments)) {
        // If OAuth was active, wait longer for router state to fully stabilize
        if (oAuthWasActiveRef.current) {
          // OAuth just completed - wait for navigation transition to complete
          // The navigation transition period (2000ms) should be sufficient
          // But we'll add a small buffer (300ms) after transition completes
          // Clear any existing timer
          if (oAuthCompletionTimer) clearTimeout(oAuthCompletionTimer);
          
          // Poll until navigation transition completes, then add buffer
          const checkTransitionAndRender = () => {
            const stillBlocking = shouldBlockRendering();
            if (!stillBlocking && router && pathname && Array.isArray(segments)) {
              // Transition completed - add 300ms buffer to ensure router state is ready
              renderCheckTimer = setTimeout(() => {
                const finalBlocking = shouldBlockRendering();
                if (!finalBlocking && router && pathname && Array.isArray(segments)) {
                  setCanRender(true);
                  oAuthWasActiveRef.current = false;
                }
              }, 300);
            } else if (stillBlocking) {
              // Still blocking - check again in 100ms
              oAuthCompletionTimer = setTimeout(checkTransitionAndRender, 100);
            }
          };
          
          // Start checking immediately
          checkTransitionAndRender();
        } else {
          // OAuth was never active - allow rendering immediately
          setCanRender(true);
        }
      } else {
        setCanRender(false);
      }
    };

    // Initial check
    const initialShouldBlock = shouldBlockRendering();
    checkOAuthAndRender();
    
    // If OAuth/navigation transition is active, poll until it completes
    if (initialShouldBlock) {
      pollInterval = setInterval(() => {
        const currentShouldBlock = shouldBlockRendering();
        
        // Detect OAuth/navigation transition completion
        if (initialShouldBlock && !currentShouldBlock) {
          // OAuth/navigation transition just completed - check render with delay
          checkOAuthAndRender();
          if (pollInterval) clearInterval(pollInterval);
        }
      }, 100);
    }

    return () => {
      if (oAuthCompletionTimer) clearTimeout(oAuthCompletionTimer);
      if (pollInterval) clearInterval(pollInterval);
      if (renderCheckTimer) clearTimeout(renderCheckTimer);
    };
  }, [router, pathname, segments]);

  // Track navigation state for tab reset logic
  useEffect(() => {
    // Guard: Ensure router and segments are ready
    if (!router || !pathname || !Array.isArray(segments) || segments.length === 0) {
      return;
    }

    // Check if we're on a finance nested screen (not index)
    const isOnFinanceNestedScreen = 
      segments.includes('finance') && 
      segments[segments.length - 1] !== 'finance' &&
      segments[segments.length - 1] !== 'index' &&
      pathname?.includes('/finance/') &&
      !pathname?.endsWith('/finance') &&
      !pathname?.endsWith('/finance/');

    // Check if we came from profile (intentional navigation, not tab selection)
    const cameFromProfile = previousPathnameRef.current === '/profile' || 
      previousSegmentsRef.current.includes('profile');
    
    // Check if we came from finance (either index or another finance screen)
    // This means we're navigating within finance tab - DON'T reset
    const cameFromFinance = previousPathnameRef.current?.includes('/finance') ||
      previousSegmentsRef.current.includes('finance');
    
    // Check if we came from a different tab (not finance, not profile)
    // This means finance tab was clicked while on a different tab - DO reset
    const wasOnDifferentTab = previousPathnameRef.current && 
      !previousPathnameRef.current.includes('/finance') &&
      !previousPathnameRef.current.includes('/profile');

    // Only reset if:
    // 1. We're on a nested screen AND
    // 2. We came from a different tab (not finance, not profile)
    // This means: finance tab was clicked while user was on home/ai/add tab
    // DO NOT reset if:
    // - We came from profile (intentional navigation)
    // - We came from finance (intentional navigation within finance tab)
    const shouldReset = isOnFinanceNestedScreen && 
      !cameFromProfile && 
      !cameFromFinance && // Don't reset if navigating within finance
      wasOnDifferentTab; // Only reset if we came from a completely different tab

    // Only reset if it's a tab selection, not intentional navigation from profile
    if (shouldReset) {
      // Clear any existing timeout
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }

      // Use a small delay to ensure the navigation state is ready
      resetTimeoutRef.current = setTimeout(() => {
        router.replace('/(tabs)/finance' as any);
      }, 50); // Reduced delay for faster response
    }

    // Update previous pathname and segments
    previousPathnameRef.current = pathname;
    previousSegmentsRef.current = [...segments];

    // Cleanup timeout on unmount
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, [pathname, segments, router]);

  // Don't use useFocusEffect for reset - it triggers too aggressively
  // The useEffect above handles the reset logic based on navigation history

  // Guard: Don't render Stack if router state isn't ready
  // This prevents the "Cannot read property 'filter' of undefined" error
  // CRITICAL: If OAuth flow is active OR navigation is transitioning, don't render
  const rootRoutesLen = Array.isArray(rootState?.routes) ? rootState.routes.length : -1;
  const isRootNavReady = rootRoutesLen > 0;
  const layoutReady =
    isRootNavReady &&
    canRender &&
    Array.isArray(segments) &&
    !!router &&
    !!pathname;

  // Show Penny loading until layout is ready, then 3s and dismiss.
  if (!layoutReady || !splashDone) {
    return (
      <LoadingScreen
        readyToDismiss={layoutReady}
        onFinish={() => setSplashDone(true)}
      />
    );
  }

  hasMountedStackRef.current = true;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: '',
        headerBackVisible: true,
        // Don't set animation here - let NativeTabs handle tab switching animations
        // Only set animation for nested screens (not the index)
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Finance', 
          headerShown: false,
          animation: 'none', // Disable animation for index to let NativeTabs handle tab switching
        }} 
      />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="add-account" options={{ title: 'Add Account' }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Stack.Screen name="transaction-detail" options={{ headerShown: false }} />
      <Stack.Screen name="income-expense" options={{ title: 'Income & Expenses' }} />
      <Stack.Screen name="add-transaction" options={{ title: 'Add Transaction' }} />
      <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
      <Stack.Screen name="add-budget" options={{ title: 'Add Budget' }} />
      <Stack.Screen name="debts" options={{ title: 'Debts' }} />
      <Stack.Screen name="add-debt" options={{ title: 'Add Debt' }} />
      <Stack.Screen name="subscriptions" options={{ title: 'Subscriptions' }} />
      <Stack.Screen
        name="add-subscription"
        options={{
          title: 'Add Subscription',
          headerBackTitle: 'Subscriptions',
          headerTitleAlign: 'center',
        }}
      />
    </Stack>
  );
}
