/**
 * Currency Conversion Service
 * 
 * Handles currency conversion using a free exchange rate API.
 * Includes caching to minimize API calls.
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

// Free API endpoint (no API key required for basic usage)
// Using exchangerate-api.com which provides free tier
const EXCHANGE_RATE_API_BASE = 'https://api.exchangerate-api.com/v4/latest';

/**
 * Get exchange rate from cache or API
 */
const getExchangeRate = async (fromCurrency: string, toCurrency: string): Promise<number> => {
  // Validate currencies
  if (!fromCurrency || !toCurrency) {
    throw new Error(`Invalid currency: fromCurrency=${fromCurrency}, toCurrency=${toCurrency}`);
  }
  
  // Same currency, no conversion needed
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${fromCurrency}_${toCurrency}`;
  
  try {
    // Check cache first
    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (cachedData) {
      const cache: ExchangeRateCache = JSON.parse(cachedData);
      const now = Date.now();
      
      // If cache is still valid, return cached rate
      if (now - cache.timestamp < CACHE_DURATION) {
        console.log(`[currencyConversion] Using cached rate for ${fromCurrency} to ${toCurrency}: ${cache.rate}`);
        return cache.rate;
      }
    }

    // Fetch from API
    console.log(`[currencyConversion] Fetching exchange rate for ${fromCurrency} to ${toCurrency}`);
    
    // Use a simpler approach: get USD rates and calculate cross rates
    let rate: number;
    
    try {
      // Get USD base rates (most reliable)
      const usdResponse = await fetch(`${EXCHANGE_RATE_API_BASE}/USD`);
      if (!usdResponse.ok) {
        throw new Error(`Failed to fetch USD exchange rates: ${usdResponse.statusText}`);
      }
      const usdData = await usdResponse.json();
      
      if (!usdData.rates) {
        throw new Error('Invalid exchange rate API response');
      }
      
      // Calculate rate: fromCurrency -> USD -> toCurrency
      if (fromCurrency === 'USD') {
        // Direct from USD
        rate = usdData.rates[toCurrency];
        if (!rate) {
          throw new Error(`Currency ${toCurrency} not found in exchange rates`);
        }
      } else if (toCurrency === 'USD') {
        // Converting to USD
        const fromToUsd = usdData.rates[fromCurrency];
        if (!fromToUsd) {
          throw new Error(`Currency ${fromCurrency} not found in exchange rates`);
        }
        rate = 1 / fromToUsd;
      } else {
        // Cross rate: fromCurrency -> USD -> toCurrency
        const fromToUsd = usdData.rates[fromCurrency];
        const usdToTo = usdData.rates[toCurrency];
        
        if (!fromToUsd || !usdToTo) {
          throw new Error(`Currency conversion not available for ${fromCurrency} to ${toCurrency}`);
        }
        
        rate = (1 / fromToUsd) * usdToTo;
      }
    } catch (apiError) {
      console.error(`[currencyConversion] API error:`, apiError);
      throw apiError;
    }

    // Cache the rate
    const cache: ExchangeRateCache = {
      rate,
      timestamp: Date.now(),
      fromCurrency,
      toCurrency,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cache));
    
    console.log(`[currencyConversion] Fetched and cached rate for ${fromCurrency} to ${toCurrency}: ${rate}`);
    return rate;
  } catch (error) {
    console.error(`[currencyConversion] Error getting exchange rate:`, error);
    
    // Try to return cached rate even if expired as fallback
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        const cache: ExchangeRateCache = JSON.parse(cachedData);
        console.warn(`[currencyConversion] Using expired cache as fallback: ${cache.rate}`);
        return cache.rate;
      }
    } catch (cacheError) {
      // Ignore cache errors
    }
    
    // If all else fails, throw error
    throw new Error(`Failed to get exchange rate from ${fromCurrency} to ${toCurrency}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Convert amount from one currency to another
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  // Validate inputs
  if (!fromCurrency || !toCurrency) {
    console.warn(`[currencyConversion] Invalid currency parameters: fromCurrency=${fromCurrency}, toCurrency=${toCurrency}`);
    return amount; // Return original amount if currencies are invalid
  }
  
  if (fromCurrency === toCurrency) {
    return amount;
  }

  try {
    const rate = await getExchangeRate(fromCurrency, toCurrency);
    return amount * rate;
  } catch (error) {
    console.error(`[currencyConversion] Conversion failed:`, error);
    // Return original amount if conversion fails
    return amount;
  }
};

/**
 * Convert multiple amounts to a target currency
 */
export const convertAmountsToCurrency = async (
  amounts: Array<{ amount: number; currency: string }>,
  targetCurrency: string
): Promise<number> => {
  // Validate target currency
  if (!targetCurrency) {
    console.warn(`[currencyConversion] Invalid target currency: ${targetCurrency}`);
    // Return sum of original amounts if target currency is invalid
    return amounts.reduce((sum, { amount }) => sum + amount, 0);
  }
  
  const conversions = await Promise.all(
    amounts.map(({ amount, currency }) => {
      // Use USD as fallback if currency is undefined
      const fromCurrency = currency || 'USD';
      return convertCurrency(amount, fromCurrency, targetCurrency);
    })
  );
  
  return conversions.reduce((sum, converted) => sum + converted, 0);
};

/**
 * Clear exchange rate cache (useful for testing or forcing refresh)
 */
export const clearExchangeRateCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
    console.log(`[currencyConversion] Cleared ${cacheKeys.length} cached exchange rates`);
  } catch (error) {
    console.error('[currencyConversion] Error clearing cache:', error);
  }
};

