import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'demo_paywall_bypass_v1';

export const getDemoPaywallBypass = async (): Promise<boolean> => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored === 'true';
};

export const setDemoPaywallBypass = async (value: boolean) => {
  await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
};

