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
const CLIENT_SECRET = process.env.EXPO_PUBLIC_TRUELAYER_CLIENT_SECRET || '';
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

// Storage helpers that fallback to AsyncStorage if SecureStore is not available (Expo Go)
const storageSetItem = async (key: string, value: string): Promise<void> => {
  try {
    // Try SecureStore first (works in dev builds)
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    // Fallback to AsyncStorage for Expo Go
    console.log('SecureStore not available, using AsyncStorage fallback');
    await AsyncStorage.setItem(key, value);
  }
};

const storageGetItem = async (key: string): Promise<string | null> => {
  try {
    // Try SecureStore first (works in dev builds)
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    // Fallback to AsyncStorage for Expo Go
    return await AsyncStorage.getItem(key);
  }
};

const storageDeleteItem = async (key: string): Promise<void> => {
  try {
    // Try SecureStore first (works in dev builds)
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    // Fallback to AsyncStorage for Expo Go
    await AsyncStorage.removeItem(key);
  }
};

// Token Management
export const storeTokens = async (
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> => {
  const expiresAt = Date.now() + expiresIn * 1000;
  const connection: TrueLayerConnection = {
    id: connectionId,
    accessToken,
    refreshToken,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  await storageSetItem(getTokenKey(connectionId), JSON.stringify(connection));

  // Store connection ID in list
  const connections = await getConnectionIds();
  if (!connections.includes(connectionId)) {
    connections.push(connectionId);
    await storageSetItem(getConnectionsKey(), JSON.stringify(connections));
  }
};

export const getTokens = async (connectionId: string): Promise<TrueLayerConnection | null> => {
  try {
    const data = await storageGetItem(getTokenKey(connectionId));
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting tokens:', error);
    return null;
  }
};

export const clearTokens = async (connectionId: string): Promise<void> => {
  await storageDeleteItem(getTokenKey(connectionId));

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

// Check if token is expired (with 5 minute buffer)
export const isTokenExpired = (expiresAt: number): boolean => {
  const buffer = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= expiresAt - buffer;
};

// Refresh access token
export const refreshAccessToken = async (connectionId: string): Promise<TrueLayerConnection | null> => {
  const connection = await getTokens(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (!isTokenExpired(connection.expiresAt)) {
    return connection; // Token still valid
  }

  try {
    const authApiUrl = getAuthApiBaseUrl();
    const response = await axios.post<TrueLayerTokenResponse>(
      `${authApiUrl}/connect/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: connection.refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    await storeTokens(connectionId, access_token, refresh_token, expires_in);

    const updated = await getTokens(connectionId);
    return updated;
  } catch (error: any) {
    console.error('Error refreshing token:', error);
    // If refresh fails, the connection needs to be re-authenticated
    throw new Error('Token refresh failed. Please reconnect your account.');
  }
};

// Get valid access token (refresh if needed)
export const getValidAccessToken = async (connectionId: string): Promise<string> => {
  let connection = await getTokens(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (isTokenExpired(connection.expiresAt)) {
    connection = await refreshAccessToken(connectionId);
    if (!connection) {
      throw new Error('Failed to refresh token');
    }
  }

  return connection.accessToken;
};

// OAuth Flow
export const buildAuthUrl = (): string => {
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

  const authApiUrl = getAuthApiBaseUrl();
  return `${authApiUrl}/?response_type=code&client_id=${CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&providers=${providers}`;
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

export const openAuthUrl = async (): Promise<{ code?: string; error?: string } | null> => {
  const url = buildAuthUrl();
  const redirectUri = getRedirectUri();
  
  // On mobile, use WebBrowser for better OAuth handling
  // WebBrowser properly handles the redirect back to the app
  if (Platform.OS !== 'web') {
    try {
      // Use WebBrowser which handles OAuth redirects properly on mobile
      // This will open the auth URL and wait for the redirect
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      
      if (result.type === 'success' && result.url) {
        console.log('WebBrowser success, parsing URL:', result.url);
        // Parse the callback URL to extract the code
        const params = parseUrlParams(result.url);
        console.log('Parsed URL params:', params);
        const code = params.code;
        const error = params.error;
        
        if (error) {
          console.error('OAuth error in callback:', error);
          return { error };
        }
        
        if (code) {
          console.log('OAuth code received via WebBrowser, length:', code.length);
          return { code };
        } else {
          console.warn('No code found in callback URL');
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
  redirectUri?: string
): Promise<{ connectionId: string; accessToken: string; refreshToken: string }> => {
  const authApiUrl = getAuthApiBaseUrl();
  // Use provided redirectUri or default to mobile app scheme
  // This must match the redirect_uri used in the initial auth request
  const uri = redirectUri || getRedirectUri();

  console.log('Exchanging code for tokens:', {
    authApiUrl,
    redirectUri: uri,
    codeLength: code?.length,
    clientId: CLIENT_ID,
    clientSecretPresent: !!CLIENT_SECRET,
    clientIdLength: CLIENT_ID?.length,
  });

  try {
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: uri,
      code: code,
    });

    console.log('Token exchange request:', {
      url: `${authApiUrl}/connect/token`,
      grant_type: 'authorization_code',
      redirect_uri: uri,
      hasCode: !!code,
      client_id: CLIENT_ID,
      client_secret_length: CLIENT_SECRET?.length,
    });

    const response = await axios.post<TrueLayerTokenResponse>(
      `${authApiUrl}/connect/token`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    if (!access_token || !refresh_token) {
      throw new Error('Invalid token response from TrueLayer');
    }

    // Generate connection ID
    const connectionId = `tl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await storeTokens(connectionId, access_token, refresh_token, expires_in);

    console.log('Successfully exchanged code for tokens');

    return {
      connectionId,
      accessToken: access_token,
      refreshToken: refresh_token,
    };
  } catch (error: any) {
    console.error('Error exchanging code for tokens:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    // Provide more detailed error message
    const errorMessage = error.response?.data?.error_description 
      || error.response?.data?.error 
      || error.message 
      || 'Failed to exchange authorization code';

    throw new Error(errorMessage);
  }
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
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerAccountsResponse>('/data/v1/accounts');
  return response.data;
};

export const getAccountBalance = async (
  connectionId: string,
  accountId: string
): Promise<TrueLayerBalanceResponse> => {
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
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  
  const params: any = {};
  if (from) params.from = from;
  if (to) params.to = to;

  const response = await client.get<TrueLayerTransactionsResponse>(
    `/data/v1/accounts/${accountId}/transactions`,
    { params }
  );
  return response.data;
};

export const getAccountPendingTransactions = async (
  connectionId: string,
  accountId: string
): Promise<TrueLayerTransactionsResponse> => {
  const accessToken = await getValidAccessToken(connectionId);
  const client = createApiClient(accessToken);
  const response = await client.get<TrueLayerTransactionsResponse>(
    `/data/v1/accounts/${accountId}/transactions/pending`
  );
  return response.data;
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

