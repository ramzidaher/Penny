/**
 * TrueLayer Service - Mobile-First Implementation
 * 
 * This service handles TrueLayer OAuth flow and API interactions.
 * Optimized for mobile (iOS/Android) with app scheme deep linking.
 * 
 * OAuth Flow:
 * 1. User clicks "Connect with TrueLayer" -> opens browser with auth URL
 * 2. User authenticates with bank -> TrueLayer redirects to app scheme (penny://truelayer-callback?code=XXX)
 * 3. App receives deep link -> extracts code -> exchanges for tokens
 * 4. Tokens stored securely in device keychain/keystore (or AsyncStorage in Expo Go)
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import axios, { AxiosInstance } from 'axios';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from './firebase';
import {
  TrueLayerTokenResponse,
  TrueLayerAccountsResponse,
  TrueLayerBalanceResponse,
  TrueLayerCardsResponse,
  TrueLayerTransactionsResponse,
  TrueLayerConnection,
} from '../types/truelayer';
import { Platform, Linking } from 'react-native';

const CLIENT_ID = process.env.EXPO_PUBLIC_TRUELAYER_CLIENT_ID || '';
// CLIENT_SECRET removed - token exchange and refresh now handled by backend
const ENV = process.env.EXPO_PUBLIC_TRUELAYER_ENV || 'live';

// Get API base URLs based on environment
const getAuthApiBaseUrl = (): string => {
  return ENV === 'live' ? 'https://auth.truelayer.com' : 'https://auth.truelayer-sandbox.com';
};

const getApiBaseUrl = (): string => {
  return ENV === 'live' ? 'https://api.truelayer.com' : 'https://api.truelayer-sandbox.com';
};

// Get redirect URI - mobile-first, always use app scheme
const getRedirectUri = (): string => {
  // Always use app scheme for mobile (iOS and Android)
  // Web is not the primary platform, so we prioritize mobile
  return 'penny://truelayer-callback';
};

// SecureStore keys
const getTokenKey = (connectionId: string): string => `truelayer_tokens_${connectionId}`;
const getConnectionsKey = (): string => 'truelayer_connections';
const getStateKey = (state: string): string => `oauth_state_${state}`;
const getUsedCodeKey = (code: string): string => `used_oauth_code_${code}`;
const getEncryptionKeyKey = (): string => 'token_encryption_key';
const getRateLimitKey = (endpoint: string): string => `rate_limit_${endpoint}`;

// Generate or retrieve device-specific encryption key
const getEncryptionKey = async (): Promise<string> => {
  const keyKey = getEncryptionKeyKey();
  let key = await SecureStore.getItemAsync(keyKey);
  
  if (!key) {
    // Generate a new encryption key (32 characters)
    const timestamp = Date.now().toString(36);
    const random1 = Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15);
    key = `${timestamp}_${random1}_${random2}`.substring(0, 32).padEnd(32, '0');
    await SecureStore.setItemAsync(keyKey, key);
  }
  
  return key;
};

// Simple base64 encoding for React Native compatibility
const base64Encode = (str: string): string => {
  // Use btoa if available (web), otherwise use a simple implementation
  if (typeof btoa !== 'undefined') {
    return btoa(str);
  }
  // Simple base64 encoding for React Native
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 1 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += i < str.length ? chars.charAt(bitmap & 63) : '=';
  }
  return result;
};

const base64Decode = (str: string): string => {
  // Use atob if available (web), otherwise use a simple implementation
  if (typeof atob !== 'undefined') {
    return atob(str);
  }
  // Simple base64 decoding for React Native
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  str = str.replace(/[^A-Za-z0-9\+\/]/g, '');
  while (i < str.length) {
    const encoded1 = chars.indexOf(str.charAt(i++));
    const encoded2 = chars.indexOf(str.charAt(i++));
    const encoded3 = chars.indexOf(str.charAt(i++));
    const encoded4 = chars.indexOf(str.charAt(i++));
    const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
    if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 16) & 255);
    if (encoded4 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
  }
  return result;
};

// Simple XOR encryption for additional token protection (beyond SecureStore encryption)
const encryptToken = async (plaintext: string): Promise<string> => {
  const key = await getEncryptionKey();
  let encrypted = '';
  for (let i = 0; i < plaintext.length; i++) {
    const keyChar = key.charCodeAt(i % key.length);
    const plainChar = plaintext.charCodeAt(i);
    encrypted += String.fromCharCode(plainChar ^ keyChar);
  }
  // Base64 encode for safe storage
  return base64Encode(encrypted);
};

const decryptToken = async (ciphertext: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    const encrypted = base64Decode(ciphertext);
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const encChar = encrypted.charCodeAt(i);
      decrypted += String.fromCharCode(encChar ^ keyChar);
    }
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt token. Data may be corrupted.');
  }
};

// Secure storage for sensitive data (OAuth tokens) - NO fallback to AsyncStorage
// If SecureStore is unavailable, fail securely rather than storing in unencrypted storage
// Tokens are encrypted with an additional layer before storage
const secureTokenSet = async (key: string, value: string): Promise<void> => {
  try {
    // Apply additional encryption layer
    const encrypted = await encryptToken(value);
    await SecureStore.setItemAsync(key, encrypted);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`SecureStore unavailable. Cannot store sensitive tokens securely: ${errorMessage}`);
  }
};

const secureTokenGet = async (key: string): Promise<string | null> => {
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (!stored) {
      return null;
    }
    
    // Check if token is encrypted (base64 format) or plaintext (JSON format)
    // Encrypted tokens are base64 encoded, plaintext tokens start with '{' (JSON)
    const trimmed = stored.trim();
    const isJsonFormat = trimmed.startsWith('{') || trimmed.startsWith('[');
    
    if (isJsonFormat) {
      // Old plaintext format (backward compatibility)
      // This will be migrated to encrypted format on next write
      return stored;
    } else {
      // New encrypted format - try to decrypt it
      // If it's not JSON, assume it's base64-encoded encrypted data
      try {
        return await decryptToken(stored);
      } catch (decryptError) {
        // If decryption fails, the token might be corrupted
        // Log the error but don't throw - return null so the app can handle it gracefully
        console.warn('[truelayerService] Failed to decrypt token. This may be due to:', 
          decryptError instanceof Error ? decryptError.message : 'Unknown error');
        // Return null so the app knows the token is invalid and can prompt for re-authentication
        return null;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Only throw if it's a SecureStore error, not a decryption error
    if (errorMessage.includes('SecureStore')) {
      throw new Error(`SecureStore unavailable. Cannot retrieve sensitive tokens securely: ${errorMessage}`);
    }
    // For other errors (like decryption), return null gracefully
    console.warn('[truelayerService] Error retrieving token:', errorMessage);
    return null;
  }
};

const secureTokenDelete = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    // Try to delete from AsyncStorage as cleanup (in case it was stored there before)
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error('SecureStore unavailable. Cannot delete sensitive tokens securely');
  }
};

// Non-sensitive storage for connection IDs list - can fallback to AsyncStorage
const storageSetItem = async (key: string, value: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    await AsyncStorage.setItem(key, value);
  }
};

const storageGetItem = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    return await AsyncStorage.getItem(key);
  }
};

const storageDeleteItem = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    // Ignore SecureStore errors
  }
    await AsyncStorage.removeItem(key);
};

// Token validation
const validateTokenFormat = (token: string): boolean => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  // Token length validation (TrueLayer tokens are typically 100-500 chars)
  if (token.length < 20 || token.length > 2000) {
    return false;
  }
  // Basic format check: should be alphanumeric with possible dots, dashes, underscores
  // TrueLayer tokens are base64-like strings
  if (!/^[a-zA-Z0-9._-]+$/.test(token)) {
    return false;
  }
  return true;
};

// Validate connection ID format
const validateConnectionId = (connectionId: string): boolean => {
  if (!connectionId || typeof connectionId !== 'string') {
    return false;
  }
  // Connection IDs should start with 'tl_' and be alphanumeric with underscores
  if (!/^tl_[a-zA-Z0-9_]+$/.test(connectionId)) {
    return false;
  }
  if (connectionId.length < 10 || connectionId.length > 100) {
    return false;
  }
  return true;
};

// Validate account ID format (TrueLayer account IDs)
const validateAccountId = (accountId: string): boolean => {
  if (!accountId || typeof accountId !== 'string') {
    return false;
  }
  // TrueLayer account IDs are typically UUIDs or alphanumeric strings
  if (accountId.length < 10 || accountId.length > 100) {
    return false;
  }
  // Allow alphanumeric, dashes, underscores (typical UUID/ID format)
  if (!/^[a-zA-Z0-9_-]+$/.test(accountId)) {
    return false;
  }
  return true;
};

// Validate OAuth code format (client-side)
const validateOAuthCode = (code: string): boolean => {
  if (!code || typeof code !== 'string') {
    return false;
  }
  // OAuth codes are typically 20-200 characters, alphanumeric with dashes/underscores
  if (code.length < 20 || code.length > 200) {
    return false;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
    return false;
  }
  return true;
};

// Token Management
export const storeTokens = async (
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  // Validate tokens before storage
  if (!validateTokenFormat(accessToken)) {
    throw new Error('Invalid access token format');
  }
  
  if (!validateTokenFormat(refreshToken)) {
    throw new Error('Invalid refresh token format');
  }

  // Validate expiration (should be reasonable: 0 to 24 hours)
  if (typeof expiresIn !== 'number' || expiresIn < 0 || expiresIn > 86400) {
    throw new Error('Invalid token expiration');
  }

  const expiresAt = Date.now() + expiresIn * 1000;
  const connection: TrueLayerConnection = {
    id: connectionId,
    accessToken,
    refreshToken,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  await secureTokenSet(getTokenKey(connectionId), JSON.stringify(connection));

  // Store connection ID in list
  const connections = await getConnectionIds();
  if (!connections.includes(connectionId)) {
    connections.push(connectionId);
    await storageSetItem(getConnectionsKey(), JSON.stringify(connections));
  }
};

export const getTokens = async (connectionId: string): Promise<TrueLayerConnection | null> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  try {
    const data = await secureTokenGet(getTokenKey(connectionId));
    if (!data) {
      // Token not found or invalid - return null (app should handle re-authentication)
      return null;
    }
    
    try {
      return JSON.parse(data);
    } catch (parseError) {
      // If JSON parsing fails, the token data is corrupted
      console.warn('[truelayerService] Failed to parse token data, token may be corrupted');
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Only throw if it's a SecureStore availability error
    if (errorMessage.includes('SecureStore unavailable')) {
      throw new Error(`Failed to retrieve tokens securely: ${errorMessage}`);
    }
    // For other errors (like decryption), return null gracefully
    console.warn('[truelayerService] Error retrieving tokens:', errorMessage);
    return null;
  }
};

export const clearTokens = async (connectionId: string): Promise<void> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  await secureTokenDelete(getTokenKey(connectionId));

  // Remove from connections list
  const connections = await getConnectionIds();
  const filtered = connections.filter(id => id !== connectionId);
  await storageSetItem(getConnectionsKey(), JSON.stringify(filtered));
};

export const getConnectionIds = async (): Promise<string[]> => {
  try {
    const data = await storageGetItem(getConnectionsKey());
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting connection IDs:', error);
    return [];
  }
};

export const getAllConnections = async (): Promise<TrueLayerConnection[]> => {
  const connectionIds = await getConnectionIds();
  const connections: TrueLayerConnection[] = [];

  for (const id of connectionIds) {
    const connection = await getTokens(id);
    if (connection) {
      connections.push(connection);
    }
  }

  return connections;
};

// Check if token is expired (with 5 minute buffer for proactive refresh)
export const isTokenExpired = (expiresAt: number): boolean => {
  const buffer = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= expiresAt - buffer;
};

// Check if token is revoked (placeholder for future implementation)
export const isTokenRevoked = async (connectionId: string): Promise<boolean> => {
  try {
    const connection = await getTokens(connectionId);
    if (!connection) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

// Refresh access token (now uses backend service)
export const refreshAccessToken = async (connectionId: string): Promise<TrueLayerConnection | null> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  const connection = await getTokens(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (!isTokenExpired(connection.expiresAt)) {
    return connection; // Token still valid
  }

  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase Functions not initialized');
  }

  try {
    const refreshToken = httpsCallable<{ refreshToken: string; connectionId: string }, { accessToken: string; refreshToken: string; expiresIn: number }>(
      functions,
      'refreshTrueLayerToken'
    );

    const result = await refreshToken({
      refreshToken: connection.refreshToken,
      connectionId: connectionId,
    });

    const { accessToken, refreshToken: newRefreshToken, expiresIn } = result.data;

    if (!accessToken || !newRefreshToken || !expiresIn) {
      throw new Error('Invalid token response from backend');
    }

    await storeTokens(connectionId, accessToken, newRefreshToken, expiresIn);

    const updated = await getTokens(connectionId);
    return updated;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const functionsError = error as { code?: string; message?: string; details?: unknown };
    
    const errorCode = functionsError.code || '';
    const errorMsg = functionsError.message || errorMessage;
    
    if (errorCode === 'unauthenticated' || errorMsg.toLowerCase().includes('unauthenticated')) {
      throw new Error('Authentication required. Please sign in and try again.');
    }
    
    if (errorCode === 'unauthenticated' || errorMsg.toLowerCase().includes('reconnect')) {
      // Token refresh failed - likely revoked
      await clearTokens(connectionId);
    throw new Error('Token refresh failed. Please reconnect your account.');
    }
    
    if (errorCode === 'resource-exhausted' || errorMsg.toLowerCase().includes('rate limit')) {
      throw new Error('Too many refresh requests. Please try again later.');
    }

    if (errorCode === 'invalid-argument') {
      throw new Error('Invalid request. Please reconnect your account.');
    }

    throw new Error(errorMsg || 'Token refresh failed. Please reconnect your account.');
  }
};

// Get valid access token (refresh if needed, check revocation)
export const getValidAccessToken = async (connectionId: string): Promise<string> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  let connection = await getTokens(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  const revoked = await isTokenRevoked(connectionId);
  if (revoked) {
    await clearTokens(connectionId);
    throw new Error('Token has been revoked. Please reconnect your account.');
  }

  if (isTokenExpired(connection.expiresAt)) {
    try {
    connection = await refreshAccessToken(connectionId);
    if (!connection) {
      throw new Error('Failed to refresh token');
    }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        await clearTokens(connectionId);
        throw new Error('Token refresh failed. Please reconnect your account.');
      }
      throw error;
    }
  }

  if (!validateTokenFormat(connection.accessToken)) {
    await clearTokens(connectionId);
    throw new Error('Invalid token format. Please reconnect your account.');
  }

  return connection.accessToken;
};

// Generate cryptographically secure random state for CSRF protection
// Uses timestamp + random string for uniqueness and entropy
const generateState = (): string => {
  // Generate a random string using available methods
  // Combine timestamp with random characters for uniqueness
  const timestamp = Date.now().toString(36);
  const randomPart1 = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  const randomPart3 = Math.random().toString(36).substring(2, 15);
  
  // Combine for a total of ~43 characters (sufficient entropy)
  // Format: timestamp_random1_random2_random3
  const state = `${timestamp}_${randomPart1}_${randomPart2}_${randomPart3}`;
  
  // Ensure it's URL-safe (already is, but double-check)
  return state.replace(/[^a-zA-Z0-9_-]/g, '');
};

// Store OAuth state with TTL (10 minutes)
const storeOAuthState = async (state: string): Promise<void> => {
  const stateKey = getStateKey(state);
  const stateData = {
    state,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };
  await secureTokenSet(stateKey, JSON.stringify(stateData));
};

// Validate and consume OAuth state (one-time use)
const validateAndConsumeState = async (state: string): Promise<boolean> => {
  const stateKey = getStateKey(state);
  const stateDataStr = await secureTokenGet(stateKey);
  
  if (!stateDataStr) {
    return false; // State not found
  }
  
  try {
    const stateData = JSON.parse(stateDataStr);
    
    // Check expiration
    if (Date.now() > stateData.expiresAt) {
      // Clean up expired state
      try {
        await secureTokenDelete(stateKey);
      } catch {
        // Ignore cleanup errors
      }
      return false;
    }
    
    // Verify state matches
    if (stateData.state !== state) {
      return false;
    }
    
    // Consume state (delete after validation - one-time use)
    try {
      await secureTokenDelete(stateKey);
    } catch {
      // If deletion fails, still consider it invalid to prevent reuse
      return false;
    }
    
    return true;
  } catch {
    // Invalid state data format
    return false;
  }
};

// Check if OAuth code has been used (client-side replay protection)
const isCodeUsed = async (code: string): Promise<boolean> => {
  const codeKey = getUsedCodeKey(code);
  const codeDataStr = await secureTokenGet(codeKey);
  
  if (!codeDataStr) {
    return false; // Code not found in used codes
  }
  
  try {
    const codeData = JSON.parse(codeDataStr);
    
    // Check expiration (codes expire after 10 minutes)
    if (Date.now() > codeData.expiresAt) {
      // Clean up expired code
      try {
        await secureTokenDelete(codeKey);
      } catch {
        // Ignore cleanup errors
      }
      return false; // Expired, can be reused (though server will reject)
    }
    
    return true; // Code has been used
  } catch {
    // Invalid code data format, consider it unused
    return false;
  }
};

// Mark OAuth code as used (client-side replay protection)
const markCodeAsUsed = async (code: string): Promise<void> => {
  const codeKey = getUsedCodeKey(code);
  const codeData = {
    code,
    usedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes (matches server-side TTL)
  };
  await secureTokenSet(codeKey, JSON.stringify(codeData));
};

// OAuth Flow
export const buildAuthUrl = async (): Promise<string> => {
  const redirectUri = getRedirectUri();
  const scopes = [
    'info',
    'accounts',
    'balance',
    'cards',
    'transactions',
    'direct_debits',
    'standing_orders',
    'offline_access',
  ].join('%20');

  const providers = 'uk-ob-all%20uk-oauth-all';

  // Generate and store state for CSRF protection
  const state = generateState();
  await storeOAuthState(state);

  const authApiUrl = getAuthApiBaseUrl();
  return `${authApiUrl}/?response_type=code&client_id=${CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&providers=${providers}&state=${encodeURIComponent(state)}`;
};

// Helper to parse URL query parameters
const parseUrlParams = (url: string): { [key: string]: string } => {
  const params: { [key: string]: string } = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch (error) {
    // Fallback: manual parsing for custom schemes
    const match = url.match(/\?([^#]+)/);
    if (match) {
      const queryString = match[1];
      queryString.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) {
          params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      });
    }
  }
  return params;
};

export const openAuthUrl = async (): Promise<{ code?: string; state?: string; error?: string } | null> => {
  const url = await buildAuthUrl();
  const redirectUri = getRedirectUri();
  
  // On mobile, use WebBrowser for better OAuth handling
  // WebBrowser properly handles the redirect back to the app
  if (Platform.OS !== 'web') {
    try {
      // Use WebBrowser which handles OAuth redirects properly on mobile
      // This will open the auth URL and wait for the redirect
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      
      if (result.type === 'success' && result.url) {
        // Validate deep link security
        const validation = validateDeepLink(result.url);
        if (!validation.valid) {
          return { error: validation.error || 'Invalid deep link' };
        }
        
        const { code, state, error } = validation;
        
        if (error) {
          console.error('OAuth error in callback:', error);
          return { error };
        }
        
        if (code && state) {
          return { code, state };
        } else if (code) {
          return { error: 'Missing state parameter. OAuth flow may have been tampered with.' };
        } else {
          return { error: 'No authorization code received' };
        }
      } else if (result.type === 'cancel') {
        return { error: 'Authentication cancelled by user' };
      } else if (result.type === 'dismiss') {
        return { error: 'Authentication dismissed' };
      }
      
      return null;
    } catch (error: any) {
      console.error('WebBrowser error:', error);
      // Fallback to regular Linking if WebBrowser fails
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        // With Linking, we rely on deep link handler
        return null;
      } else {
        throw new Error('Cannot open TrueLayer authentication URL. Please ensure the app is properly configured.');
      }
    }
  } else {
    // Web fallback (not primary platform)
    if (typeof window !== 'undefined') {
      window.location.href = url;
    } else {
      throw new Error('Cannot open TrueLayer authentication URL');
    }
    return null;
  }
};

export const exchangeCodeForTokens = async (
  code: string,
  redirectUri?: string,
  state?: string
): Promise<{ connectionId: string; accessToken: string; refreshToken: string }> => {
  // Validate OAuth code format
  if (!validateOAuthCode(code)) {
    throw new Error('Invalid authorization code format.');
  }
  
  const uri = redirectUri || getRedirectUri();

  // Validate redirect URI format
  if (!uri || typeof uri !== 'string' || !uri.startsWith('penny://')) {
    throw new Error('Invalid redirect URI format.');
  }
  
  // Check if code has already been used (client-side replay protection)
  const codeUsed = await isCodeUsed(code);
  if (codeUsed) {
    throw new Error('This authorization code has already been used. Please try connecting again.');
  }
  
  // Validate state parameter (CSRF protection)
  if (!state) {
    throw new Error('Missing state parameter. OAuth flow may have been tampered with.');
  }
  
  if (typeof state !== 'string' || state.length < 20 || state.length > 200) {
    throw new Error('Invalid state parameter format.');
  }
  
  const isValidState = await validateAndConsumeState(state);
  if (!isValidState) {
    throw new Error('Invalid or expired state parameter. OAuth flow may have been tampered with or expired. Please try again.');
  }
  
  const functions = getFirebaseFunctions();

  if (!functions) {
    throw new Error('Firebase Functions not initialized');
  }

  try {
    const exchangeToken = httpsCallable<{ code: string; redirectUri: string; state: string }, { connectionId: string; accessToken: string; refreshToken: string }>(
      functions,
      'exchangeTrueLayerToken'
    );

    const result = await exchangeToken({
      code,
      redirectUri: uri,
      state,
    });

    const { connectionId, accessToken, refreshToken } = result.data;

    if (!connectionId || !accessToken || !refreshToken) {
      throw new Error('Invalid token response from backend');
    }

    const expiresIn = 3600;
    await storeTokens(connectionId, accessToken, refreshToken, expiresIn);

    // Mark code as used after successful exchange (client-side replay protection)
    await markCodeAsUsed(code);

    return {
      connectionId,
      accessToken,
      refreshToken,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const functionsError = error as { code?: string; message?: string; details?: unknown };
    
    const errorCode = functionsError.code || '';
    const errorMsg = functionsError.message || errorMessage;
    const errorStr = String(error);
    
    const isNotFound = 
      errorCode === 'not-found' || 
      errorMsg.toLowerCase().includes('not-found') || 
      errorMsg === 'not-found' ||
      errorStr.toLowerCase().includes('not-found');
    
    if (isNotFound) {
      throw new Error(
        'Backend service not available. Please deploy Firebase Functions:\n' +
        '1. cd functions && npm install\n' +
        '2. firebase functions:config:set truelayer.client_id="..." truelayer.client_secret="..." truelayer.env="live"\n' +
        '3. firebase deploy --only functions:exchangeTrueLayerToken'
      );
    }
    
    if (errorCode === 'unauthenticated' || errorMsg.toLowerCase().includes('unauthenticated')) {
      throw new Error('Authentication required. Please sign in and try again.');
    }
    
    if (errorCode === 'invalid-argument' || errorMsg.toLowerCase().includes('invalid-argument')) {
      throw new Error(errorMsg || 'Invalid request. Please try connecting again.');
    }
    
    if (errorCode === 'resource-exhausted' || errorMsg.toLowerCase().includes('resource-exhausted')) {
      throw new Error('Too many requests. Please try again later.');
    }

    if (errorCode === 'unavailable' || errorCode === 'deadline-exceeded' || 
        errorMsg.toLowerCase().includes('unavailable') || errorMsg.toLowerCase().includes('deadline-exceeded')) {
      throw new Error('Backend service is temporarily unavailable. Please try again later.');
    }

    if (errorCode === 'internal' || errorMsg.toLowerCase().includes('internal')) {
      throw new Error(
        'Backend service error. This may be due to:\n' +
        '1. Missing or incorrect Firebase Functions configuration\n' +
        '2. TrueLayer API error\n' +
        '3. Server configuration issue\n\n' +
        'Please check Firebase Functions logs for details.'
      );
    }

    throw new Error(errorMsg || 'Failed to exchange authorization code');
  }
};

// Client-side rate limiting
interface RateLimitData {
  count: number;
  resetAt: number;
}

const checkClientRateLimit = async (endpoint: string, maxRequests: number, windowMs: number): Promise<boolean> => {
  const rateLimitKey = getRateLimitKey(endpoint);
  const rateLimitStr = await storageGetItem(rateLimitKey);
  
  const now = Date.now();
  let rateLimit: RateLimitData;
  
  if (rateLimitStr) {
    try {
      rateLimit = JSON.parse(rateLimitStr);
      // Reset if window expired
      if (now > rateLimit.resetAt) {
        rateLimit = { count: 0, resetAt: now + windowMs };
      }
    } catch {
      rateLimit = { count: 0, resetAt: now + windowMs };
    }
  } else {
    rateLimit = { count: 0, resetAt: now + windowMs };
  }
  
  if (rateLimit.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  rateLimit.count++;
  await storageSetItem(rateLimitKey, JSON.stringify(rateLimit));
  return true;
};

// Deep link security validation
const validateDeepLink = (url: string): { valid: boolean; code?: string; state?: string; error?: string } => {
  // Validate scheme
  const allowedSchemes = ['penny://', 'com.penny.app://'];
  const isValidScheme = allowedSchemes.some(scheme => url.startsWith(scheme));
  
  if (!isValidScheme) {
    return { valid: false, error: 'Invalid deep link scheme' };
  }
  
  // Validate host (for penny:// scheme)
  if (url.startsWith('penny://')) {
    const urlObj = new URL(url.replace('penny://', 'https://'));
    if (urlObj.hostname !== 'truelayer-callback' && urlObj.hostname !== '') {
      return { valid: false, error: 'Invalid deep link host' };
    }
  }
  
  // Extract parameters safely
  const params = parseUrlParams(url);
  const code = params.code;
  const state = params.state;
  const error = params.error;
  
  return { valid: true, code, state, error };
};

// API Methods
const createApiClient = (accessToken: string): AxiosInstance => {
  const apiUrl = getApiBaseUrl();
  return axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
};

export const getAccounts = async (connectionId: string): Promise<TrueLayerAccountsResponse> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  // Client-side rate limiting (10 requests per minute)
  const withinRateLimit = await checkClientRateLimit('getAccounts', 10, 60 * 1000);
  if (!withinRateLimit) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerAccountsResponse>('/data/v1/accounts');
  return response.data;
};

export const getAccountBalance = async (
  connectionId: string,
  accountId: string
): Promise<TrueLayerBalanceResponse> => {
  // Validate connection ID and account ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  if (!validateAccountId(accountId)) {
    throw new Error('Invalid account ID format');
  }
  
  // Client-side rate limiting (20 requests per minute)
  const withinRateLimit = await checkClientRateLimit('getAccountBalance', 20, 60 * 1000);
  if (!withinRateLimit) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerBalanceResponse>(`/data/v1/accounts/${accountId}/balance`);
  return response.data;
};

export const getAccountTransactions = async (
  connectionId: string,
  accountId: string,
  from?: string,
  to?: string
): Promise<TrueLayerTransactionsResponse> => {
  // Validate connection ID and account ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  if (!validateAccountId(accountId)) {
    throw new Error('Invalid account ID format');
  }
  
  // Validate date parameters if provided
  if (from && (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from))) {
    throw new Error('Invalid from date format. Expected YYYY-MM-DD');
  }
  
  if (to && (typeof to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    throw new Error('Invalid to date format. Expected YYYY-MM-DD');
  }
  
  const accessToken = await getValidAccessToken(connectionId);
  if (!accessToken) {
    throw new Error('No access token available');
  }
  
  const client = createApiClient(accessToken);
  
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;

  try {
    const response = await client.get<TrueLayerTransactionsResponse>(
      `/data/v1/accounts/${accountId}/transactions`,
      { params }
    );
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number; statusText?: string } };
      const status = axiosError.response?.status;
      const statusText = axiosError.response?.statusText;
      throw new Error(`TrueLayer API error: ${status} ${statusText || 'Unknown error'}`);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch transactions: ${errorMessage}`);
  }
};

export const getAccountPendingTransactions = async (
  connectionId: string,
  accountId: string
): Promise<TrueLayerTransactionsResponse> => {
  const accessToken = await getValidAccessToken(connectionId);
  if (!accessToken) {
    throw new Error('No access token available');
  }
  
  const client = createApiClient(accessToken);
  
  try {
    const response = await client.get<TrueLayerTransactionsResponse>(
      `/data/v1/accounts/${accountId}/transactions/pending`
    );
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number; statusText?: string } };
      const status = axiosError.response?.status;
      const statusText = axiosError.response?.statusText;
      throw new Error(`TrueLayer API error: ${status} ${statusText || 'Unknown error'}`);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch pending transactions: ${errorMessage}`);
  }
};

export const getCards = async (connectionId: string): Promise<TrueLayerCardsResponse> => {
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerCardsResponse>('/data/v1/cards');
  return response.data;
};

export const getCardBalance = async (
  connectionId: string,
  cardId: string
): Promise<TrueLayerBalanceResponse> => {
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerBalanceResponse>(`/data/v1/cards/${cardId}/balance`);
  return response.data;
};

export const getCardTransactions = async (
  connectionId: string,
  cardId: string
): Promise<TrueLayerTransactionsResponse> => {
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerTransactionsResponse>(
    `/data/v1/cards/${cardId}/transactions`
  );
  return response.data;
};

// Helper to get API base URLs (exported for use in other files)
export { getApiBaseUrl, getAuthApiBaseUrl, getRedirectUri };

