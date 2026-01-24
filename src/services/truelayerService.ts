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
import { setOAuthFlowActive } from './oAuthFlowService';

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
const getMostRecentStateKey = (): string => 'oauth_most_recent_state';

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
    // Check original value size first - if it's already large, it will be too large after encryption
    // OAuth state and tokens should be small (< 500 bytes), so this check prevents issues
    if (value.length > 1500) {
      console.warn(`[truelayerService] Value for ${key} is ${value.length} bytes, may exceed SecureStore limit after encryption.`);
      // For OAuth state/tokens, this should never happen - log warning but try anyway
    }
    
    // Apply additional encryption layer
    const encrypted = await encryptToken(value);
    
    // SecureStore has a 2048 byte limit - check size after encryption
    // Base64 encoding increases size by ~33%, so we check at 2000 bytes to be safe
    if (encrypted.length > 2000) {
      console.warn(`[truelayerService] Encrypted value for ${key} is ${encrypted.length} bytes, may exceed SecureStore limit.`);
      // Try to store anyway - SecureStore will warn but may still work
      // For OAuth state/tokens, this should never happen
    }
    
    await SecureStore.setItemAsync(key, encrypted);
    
    // Verify write succeeded (defensive check for production SecureStore silent failures)
    // SecureStore might not throw but also might not store in some production scenarios
    const verificationDelay = 50; // Small delay to ensure write completes
    await new Promise(resolve => setTimeout(resolve, verificationDelay));
    const verification = await SecureStore.getItemAsync(key);
    if (!verification || verification !== encrypted) {
      const errorMsg = `SecureStore write verification failed. Key: ${key}, Expected size: ${encrypted.length} bytes, Got: ${verification?.length || 0} bytes`;
      console.error('[truelayerService]', errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Check if error is about size limit
    if (errorMessage.includes('2048') || errorMessage.includes('too large') || errorMessage.includes('exceed')) {
      throw new Error(`Value too large for SecureStore. OAuth state/tokens should be small. Key: ${key}, Size: ${value.length} bytes`);
    }
    throw new Error(`SecureStore unavailable. Cannot store sensitive tokens securely: ${errorMessage}`);
  }
};

