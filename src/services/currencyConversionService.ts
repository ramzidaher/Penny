/**
 * Currency Conversion Service
 *
 * Uses Frankfurter (api.frankfurter.dev): fully free, no API key, no usage caps.
 * Includes in-memory + AsyncStorage caching to minimize API calls.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache key prefix for exchange rates
const CACHE_KEY_PREFIX = 'exchange_rate_';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

interface ExchangeRateCache {
  rate: number;
  timestamp: number;
  fromCurrency: string;
  toCurrency: string;
}

// Frankfurter: free, open-source, no API key, no usage caps (https://www.frankfurter.app/)
const FRANKFURTER_LATEST = 'https://api.frankfurter.dev/v1/latest';

const getExchangeRate = async (fromCurrency: string, toCurrency: string): Promise<number> => {
  if (!fromCurrency || !toCurrency) {
    throw new Error(`Invalid currency: fromCurrency=${fromCurrency}, toCurrency=${toCurrency}`);
  }

  if (fromCurrency === toCurrency) {
    return 1;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${fromCurrency}_${toCurrency}`;

  try {
    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (cachedData) {
      const cache: ExchangeRateCache = JSON.parse(cachedData);
      const now = Date.now();
      if (now - cache.timestamp < CACHE_DURATION) {
        return cache.rate;
      }
    }

    const url = `${FRANKFURTER_LATEST}?base=${encodeURIComponent(fromCurrency)}&symbols=${encodeURIComponent(toCurrency)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { base?: string; rates?: Record<string, number> };
    const rate = data.rates?.[toCurrency];
    if (rate == null) {
      throw new Error(`Currency ${toCurrency} not found for base ${fromCurrency}`);
    }

    const cache: ExchangeRateCache = {
      rate,
      timestamp: Date.now(),
      fromCurrency,
      toCurrency,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cache));
    return rate;
  } catch (error) {
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        const cache: ExchangeRateCache = JSON.parse(cachedData);
        return cache.rate;
      }
    } catch {
      // ignore
    }
    throw new Error(
      `Failed to get exchange rate ${fromCurrency} → ${toCurrency}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Convert amount from one currency to another.
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  if (!fromCurrency || !toCurrency) {
    return amount;
  }
  if (fromCurrency === toCurrency) {
    return amount;
  }
  try {
    const rate = await getExchangeRate(fromCurrency, toCurrency);
    return amount * rate;
  } catch {
    return amount;
  }
};

/**
 * Convert multiple amounts to a target currency.
 * Fetches each unique (fromCurrency → targetCurrency) rate once, then applies to all amounts.
 */
export const convertAmountsToCurrency = async (
  amounts: Array<{ amount: number; currency: string }>,
  targetCurrency: string
): Promise<number> => {
  if (!targetCurrency) {
    return amounts.reduce((sum, { amount }) => sum + amount, 0);
  }

  if (amounts.length === 0) {
    return 0;
  }

  const byFrom = new Map<string, number[]>();
  for (let i = 0; i < amounts.length; i++) {
    const from = amounts[i].currency || 'USD';
    if (!byFrom.has(from)) {
      byFrom.set(from, []);
    }
    byFrom.get(from)!.push(amounts[i].amount);
  }

  let total = 0;
  for (const [fromCurrency, amts] of byFrom) {
    if (fromCurrency === targetCurrency) {
      total += amts.reduce((s, a) => s + a, 0);
    } else {
      const rate = await getExchangeRate(fromCurrency, targetCurrency);
      total += amts.reduce((s, a) => s + a * rate, 0);
    }
  }
  return total;
};

/**
 * Clear exchange rate cache (useful for testing or forcing refresh).
 */
export const clearExchangeRateCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch {
    // ignore
  }
};
