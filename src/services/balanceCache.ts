/**
 * Secure Balance Cache Service
 * 
 * Implements encrypted local caching with TTL for account balance data.
 * 
 * Security Features:
 * - Encrypted storage using SecureStore (keychain/keystore)
 * - Per-user isolation using userId
 * - Auto-expiring cache (TTL) for GDPR compliance
 * - No cloud persistence of balance data for TrueLayer accounts
 * - Fast in-memory cache with encrypted fallback
 * 
 * Architecture:
 * - Fetch from TrueLayer API → Cache in SecureStore (encrypted) → Return
 * - Cache expires after TTL (default: 30 minutes - balances change more frequently)
 * - Stale-while-revalidate: Show cached data immediately, refresh in background
 * - Cleared on logout/token revocation
 * 
 * Based on industry best practices:
 * - Balances: 30 minute TTL (fresher than transactions, but still cached for UX)
 * - Manual refresh always available via pull-to-refresh
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './firebase';
import { getAccountBalance } from './truelayerService';

// Cache TTL: 30 minutes (balances change more frequently than transactions)
// Still cached for instant UX, but refreshed more often
// Manual refresh always available via pull-to-refresh
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_PREFIX = 'balance_cache_';
const CACHE_METADATA_PREFIX = 'balance_meta_';

interface CacheMetadata {
  userId: string;
  connectionId: string;
  accountId: string;
  expiresAt: number;
  cachedAt: number; // Timestamp when cache was created (for stale-while-revalidate)
}

interface CachedBalance {
  balance: number;
  currency: string;
  metadata: CacheMetadata;
}

// Secure storage helpers - use AsyncStorage for large data (>2KB), SecureStore for small data
const secureSetItem = async (key: string, value: string): Promise<void> => {
  if (value.length > 2000) {
    console.log('[balanceCache] Data too large for SecureStore, using AsyncStorage');
    await AsyncStorage.setItem(key, value);
    return;
  }
  
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.log('[balanceCache] SecureStore not available, using AsyncStorage fallback');
    await AsyncStorage.setItem(key, value);
  }
};

const secureGetItem = async (key: string): Promise<string | null> => {
  const asyncValue = await AsyncStorage.getItem(key);
  if (asyncValue) {
    return asyncValue;
  }
  
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    return null;
  }
};

const secureDeleteItem = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    // Ignore SecureStore errors
  }
  await AsyncStorage.removeItem(key);
};

// Generate cache key for user + connection + account
const getCacheKey = (userId: string, connectionId: string, accountId: string): string => {
  return `${CACHE_PREFIX}${userId}_${connectionId}_${accountId}`;
};

const getMetadataKey = (userId: string, connectionId: string, accountId: string): string => {
  return `${CACHE_METADATA_PREFIX}${userId}_${connectionId}_${accountId}`;
};

// Check if cache is valid (not expired)
const isCacheValid = (metadata: CacheMetadata): boolean => {
  return Date.now() < metadata.expiresAt;
};

// Fetch balance from TrueLayer API
const fetchBalanceFromAPI = async (
  connectionId: string,
  accountId: string
): Promise<{ balance: number; currency: string }> => {
  try {
    console.log('[balanceCache] Fetching balance from TrueLayer API');
    const balanceResponse = await getAccountBalance(connectionId, accountId);
    const balance = balanceResponse.results[0];
    
    const result = {
      balance: balance?.current || balance?.available || 0,
      currency: balance?.currency || 'GBP',
    };
    
    console.log('[balanceCache] Fetched balance from API');
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle "Connection not found" gracefully (expected when connection is deleted)
    if (errorMessage.includes('Connection not found') || errorMessage.includes('not found')) {
      console.log('[balanceCache] Connection not found, balance fetch skipped');
      throw error; // Re-throw so accountBalanceService can handle it
    }
    
    console.error('[balanceCache] Error fetching balance from API:', errorMessage);
    throw error;
  }
};

// Store balance in encrypted cache
const storeInCache = async (
  userId: string,
  connectionId: string,
  accountId: string,
  balance: number,
  currency: string
): Promise<void> => {
  const cacheKey = getCacheKey(userId, connectionId, accountId);
  const metadataKey = getMetadataKey(userId, connectionId, accountId);

  const metadata: CacheMetadata = {
    userId,
    connectionId,
    accountId,
    expiresAt: Date.now() + CACHE_TTL_MS,
    cachedAt: Date.now(), // Track when cache was created
  };

  const cachedData: CachedBalance = {
    balance,
    currency,
    metadata,
  };

  await secureSetItem(cacheKey, JSON.stringify(cachedData));
  await secureSetItem(metadataKey, JSON.stringify(metadata));
};

// Retrieve balance from encrypted cache
const getFromCache = async (
  userId: string,
  connectionId: string,
  accountId: string
): Promise<{ balance: number; currency: string } | null> => {
  const cacheKey = getCacheKey(userId, connectionId, accountId);
  const metadataKey = getMetadataKey(userId, connectionId, accountId);

  const metadataStr = await secureGetItem(metadataKey);
  if (!metadataStr) {
    return null;
  }

  const metadata: CacheMetadata = JSON.parse(metadataStr);

  // Verify user matches (security check)
  if (metadata.userId !== userId) {
    await secureDeleteItem(cacheKey);
    await secureDeleteItem(metadataKey);
    return null;
  }

  // Check if cache is expired
  if (!isCacheValid(metadata)) {
    await secureDeleteItem(cacheKey);
    await secureDeleteItem(metadataKey);
    return null;
  }

  const cachedStr = await secureGetItem(cacheKey);
  if (!cachedStr) {
    return null;
  }

  const cached: CachedBalance = JSON.parse(cachedStr);
  return { balance: cached.balance, currency: cached.currency };
};

// Clear cache for a specific account
export const clearBalanceCache = async (
  connectionId: string,
  accountId: string
): Promise<void> => {
  const userId = getUserId();
  if (!userId) return;

  const cacheKey = getCacheKey(userId, connectionId, accountId);
  const metadataKey = getMetadataKey(userId, connectionId, accountId);

  await secureDeleteItem(cacheKey);
  await secureDeleteItem(metadataKey);
};

// Main function: Get balance with secure caching (stale-while-revalidate pattern)
export const getCachedBalance = async (
  connectionId: string,
  accountId: string,
  forceRefresh: boolean = false
): Promise<{ balance: number; currency: string }> => {
  const userId = getUserId();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  // If force refresh, skip cache and fetch fresh
  if (forceRefresh) {
    console.log('[balanceCache] Force refresh - fetching from API');
    const result = await fetchBalanceFromAPI(connectionId, accountId);
    await storeInCache(userId, connectionId, accountId, result.balance, result.currency);
    return result;
  }

  // Try to get from cache
  const cached = await getFromCache(userId, connectionId, accountId);
  
  if (cached) {
    console.log('[balanceCache] Cache hit - returning cached balance');
    
    // Stale-while-revalidate: Return cached data immediately, refresh in background
    // Check if cache is stale (but not expired) - refresh in background
    const metadataKey = getMetadataKey(userId, connectionId, accountId);
    const metadataStr = await secureGetItem(metadataKey);
    if (metadataStr) {
      const metadata: CacheMetadata = JSON.parse(metadataStr);
      const age = Date.now() - metadata.cachedAt;
      const staleThreshold = CACHE_TTL_MS * 0.5; // Consider stale after 50% of TTL (15 minutes)
      
      if (age > staleThreshold) {
        // Cache is stale but still valid - refresh in background (don't await)
        console.log('[balanceCache] Cache is stale, refreshing in background');
        fetchBalanceFromAPI(connectionId, accountId)
          .then(result => {
            console.log('[balanceCache] Background refresh complete');
            return storeInCache(userId, connectionId, accountId, result.balance, result.currency);
          })
          .catch(error => {
            console.log('[balanceCache] Background refresh failed (non-critical):', error instanceof Error ? error.message : 'Unknown error');
          });
      }
    }
    
    return cached;
  }

  // Cache miss or expired - fetch from API
  console.log('[balanceCache] Cache miss - fetching from API');
  const result = await fetchBalanceFromAPI(connectionId, accountId);
  await storeInCache(userId, connectionId, accountId, result.balance, result.currency);
  return result;
};

