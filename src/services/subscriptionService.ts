import React from 'react';
import { Platform, NativeModules } from 'react-native';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

export type AccessLevel = 'basic' | 'value' | 'expert' | 'lifetime' | 'unknown';

interface SubscriptionState {
  isInitialized: boolean;
  isLoading: boolean;
  accessLevel: AccessLevel;
  activeEntitlements: string[];
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;
}

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';

export const ENTITLEMENTS = {
  basic: 'basic',
  value: 'value',
  expert: 'expert',
  lifetime: 'lifetime',
};

const listeners = new Set<(state: SubscriptionState) => void>();
let currentState: SubscriptionState = {
  isInitialized: false,
  isLoading: true,
  accessLevel: 'unknown',
  activeEntitlements: [],
  offerings: null,
  customerInfo: null,
};
let lastUserId: string | null = null;
let PurchasesModule: any | null = null;

const emit = () => {
  listeners.forEach((listener) => listener(currentState));
};

const updateState = (partial: Partial<SubscriptionState>) => {
  currentState = { ...currentState, ...partial };
  emit();
};

const getApiKey = () => {
  if (Platform.OS === 'ios') return IOS_API_KEY;
  if (Platform.OS === 'android') return ANDROID_API_KEY;
  return IOS_API_KEY || ANDROID_API_KEY;
};

const getPurchases = async () => {
  if (Platform.OS === 'web') return null;
  const nativeModule =
    (NativeModules as any)?.RNPurchases ||
    (NativeModules as any)?.RNPurchasesModule ||
    (NativeModules as any)?.Purchases;
  if (!nativeModule) {
    return null;
  }
  if (PurchasesModule) return PurchasesModule;
  try {
    const module = await import('react-native-purchases');
    PurchasesModule = module.default ?? module;
    return PurchasesModule;
  } catch (error) {
    console.warn('[RevenueCat] Module not available:', error);
    return null;
  }
};

const resolveAccessLevel = (info: CustomerInfo | null): AccessLevel => {
  const active = info?.entitlements?.active ?? {};
  if (active[ENTITLEMENTS.lifetime]) return 'lifetime';
  if (active[ENTITLEMENTS.expert]) return 'expert';
  if (active[ENTITLEMENTS.value]) return 'value';
  if (active[ENTITLEMENTS.basic]) return 'basic';
  return 'basic';
};

const applyCustomerInfo = (info: CustomerInfo | null) => {
  const activeEntitlements = info ? Object.keys(info.entitlements.active || {}) : [];
  updateState({
    customerInfo: info,
    activeEntitlements,
    accessLevel: resolveAccessLevel(info),
    isLoading: false,
  });
};

export const subscribeToSubscriptionState = (listener: (state: SubscriptionState) => void) => {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
};

export const getSubscriptionState = () => currentState;

export const initPurchases = async (userId?: string) => {
  const apiKey = getApiKey();
  const Purchases = await getPurchases();
  if (!Purchases) {
    updateState({ isInitialized: false, isLoading: false, accessLevel: 'basic' });
    return;
  }
  if (!apiKey) {
    updateState({ isInitialized: false, isLoading: false, accessLevel: 'basic' });
    return;
  }

  if (!currentState.isInitialized) {
    Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: userId || undefined });
    Purchases.addCustomerInfoUpdateListener((info) => {
      applyCustomerInfo(info);
    });
    updateState({ isInitialized: true });
  }

  if (userId && userId !== lastUserId) {
    try {
      await Purchases.logIn(userId);
      lastUserId = userId;
    } catch (error) {
      console.warn('[RevenueCat] Failed to log in:', error);
    }
  }

  if (!userId && lastUserId) {
    try {
      await Purchases.logOut();
      lastUserId = null;
    } catch (error) {
      console.warn('[RevenueCat] Failed to log out:', error);
    }
  }

  await refreshPurchases();
};

export const refreshPurchases = async () => {
  const Purchases = await getPurchases();
  if (!Purchases) {
    updateState({ isLoading: false });
    return;
  }
  try {
    updateState({ isLoading: true });
    const [info, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    applyCustomerInfo(info);
    updateState({ offerings });
  } catch (error) {
    console.warn('[RevenueCat] Failed to refresh state:', error);
    updateState({ isLoading: false });
  }
};

export const purchasePackage = async (pkg: PurchasesPackage) => {
  const Purchases = await getPurchases();
  if (!Purchases) {
    throw new Error('Purchases module unavailable');
  }
  updateState({ isLoading: true });
  try {
    const result = await Purchases.purchasePackage(pkg);
    applyCustomerInfo(result.customerInfo);
    return result.customerInfo;
  } finally {
    updateState({ isLoading: false });
  }
};

export const restorePurchases = async () => {
  const Purchases = await getPurchases();
  if (!Purchases) {
    throw new Error('Purchases module unavailable');
  }
  updateState({ isLoading: true });
  try {
    const info = await Purchases.restorePurchases();
    applyCustomerInfo(info);
    return info;
  } finally {
    updateState({ isLoading: false });
  }
};

export const useSubscriptionStatus = () => {
  const [state, setState] = React.useState<SubscriptionState>(currentState);
  React.useEffect(() => subscribeToSubscriptionState(setState), []);
  return state;
};

