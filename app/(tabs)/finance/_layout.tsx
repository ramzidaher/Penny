import { Stack, useRouter, useSegments, usePathname, useFocusEffect } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import React, { useCallback, useEffect, useRef } from 'react';

function CustomBackButton({ fromProfile }: { fromProfile?: boolean }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => {
        if (fromProfile) {
          // If we came from profile, navigate back to profile
          router.push('/profile' as any);
        } else {
          // Otherwise, use default back behavior
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
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const previousPathnameRef = useRef<string | null>(null);
  const previousSegmentsRef = useRef<string[]>([]);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingFromProfileRef = useRef(false);

  // Track navigation state for tab reset logic
  useEffect(() => {
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

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: '',
        headerBackTitleVisible: false,
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
      <Stack.Screen name="connect-bank" options={{ title: 'Connect Bank' }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Stack.Screen name="transaction-detail" options={{ headerShown: false }} />
      <Stack.Screen name="income-expense" options={{ title: 'Income & Expenses' }} />
      <Stack.Screen name="add-transaction" options={{ title: 'Add Transaction' }} />
      <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
      <Stack.Screen name="add-budget" options={{ title: 'Add Budget' }} />
      <Stack.Screen name="debts" options={{ title: 'Debts' }} />
      <Stack.Screen name="add-debt" options={{ title: 'Add Debt' }} />
      <Stack.Screen 
        name="subscriptions" 
        options={{ headerShown: false }} 
      />
    </Stack>
  );
}