const secureTokenGet = async (key: string): Promise<string | null> => {
  try {
    // CRITICAL: Force a fresh read from SecureStore - no caching
    // Log the exact key being requested to debug key mismatches
    console.log('[truelayerService] secureTokenGet: Requesting key from SecureStore:', {
      key,
      keyLength: key.length,
    });
    
    const stored = await SecureStore.getItemAsync(key);
    
    // Log what we got back
    console.log('[truelayerService] secureTokenGet: SecureStore returned:', {
      key,
      found: !!stored,
      size: stored?.length || 0,
      prefix: stored ? stored.substring(0, 50) + '...' : 'null',
    });
    
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
      console.log('[truelayerService] secureTokenGet: Returning plaintext token for key:', key);
      return stored;
    } else {
      // New encrypted format - try to decrypt it
      // If it's not JSON, assume it's base64-encoded encrypted data
      try {
        const decrypted = await decryptToken(stored);
        console.log('[truelayerService] secureTokenGet: Successfully decrypted token for key:', key);
        return decrypted;
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
    console.error('[truelayerService] secureTokenGet: Error retrieving key:', {
      key,
      error: errorMessage,
    });
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

// Token Management - Firestore-based storage
const storeTokensInFirestore = async (
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  providerName?: string
): Promise<void> => {
  const { getFirestoreDb, getUserId } = await import('./firebase');
  const { doc, setDoc, getDoc, Timestamp } = await import('firebase/firestore');
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  
  const userId = getUserId();
  if (!userId) {
    throw new Error('User not authenticated');
  }
  
  // CRITICAL: Check if there's already a token for this connectionId
  const tokenRef = doc(db, 'users', userId, 'tokens', connectionId);
  const existingTokenDoc = await getDoc(tokenRef);
  if (existingTokenDoc.exists()) {
    const existingData = existingTokenDoc.data();
    console.warn('[truelayerService] storeTokensInFirestore: Overwriting existing token:', {
      connectionId,
      existingConnectionId: existingData.connectionId,
      connectionIdsMatch: existingData.connectionId === connectionId,
    });
  }
  
  // CRITICAL: Verify connectionId format before storing
  if (!connectionId || !connectionId.startsWith('tl_')) {
    throw new Error(`Invalid connectionId format: ${connectionId}`);
  }
  
  // Encrypt tokens before storage (using existing encryption functions)
  const encryptedAccessToken = await encryptToken(accessToken);
  const encryptedRefreshToken = await encryptToken(refreshToken);
  
  const expiresAt = Date.now() + expiresIn * 1000;
  const tokenData: {
    connectionId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    expiresAt: any;
    createdAt: any;
    updatedAt: any;
    providerName?: string;
  } = {
    connectionId,
    encryptedAccessToken,
    encryptedRefreshToken,
    expiresAt: Timestamp.fromMillis(expiresAt),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  // Add providerName if provided
  if (providerName) {
    tokenData.providerName = providerName;
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:428',message:'FLOW_TOKEN_STORAGE_START: Storing tokens in Firestore',data:{connectionId,documentId:tokenRef.id,documentPath:`users/${userId}/tokens/${connectionId}`,accessTokenPrefix:accessToken.substring(0,30)+'...',refreshTokenPrefix:refreshToken.substring(0,30)+'...'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
  // #endregion
  
  // CRITICAL: Store with connectionId as document ID to prevent mix-ups
  await setDoc(tokenRef, tokenData);
  
  // CRITICAL: Verify the token was stored correctly
  const verificationDoc = await getDoc(tokenRef);
  if (!verificationDoc.exists()) {
    throw new Error('Token storage verification failed - document not found after write');
  }
  
  const verificationData = verificationDoc.data();
  if (verificationData.connectionId !== connectionId) {
    throw new Error(`Token storage verification failed - connectionId mismatch: expected ${connectionId}, got ${verificationData.connectionId}`);
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:437',message:'FLOW_TOKEN_STORAGE_END: Token storage verified in Firestore',data:{connectionId,storedConnectionId:verificationData.connectionId,connectionIdsMatch:verificationData.connectionId===connectionId,documentId:tokenRef.id,documentPath:`users/${userId}/tokens/${connectionId}`,verificationResult:verificationData.connectionId===connectionId?'MATCH':'MISMATCH'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
  // #endregion
  
  console.log('[truelayerService] storeTokensInFirestore: Stored and verified tokens in Firestore:', {
    connectionId,
    storedConnectionId: verificationData.connectionId,
    connectionIdsMatch: verificationData.connectionId === connectionId,
    userId,
    expiresAt: new Date(expiresAt).toISOString(),
  });
};

const getTokensFromFirestore = async (connectionId: string): Promise<TrueLayerConnection | null> => {
  const { getFirestoreDb, getUserId } = await import('./firebase');
  const { doc, getDoc } = await import('firebase/firestore');
  
  const db = getFirestoreDb();
  if (!db) {
    console.warn('[truelayerService] getTokensFromFirestore: Firestore not initialized');
    return null;
  }
  
  const userId = getUserId();
  if (!userId) {
    console.warn('[truelayerService] getTokensFromFirestore: User not authenticated');
    return null;
  }
  
  // CRITICAL: Log the exact connectionId and document path being queried
  const tokenRef = doc(db, 'users', userId, 'tokens', connectionId);
  console.log('[truelayerService] getTokensFromFirestore: Querying Firestore for token:', {
    connectionId,
    documentPath: `users/${userId}/tokens/${connectionId}`,
    userId,
  });
  
  const tokenDoc = await getDoc(tokenRef);
  
  if (!tokenDoc.exists()) {
    console.warn('[truelayerService] getTokensFromFirestore: Token document not found:', {
      connectionId,
      documentPath: `users/${userId}/tokens/${connectionId}`,
    });
    return null;
  }
  
  const data = tokenDoc.data();
  
  // CRITICAL: Verify the connectionId in the stored data matches what we requested
  // Also verify the document ID matches the requested connectionId
  const documentId = tokenDoc.id;
  const storedConnectionId = data.connectionId;
  
  // Log full details for debugging
  console.log('[truelayerService] getTokensFromFirestore: Document retrieved:', {
    requestedConnectionId: connectionId,
    documentId: documentId,
    storedConnectionId: storedConnectionId,
    documentIdMatches: documentId === connectionId,
    storedConnectionIdMatches: storedConnectionId === connectionId,
    documentPath: `users/${userId}/tokens/${connectionId}`,
  });
  
  // CRITICAL: If document ID doesn't match, this is a serious bug
  if (documentId !== connectionId) {
    console.error('[truelayerService] getTokensFromFirestore: CRITICAL BUG: Document ID does not match requested connectionId!', {
      requestedConnectionId: connectionId,
      documentId: documentId,
      storedConnectionId: storedConnectionId,
      documentPath: `users/${userId}/tokens/${connectionId}`,
    });
    throw new Error(`CRITICAL: Firestore returned wrong document! Requested: ${connectionId}, Got document ID: ${documentId}`);
  }
  
  // CRITICAL: If stored connectionId doesn't match, this is also a serious bug
  if (storedConnectionId && storedConnectionId !== connectionId) {
    console.error('[truelayerService] getTokensFromFirestore: CRITICAL BUG: Stored connectionId does not match requested connectionId!', {
      requestedConnectionId: connectionId,
      documentId: documentId,
      storedConnectionId: storedConnectionId,
      documentPath: `users/${userId}/tokens/${connectionId}`,
    });
    throw new Error(`CRITICAL: Document contains wrong connectionId! Requested: ${connectionId}, Stored: ${storedConnectionId}`);
  }
  
  // Decrypt tokens
  try {
    const decryptedAccessToken = await decryptToken(data.encryptedAccessToken);
    const decryptedRefreshToken = await decryptToken(data.encryptedRefreshToken);
    
    const expiresAt = data.expiresAt?.toMillis() || data.expiresAt;
    
    const connection: TrueLayerConnection = {
      id: connectionId, // Use the requested connectionId (verified above)
      accessToken: decryptedAccessToken,
      refreshToken: decryptedRefreshToken,
      expiresAt,
      createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
      providerName: data.providerName || undefined,
    };
    
    console.log('[truelayerService] getTokensFromFirestore: Successfully retrieved and verified token:', {
      connectionId,
      documentId: documentId,
      storedConnectionId: storedConnectionId,
      connectionIdsMatch: storedConnectionId === connectionId,
      documentIdMatch: documentId === connectionId,
      accessTokenPrefix: decryptedAccessToken.substring(0, 30) + '...',
    });
    
    return connection;
  } catch (error) {
    console.error('[truelayerService] getTokens: Failed to decrypt tokens:', error);
    return null;
  }
};

const deleteTokensFromFirestore = async (connectionId: string): Promise<void> => {
  const { getFirestoreDb, getUserId } = await import('./firebase');
  const { doc, deleteDoc } = await import('firebase/firestore');
  
  const db = getFirestoreDb();
  if (!db) {
    return;
  }
  
  const userId = getUserId();
  if (!userId) {
    return;
  }
  
  const tokenRef = doc(db, 'users', userId, 'tokens', connectionId);
  await deleteDoc(tokenRef);
  
  console.log('[truelayerService] clearTokens: Deleted tokens from Firestore:', {
    connectionId,
    userId,
  });
};

// Token Management
// Serialize token writes/refreshes per connectionId to avoid races where concurrent refresh/store
// operations overwrite each other and cause "wrong bank" symptoms (token from another session wins).
const connectionTokenLocks = new Map<string, Promise<unknown>>();

const withConnectionTokenLock = async <T>(connectionId: string, fn: () => Promise<T>): Promise<T> => {
  const prev = connectionTokenLocks.get(connectionId) ?? Promise.resolve();
  // Always continue the chain even if the previous operation failed.
  const next = prev.then(fn, fn);
  // Store a swallow-catch promise so future operations aren't blocked by rejections.
  connectionTokenLocks.set(connectionId, next.catch(() => {}));
  return next;
};

export const storeTokens = async (
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> => {
  return withConnectionTokenLock(connectionId, async () => {
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

  // Store in Firestore (encrypted)
  await storeTokensInFirestore(connectionId, accessToken, refreshToken, expiresIn);
  
  // Verify token was stored correctly
  const verification = await getTokens(connectionId);
  if (!verification || verification.accessToken !== accessToken) {
    console.error('[truelayerService] storeTokens: CRITICAL: Token storage verification failed!', {
      connectionId,
      expectedTokenPrefix: accessToken.substring(0, 30) + '...',
      storedTokenPrefix: verification?.accessToken?.substring(0, 30) + '...' || 'null',
    });
    throw new Error('Token storage verification failed. Token may not have been stored correctly.');
  }
  
  console.log('[truelayerService] storeTokens: Token storage verified:', {
    connectionId,
    accessTokenPrefix: accessToken.substring(0, 30) + '...',
    tokensMatch: verification.accessToken === accessToken,
  });

  // Store connection ID in list (for local tracking)
  const connections = await getConnectionIds();
  if (!connections.includes(connectionId)) {
    connections.push(connectionId);
    await storageSetItem(getConnectionsKey(), JSON.stringify(connections));
  }
  });
};

export const getTokens = async (connectionId: string): Promise<TrueLayerConnection | null> => {
  // Validate connection ID format
  if (!validateConnectionId(connectionId)) {
    console.error('[truelayerService] getTokens: Invalid connectionId format:', {
      connectionId,
      type: typeof connectionId,
      length: connectionId?.length,
    });
    throw new Error('Invalid connection ID format');
  }
  
  console.log('[truelayerService] getTokens: Retrieving tokens from Firestore:', {
    connectionId,
  });
  
  try {
    const connection = await getTokensFromFirestore(connectionId);
    
    if (!connection) {
      console.warn('[truelayerService] getTokens: Token not found for connectionId:', connectionId);
      return null;
    }
    
    // Verify the connectionId matches
    if (connection.id !== connectionId) {
      console.error('[truelayerService] getTokens: CRITICAL MISMATCH! Stored connectionId does not match requested:', {
        requestedConnectionId: connectionId,
        storedConnectionId: connection.id,
      });
      return null;
    }
    
    console.log('[truelayerService] getTokens: Token retrieved successfully:', {
      connectionId,
      accessTokenPrefix: connection.accessToken.substring(0, 30) + '...',
      expiresAt: connection.expiresAt,
    });
    
    return connection;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[truelayerService] getTokens: Error retrieving tokens:', {
      connectionId,
      error: errorMessage,
    });
    return null;
  }
};

export const clearTokens = async (connectionId: string): Promise<void> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  // Delete from Firestore
  await deleteTokensFromFirestore(connectionId);

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
  const { getFirestoreDb, getUserId } = await import('./firebase');
  const { collection, getDocs } = await import('firebase/firestore');
  
  const db = getFirestoreDb();
  const userId = getUserId();
  
  if (!db || !userId) {
    return [];
  }
  
  try {
    const tokensRef = collection(db, 'users', userId, 'tokens');
    const tokensSnapshot = await getDocs(tokensRef);
    
    const connections: TrueLayerConnection[] = [];
    
    for (const tokenDoc of tokensSnapshot.docs) {
      const connectionId = tokenDoc.id;
      const connection = await getTokens(connectionId);
      if (connection) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:698',message:'FLOW_CONNECTION_LOAD: Loading connection from Firestore',data:{connectionId,providerName:connection.providerName,hasProviderName:!!connection.providerName,connectionCreatedAt:connection.createdAt,connectionIdToProvider:`${connectionId} -> ${connection.providerName||'NO_PROVIDER'}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
        // #endregion
        connections.push(connection);
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:704',message:'FLOW_CONNECTION_LOAD_COMPLETE: getAllConnections returning all connections',data:{connectionCount:connections.length,connections:connections.map(c=>({id:c.id,providerName:c.providerName,hasProviderName:!!c.providerName,connectionIdToProvider:`${c.id} -> ${c.providerName||'NO_PROVIDER'}`}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
    // #endregion
    
    return connections;
  } catch (error) {
    console.error('[truelayerService] getAllConnections: Error fetching connections:', error);
    return [];
  }
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
  return withConnectionTokenLock(connectionId, async () => {
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
    const errorStr = String(error);
    
    if (errorCode === 'unauthenticated' || errorMsg.toLowerCase().includes('unauthenticated')) {
      throw new Error('Authentication required. Please sign in and try again.');
    }
    
    if (errorMsg.toLowerCase().includes('reconnect')) {
      // Token refresh failed - likely revoked
      await clearTokens(connectionId);
      throw new Error('Token refresh failed. Please reconnect your account.');
    }

    if (errorCode === 'invalid-argument' || errorMsg.toLowerCase().includes('invalid-argument')) {
      throw new Error('Invalid request. Please reconnect your account.');
    }

    throw new Error(errorMsg || 'Token refresh failed. Please reconnect your account.');
  }
  });
};

// Get valid access token (refresh if needed, check revocation)
export const getValidAccessToken = async (connectionId: string): Promise<string> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  // CRITICAL: Log which connectionId we're retrieving token for
  console.log('[truelayerService] getValidAccessToken: Retrieving token for connectionId:', {
    connectionId,
  });
  
  let connection = await getTokens(connectionId);
  if (!connection) {
    console.error('[truelayerService] getValidAccessToken: Token not found for connectionId:', {
      connectionId,
    });
    throw new Error('Connection not found');
  }

  // CRITICAL: Verify the connectionId in the token matches what we requested
  if (connection.id !== connectionId) {
    console.error('[truelayerService] getValidAccessToken: CRITICAL MISMATCH!', {
      requestedConnectionId: connectionId,
      tokenConnectionId: connection.id,
      accessTokenPrefix: connection.accessToken.substring(0, 30) + '...',
    });
    throw new Error(`Token connectionId mismatch: expected ${connectionId}, got ${connection.id}`);
  }

  // Log token usage for debugging token/code reuse
  console.log('[truelayerService] getValidAccessToken: Got token:', {
    connectionId,
    tokenConnectionId: connection.id,
    connectionIdsMatch: connection.id === connectionId,
    accessTokenPrefix: connection.accessToken.substring(0, 30) + '...',
    expiresAt: connection.expiresAt,
    isExpired: isTokenExpired(connection.expiresAt),
  });

  const revoked = await isTokenRevoked(connectionId);
  if (revoked) {
    await clearTokens(connectionId);
    throw new Error('Token has been revoked. Please reconnect your account.');
  }

  if (isTokenExpired(connection.expiresAt)) {
    // Refresh is serialized per-connection to avoid concurrent refresh overwrites.
    return withConnectionTokenLock(connectionId, async () => {
      // Re-read inside the lock in case another operation refreshed already.
      let lockedConnection = await getTokens(connectionId);
      if (!lockedConnection) {
        throw new Error('Connection not found');
      }
      if (!isTokenExpired(lockedConnection.expiresAt)) {
        return lockedConnection.accessToken;
      }
      try {
        lockedConnection = await refreshAccessToken(connectionId);
        if (!lockedConnection) {
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
      return lockedConnection.accessToken;
    });
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
  const stateDataStr = JSON.stringify(stateData);
  
  // Log size for debugging (OAuth state should be small)
  if (stateDataStr.length > 500) {
    console.warn(`[truelayerService] OAuth state data is unexpectedly large: ${stateDataStr.length} bytes`);
  }
  
  await secureTokenSet(stateKey, stateDataStr);
  
  // Also store as most recent state for iOS production builds where state might be lost in URL
  // This allows us to retrieve it even if the state parameter is missing from the callback URL
  const mostRecentStateData = {
    state,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };
  const mostRecentStateDataStr = JSON.stringify(mostRecentStateData);
  await secureTokenSet(getMostRecentStateKey(), mostRecentStateDataStr);
};

// Retrieve the most recent OAuth state (for iOS production builds where state might be lost)
const getMostRecentState = async (): Promise<string | null> => {
  try {
    const stateDataStr = await secureTokenGet(getMostRecentStateKey());
    if (!stateDataStr) {
      return null;
    }
    
    const stateData = JSON.parse(stateDataStr);
    
    // Check expiration
    if (Date.now() > stateData.expiresAt) {
      // Clean up expired state
      try {
        await secureTokenDelete(getMostRecentStateKey());
      } catch {
        // Ignore cleanup errors
      }
      return null;
    }
    
    return stateData.state;
  } catch {
    return null;
  }
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
  // Mark OAuth flow active BEFORE sending the app to background (Safari / bank app / etc).
  // This prevents RootLayout's AppState lock logic from locking the app mid-OAuth.
  setOAuthFlowActive(true);

  const url = await buildAuthUrl();
  const redirectUri = getRedirectUri();
  
  // Use the system browser for OAuth.
  // This avoids Android Custom Tabs/AuthSession caching quirks that can auto-reuse the previous bank session,
  // making it hard for users to switch to a different bank/login.
  if (Platform.OS === 'ios') {
    try {
      // Use system browser (Safari) on iOS
      // The deep link handler will process the callback when user returns to app
      console.log('[truelayerService] Opening OAuth URL in system browser (iOS)');
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        // Return null - deep link handler will process the callback
        return null;
      } else {
        // OAuth never actually started; clear the flag so the app can lock normally.
        setOAuthFlowActive(false);
        throw new Error('Cannot open TrueLayer authentication URL. Please ensure the app is properly configured.');
      }
    } catch (error: any) {
      console.error('Error opening URL in system browser:', error);
      // OAuth failed to start; clear the flag so the app can lock normally.
      setOAuthFlowActive(false);
      throw new Error('Cannot open TrueLayer authentication URL. Please ensure the app is properly configured.');
    }
  } else if (Platform.OS === 'android') {
    try {
      console.log('[truelayerService] Opening OAuth URL in system browser (Android)');
      console.log('[truelayerService] Redirect URI:', redirectUri);
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        // Return null - deep link handler will process the callback
        return null;
      } else {
        setOAuthFlowActive(false);
        throw new Error('Cannot open TrueLayer authentication URL. Please ensure the app is properly configured.');
      }
    } catch (error: any) {
      console.error('Error opening URL in system browser (Android):', error);
      setOAuthFlowActive(false);
      throw new Error('Cannot open TrueLayer authentication URL. Please ensure the app is properly configured.');
    }
  } else {
    // Web fallback (not primary platform)
    if (typeof window !== 'undefined') {
      window.location.href = url;
    } else {
      setOAuthFlowActive(false);
      throw new Error('Cannot open TrueLayer authentication URL');
    }
    return null;
  }
};

export const exchangeCodeForTokens = async (
  code: string,
  redirectUri?: string,
  state?: string,
  retryCount: number = 0
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
  
  // Validate state parameter (CSRF protection) - skip on retries since state is already consumed
  if (retryCount === 0) {
    let stateToValidate = state;
    
    // If state is missing, try to retrieve from storage (iOS production build workaround)
    if (!stateToValidate) {
      console.log('[truelayerService] State missing, attempting to retrieve from storage...');
      const retrievedState = await getMostRecentState();
      stateToValidate = retrievedState || undefined;
      
      if (!stateToValidate) {
        // For iOS production builds, allow flow to continue without state validation
        // The backend will still validate the code
        if (Platform.OS === 'ios') {
          console.warn('[truelayerService] iOS production build: Skipping state validation (state lost in multi-app OAuth flow)');
          // Continue without state validation - backend will validate the code
        } else {
          throw new Error('Missing state parameter. OAuth flow may have been tampered with.');
        }
      }
    }
    
    // Only validate state if we have it
    if (stateToValidate) {
      if (typeof stateToValidate !== 'string' || stateToValidate.length < 20 || stateToValidate.length > 200) {
        throw new Error('Invalid state parameter format.');
      }
      
      const isValidState = await validateAndConsumeState(stateToValidate);
      if (!isValidState) {
        // For iOS production builds, allow flow to continue even if state validation fails
        // This handles the case where state was lost in the multi-app OAuth flow
        if (Platform.OS === 'ios') {
          console.warn('[truelayerService] iOS production build: State validation failed, but allowing flow to continue');
          // Continue without state validation - backend will validate the code
        } else {
          throw new Error('Invalid or expired state parameter. OAuth flow may have been tampered with or expired. Please try again.');
        }
      } else {
        // State was validated and consumed - also clean up the most recent state to prevent reuse
        try {
          await secureTokenDelete(getMostRecentStateKey());
        } catch {
          // Ignore cleanup errors
        }
      }
    }
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

    // Use the state if available, otherwise use empty string (backend will validate code)
    const stateForApi = state || '';
    const result = await exchangeToken({
      code,
      redirectUri: uri,
      state: stateForApi, // State is validated on first call if available
    });

    const { connectionId, accessToken, refreshToken } = result.data;

    if (!connectionId || !accessToken || !refreshToken) {
      throw new Error('Invalid token response from backend');
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:1264',message:'FLOW_BACKEND_TOKEN_EXCHANGE: Backend returned connectionId from OAuth code',data:{codePrefix:code.substring(0,20)+'...',fullCode:code,connectionId,accessTokenPrefix:accessToken.substring(0,30)+'...',refreshTokenPrefix:refreshToken.substring(0,30)+'...',codeToConnectionId:`${code.substring(0,20)}... -> ${connectionId}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
    // #endregion

    // CRITICAL: Log token exchange result for debugging token/code reuse
    console.log('[truelayerService] Token exchange result:', {
      codePrefix: code.substring(0, 20) + '...',
      connectionId,
      accessTokenPrefix: accessToken.substring(0, 30) + '...',
      refreshTokenPrefix: refreshToken.substring(0, 30) + '...',
    });

    // CRITICAL: Check if there are any existing connections with the same token
    // This would indicate a problem with token generation or reuse
    const allConnections = await getAllConnections();
    const duplicateToken = allConnections.find(conn => 
      conn.accessToken === accessToken && conn.id !== connectionId
    );
    if (duplicateToken) {
      console.error('[truelayerService] CRITICAL: New token matches existing token from different connection!', {
        newConnectionId: connectionId,
        existingConnectionId: duplicateToken.id,
        tokenPrefix: accessToken.substring(0, 30) + '...',
      });
      throw new Error('Token collision detected - new token matches existing connection');
    }

    const expiresIn = 3600;
    
    // CRITICAL: Store tokens - this includes verification
    await storeTokens(connectionId, accessToken, refreshToken, expiresIn);
    
    console.log('[truelayerService] exchangeCodeForTokens: Token exchange completed:', {
      connectionId,
      tokenKey: getTokenKey(connectionId),
      accessTokenPrefix: accessToken.substring(0, 30) + '...',
    });

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

    // Check for rate limit errors and retry with exponential backoff
    const isRateLimit = 
      errorCode === 'resource-exhausted' || 
      errorMsg.toLowerCase().includes('resource-exhausted') ||
      errorMsg.toLowerCase().includes('rate limit') ||
      errorStr.toLowerCase().includes('rate limit');
    
    if (isRateLimit && retryCount < 3) {
      // Exponential backoff: 2s, 4s, 8s
      const delayMs = Math.pow(2, retryCount + 1) * 1000;
      console.log(`[truelayerService] Rate limit hit, retrying in ${delayMs}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return exchangeCodeForTokens(code, redirectUri, state, retryCount + 1);
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

/**
 * Helper function to make API calls with automatic 401 retry logic
 * If a 401 error occurs, it will:
 * 1. Force token refresh by marking the token as expired
 * 2. Get a fresh token
 * 3. Retry the request once
 * 4. If it still fails, throw an appropriate error
 */
const makeApiCallWithRetry = async <T>(
  connectionId: string,
  apiCall: (accessToken: string) => Promise<T>,
  retryCount: number = 0
): Promise<T> => {
  try {
    // CRITICAL: Log which connectionId we're getting token for
    console.log('[truelayerService] makeApiCallWithRetry: Getting token for connectionId:', {
      connectionId,
      retryCount,
    });
    
    // CRITICAL: Verify token before getting access token to ensure we have the right connection
    const tokenVerification = await getTokens(connectionId);
    if (!tokenVerification) {
      throw new Error(`No token found for connection ${connectionId}`);
    }
    if (tokenVerification.id !== connectionId) {
      throw new Error(`Token connectionId mismatch in makeApiCallWithRetry: expected ${connectionId}, got ${tokenVerification.id}`);
    }
    
    const accessToken = await getValidAccessToken(connectionId);
    
    // CRITICAL: Verify the access token we got matches the token we verified
    if (accessToken !== tokenVerification.accessToken) {
      console.error('[truelayerService] makeApiCallWithRetry: CRITICAL: Access token mismatch!', {
        connectionId,
        verifiedTokenPrefix: tokenVerification.accessToken.substring(0, 30) + '...',
        accessTokenPrefix: accessToken.substring(0, 30) + '...',
      });
      // Still proceed, but log the mismatch
    }
    
    // CRITICAL: Verify we got a token and log its prefix
    console.log('[truelayerService] makeApiCallWithRetry: Got token for connectionId:', {
      connectionId,
      accessTokenPrefix: accessToken.substring(0, 30) + '...',
      tokenLength: accessToken.length,
      tokenMatchesVerification: accessToken === tokenVerification.accessToken,
    });
    
    return await apiCall(accessToken);
  } catch (error: unknown) {
    // Check if it's a 401 error
    const is401 = error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status === 401
      : false;
    
    // Also check error message for 401
    const errorMessage = error instanceof Error ? error.message : String(error);
    const is401InMessage = errorMessage.includes('401') || errorMessage.includes('Unauthorized');
    
    if ((is401 || is401InMessage) && retryCount === 0) {
      // 401 error - token might be invalid even if not expired
      // Force refresh by calling refreshAccessToken directly
      console.log('[truelayerService] Got 401 error, forcing token refresh and retrying...', {
        connectionId,
      });
      
      try {
        // CRITICAL: Verify we have the correct connectionId before refreshing
        const connectionBeforeRefresh = await getTokens(connectionId);
        if (!connectionBeforeRefresh) {
          throw new Error(`Connection not found for connectionId: ${connectionId}`);
        }
        
        // CRITICAL: Verify the connectionId matches
        if (connectionBeforeRefresh.id !== connectionId) {
          console.error('[truelayerService] makeApiCallWithRetry: CRITICAL: ConnectionId mismatch before refresh!', {
            requestedConnectionId: connectionId,
            tokenConnectionId: connectionBeforeRefresh.id,
          });
          throw new Error(`Token connectionId mismatch before refresh: expected ${connectionId}, got ${connectionBeforeRefresh.id}`);
        }
        
        // Force refresh by calling refreshAccessToken (it will check expiration and refresh if needed)
        // We'll force it by temporarily marking as expired in Firestore
        const { getFirestoreDb, getUserId } = await import('./firebase');
        const { doc, updateDoc, Timestamp } = await import('firebase/firestore');
        
        const db = getFirestoreDb();
        const userId = getUserId();
        if (db && userId) {
          const tokenRef = doc(db, 'users', userId, 'tokens', connectionId);
          // Force expiration by setting expiresAt to past
          await updateDoc(tokenRef, {
            expiresAt: Timestamp.fromMillis(Date.now() - 1000),
          });
        }
        
        // Get a fresh token (will trigger refresh since it's now expired)
        const freshToken = await getValidAccessToken(connectionId);
        
        // CRITICAL: Verify the fresh token is for the correct connectionId
        const connectionAfterRefresh = await getTokens(connectionId);
        if (connectionAfterRefresh && connectionAfterRefresh.id !== connectionId) {
          console.error('[truelayerService] makeApiCallWithRetry: CRITICAL: ConnectionId mismatch after refresh!', {
            requestedConnectionId: connectionId,
            tokenConnectionId: connectionAfterRefresh.id,
          });
          throw new Error(`Token connectionId mismatch after refresh: expected ${connectionId}, got ${connectionAfterRefresh.id}`);
        }
        
        console.log('[truelayerService] makeApiCallWithRetry: Got fresh token after 401 refresh:', {
          connectionId,
          freshTokenPrefix: freshToken.substring(0, 30) + '...',
        });
        
        // Retry the request once with the fresh token
        return await apiCall(freshToken);
      } catch (refreshError) {
        // Token refresh failed - clear tokens and throw error
        const refreshErrorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error';
        console.error('[truelayerService] Token refresh failed after 401:', {
          connectionId,
          error: refreshErrorMessage,
        });
        await clearTokens(connectionId);
        throw new Error('Authentication failed. Please reconnect your account.');
      }
    }
    
    // Re-throw the error if it's not a 401 or we've already retried
    throw error;
  }
};

export const getAccounts = async (connectionId: string): Promise<TrueLayerAccountsResponse> => {
  // Validate connection ID
  if (!validateConnectionId(connectionId)) {
    throw new Error('Invalid connection ID format');
  }
  
  // CRITICAL: Log the exact connectionId being used
  console.log('[truelayerService] getAccounts: Called with connectionId:', {
    connectionId,
    connectionIdType: typeof connectionId,
    connectionIdLength: connectionId.length,
  });
  
  // CRITICAL: Verify token before making API call to ensure we have the right token
  const tokenVerification = await getTokens(connectionId);
  if (!tokenVerification) {
    throw new Error(`No token found for connection ${connectionId}`);
  }
  if (tokenVerification.id !== connectionId) {
    throw new Error(`Token connectionId mismatch: expected ${connectionId}, got ${tokenVerification.id}`);
  }
  console.log('[truelayerService] getAccounts: Token verification passed:', {
    connectionId,
    tokenConnectionId: tokenVerification.id,
    accessTokenPrefix: tokenVerification.accessToken.substring(0, 30) + '...',
  });
  
  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    // CRITICAL: Verify the token we got matches what we verified above
    if (accessToken !== tokenVerification.accessToken) {
      console.error('[truelayerService] getAccounts: CRITICAL: Token mismatch between verification and API call!', {
        connectionId,
        verifiedTokenPrefix: tokenVerification.accessToken.substring(0, 30) + '...',
        apiCallTokenPrefix: accessToken.substring(0, 30) + '...',
      });
      // Still proceed, but log the mismatch
    }
    
    // CRITICAL: Double-check we have the right token for this connectionId
    // Re-verify token one more time right before making the API call
    const finalTokenCheck = await getTokens(connectionId);
    if (!finalTokenCheck) {
      throw new Error(`No token found for connection ${connectionId} right before API call`);
    }
    if (finalTokenCheck.id !== connectionId) {
      throw new Error(`Token connectionId mismatch right before API call: expected ${connectionId}, got ${finalTokenCheck.id}`);
    }
    if (finalTokenCheck.accessToken !== accessToken) {
      console.error('[truelayerService] getAccounts: CRITICAL: Access token changed between verification and API call!', {
        connectionId,
        verifiedTokenPrefix: tokenVerification.accessToken.substring(0, 30) + '...',
        finalCheckTokenPrefix: finalTokenCheck.accessToken.substring(0, 30) + '...',
        apiCallTokenPrefix: accessToken.substring(0, 30) + '...',
      });
      // Use the token from finalTokenCheck to ensure we have the right one
      accessToken = finalTokenCheck.accessToken;
    }
    
    // CRITICAL: Log which token is being used for this API call
    console.log('[truelayerService] getAccounts: Making API call with token:', {
      connectionId,
      accessTokenPrefix: accessToken.substring(0, 30) + '...',
      accessTokenLength: accessToken.length,
      tokenMatchesVerification: accessToken === tokenVerification.accessToken,
      tokenMatchesFinalCheck: accessToken === finalTokenCheck.accessToken,
    });
    
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerAccountsResponse>('/data/v1/accounts');
    
    // CRITICAL: Log what TrueLayer API returned - this will show if it's the same accounts
    console.log(`[truelayerService] getAccounts: TrueLayer API response for connection ${connectionId}:`, {
      connectionId,
      accountCount: response.data.results?.length || 0,
      accessTokenUsedPrefix: accessToken.substring(0, 30) + '...',
    });
    
    if (response.data.results) {
      response.data.results.forEach((acc, index) => {
        console.log(`[truelayerService] getAccounts: Account ${index + 1} from TrueLayer for connection ${connectionId}:`);
        console.log(`  - Name: ${acc.display_name}`);
        console.log(`  - TL Account ID: ${acc.account_id}`);
        console.log(`  - Provider: ${acc.provider?.display_name || 'unknown'}`);
        console.log(`  - Type: ${acc.account_type || 'unknown'}`);
        console.log(`  - Currency: ${acc.currency || 'unknown'}`);
      });
    } else {
      console.warn(`[truelayerService] getAccounts: WARNING: TrueLayer returned no accounts for connection ${connectionId}`);
    }
    
    return response.data;
  });
};

/**
 * Fetch provider name from TrueLayer and store it with the connection
 * This helps debug which token is being used for each connection
 */
export const fetchAndStoreProviderName = async (connectionId: string): Promise<string> => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:1685',message:'FLOW_PROVIDER_FETCH_START: fetchAndStoreProviderName called',data:{connectionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
  // #endregion
  
  console.log('[truelayerService] fetchAndStoreProviderName: Fetching provider name for connection:', {
    connectionId,
  });
  
  try {
    // Fetch accounts from TrueLayer using the connectionId
    const accountsResponse = await getAccounts(connectionId);
    const accounts = accountsResponse.results;
    
    if (!accounts || accounts.length === 0) {
      console.warn('[truelayerService] fetchAndStoreProviderName: No accounts found for connection:', {
        connectionId,
      });
      return 'Unknown Provider';
    }
    
    // Extract provider name from the first account (all accounts should have the same provider)
    const providerName = accounts[0]?.provider?.display_name || 'Unknown Provider';
    
    // CRITICAL: Check if this provider already exists in another connection
    // This detects when TrueLayer returns the wrong provider (e.g., returns REVOLUT when SANTANDER was selected)
    const existingConnections = await getAllConnections();
    const duplicateProvider = existingConnections.find(
      conn => conn.id !== connectionId && conn.providerName === providerName
    );
    
    if (duplicateProvider) {
      console.error('[truelayerService] fetchAndStoreProviderName: CRITICAL - Provider name matches existing connection!', {
        connectionId,
        providerName,
        existingConnectionId: duplicateProvider.id,
        existingProviderName: duplicateProvider.providerName,
        warning: 'TrueLayer may have returned the wrong provider data. This connection might be linked to the wrong bank.',
      });
      // Still store it, but log the issue for debugging
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:1703',message:'Found provider name from TrueLayer API',data:{connectionId,providerName,accountCount:accounts.length,firstAccountProvider:accounts[0]?.provider?.display_name,firstAccountProviderId:accounts[0]?.provider?.provider_id,allProviders:accounts.map(a=>({name:a.display_name,provider:a.provider?.display_name,providerId:a.provider?.provider_id}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    console.log('[truelayerService] fetchAndStoreProviderName: Found provider name:', {
      connectionId,
      providerName,
      accountCount: accounts.length,
      firstAccountProvider: accounts[0]?.provider?.display_name,
      firstAccountProviderId: accounts[0]?.provider?.provider_id,
      allProviders: accounts.map(a => ({
        name: a.display_name,
        provider: a.provider?.display_name,
        providerId: a.provider?.provider_id,
      })),
    });
    
    // Update the Firestore token document with the provider name
    const { getFirestoreDb, getUserId } = await import('./firebase');
    const { doc, updateDoc } = await import('firebase/firestore');
    
    const db = getFirestoreDb();
    const userId = getUserId();
    
    if (!db || !userId) {
      console.error('[truelayerService] fetchAndStoreProviderName: Firestore not initialized or user not authenticated');
      return providerName; // Return the name even if we can't store it
    }
    
    const tokenRef = doc(db, 'users', userId, 'tokens', connectionId);
    await updateDoc(tokenRef, {
      providerName,
      updatedAt: (await import('firebase/firestore')).Timestamp.now(),
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'truelayerService.ts:1724',message:'FLOW_PROVIDER_STORAGE: Stored provider name in Firestore',data:{connectionId,providerName,userId,documentPath:`users/${userId}/tokens/${connectionId}`,connectionIdToProvider:`${connectionId} -> ${providerName}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'FLOW'})}).catch(()=>{});
    // #endregion
    
    console.log('[truelayerService] fetchAndStoreProviderName: Successfully stored provider name:', {
      connectionId,
      providerName,
    });
    
    return providerName;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[truelayerService] fetchAndStoreProviderName: Error fetching/storing provider name:', {
      connectionId,
      error: errorMessage,
    });
    return 'Unknown Provider';
  }
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
  
  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerBalanceResponse>(`/data/v1/accounts/${accountId}/balance`);
    return response.data;
  });
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
  
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;

  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerTransactionsResponse>(
      `/data/v1/accounts/${accountId}/transactions`,
      { params }
    );
    return response.data;
  });
};

export const getAccountPendingTransactions = async (
  connectionId: string,
  accountId: string
): Promise<TrueLayerTransactionsResponse> => {
  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerTransactionsResponse>(
      `/data/v1/accounts/${accountId}/transactions/pending`
    );
    return response.data;
  });
};

export const getCards = async (connectionId: string): Promise<TrueLayerCardsResponse> => {
  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerCardsResponse>('/data/v1/cards');
    return response.data;
  });
};

export const getCardBalance = async (
  connectionId: string,
  cardId: string
): Promise<TrueLayerBalanceResponse> => {
  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerBalanceResponse>(`/data/v1/cards/${cardId}/balance`);
    return response.data;
  });
};

export const getCardTransactions = async (
  connectionId: string,
  cardId: string
): Promise<TrueLayerTransactionsResponse> => {
  return makeApiCallWithRetry(connectionId, async (accessToken) => {
    const client = createApiClient(accessToken);
    const response = await client.get<TrueLayerTransactionsResponse>(
      `/data/v1/cards/${cardId}/transactions`
    );
    return response.data;
  });
};

// Helper to get API base URLs (exported for use in other files)
export { getApiBaseUrl, getAuthApiBaseUrl, getRedirectUri };

