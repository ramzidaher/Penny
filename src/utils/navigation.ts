import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Navigation utility for Expo Router
 * Provides a compatible interface for screens that were using React Navigation
 */
export function useAppNavigation() {
  const router = useRouter();

  return {
    navigate: (route: string, params?: any) => {
      // Map old route names to new Expo Router paths
      const routeMap: Record<string, string> = {
        'AddAccount': '/(tabs)/finance/add-account',
        'AddTransaction': '/(tabs)/finance/add-transaction',
        'AddBudget': '/(tabs)/finance/add-budget',
        'AddDebt': '/(tabs)/finance/add-debt',
        'AddSubscription': '/(tabs)/finance/subscriptions/add',
        'Accounts': '/(tabs)/finance/accounts',
        'Transactions': '/(tabs)/finance/transactions',
        'Budgets': '/(tabs)/finance/budgets',
        'Debts': '/(tabs)/finance/debts',
        'Subscriptions': '/(tabs)/finance/subscriptions',
        'ConnectBank': '/(tabs)/finance/connect-bank',
        'Settings': '/(tabs)/finance/settings',
        'Register': '/(auth)/register',
        'Login': '/(auth)/login',
      };

      const path = routeMap[route] || route;
      
      if (params) {
        router.push({ pathname: path as any, params });
      } else {
        router.push(path as any);
      }
    },
    goBack: () => {
      router.back();
    },
    addListener: (event: string, callback: () => void) => {
      // For expo-router, we use useFocusEffect instead
      // This is a stub for compatibility
      return () => {};
    },
  };
}

/**
 * Compatibility hook that provides React Navigation-like interface for Expo Router
 * Use this instead of useNavigation() from @react-navigation/native
 * 
 * Note: For focus listeners, use useFocusEffect from expo-router directly in your component
 */
export function useNavigation() {
  const router = useRouter();
  
  return {
    navigate: (route: string | { screen: string; params?: any } | never, params?: any) => {
      if (typeof route === 'string') {
        const routeMap: Record<string, string> = {
          'AddAccount': '/(tabs)/finance/add-account',
          'AddTransaction': '/(tabs)/finance/add-transaction',
          'AddBudget': '/(tabs)/finance/add-budget',
          'AddDebt': '/(tabs)/finance/add-debt',
          'AddSubscription': '/(tabs)/finance/subscriptions/add',
          'Accounts': '/(tabs)/finance/accounts',
          'Transactions': '/(tabs)/finance/transactions',
          'Budgets': '/(tabs)/finance/budgets',
          'Debts': '/(tabs)/finance/debts',
          'ConnectBank': '/(tabs)/finance/connect-bank',
          'Settings': '/(tabs)/finance/settings',
          'Register': '/(auth)/register',
          'Login': '/(auth)/login',
        };
        const path = routeMap[route] || route;
        if (params) {
          router.push({ pathname: path as any, params });
        } else {
          router.push(path as any);
        }
      } else if (route && typeof route === 'object' && 'screen' in route) {
        // Handle nested navigation
        const path = route.screen;
        if (route.params) {
          router.push({ pathname: path as any, params: route.params });
        } else {
          router.push(path as any);
        }
      }
    },
    goBack: () => router.back(),
    addListener: (event: string, callback: () => void) => {
      // Note: For proper focus handling, use useFocusEffect from expo-router in your component
      // This is a stub that returns a no-op unsubscribe function
      return () => {};
    },
  };
}

