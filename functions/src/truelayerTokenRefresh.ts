/**
 * TrueLayer Token Refresh Firebase Cloud Function
 * 
 * Securely refreshes OAuth access tokens using refresh tokens.
 * Client secret is stored server-side only (Firebase Functions config).
 * 
 * Security Features:
 * - Firebase Auth verification (user must be authenticated)
 * - Strict input validation
 * - Rate limiting per user
 * - Error sanitization (no sensitive data in responses)
 * - Audit logging (no sensitive data)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface TokenRefreshRequest {
  refreshToken: string;
  connectionId: string;
}

interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface TrueLayerTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const getConfig = () => {
  const functionsConfig = functions.config();
  return {
    clientId: functionsConfig.truelayer?.client_id || '',
    clientSecret: functionsConfig.truelayer?.client_secret || '',
    env: functionsConfig.truelayer?.env || 'live',
  };
};

const getAuthApiBaseUrl = (env: string): string => {
  return env === 'live' ? 'https://auth.truelayer.com' : 'https://auth.truelayer-sandbox.com';
};

const validateRefreshToken = (refreshToken: string): boolean => {
  if (!refreshToken || typeof refreshToken !== 'string') {
    return false;
  }
  if (refreshToken.length < 20 || refreshToken.length > 2000) {
    return false;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(refreshToken)) {
    return false;
  }
  return true;
};

const validateConnectionId = (connectionId: string): boolean => {
  if (!connectionId || typeof connectionId !== 'string') {
    return false;
  }
  if (!/^tl_[a-zA-Z0-9_]+$/.test(connectionId)) {
    return false;
  }
  if (connectionId.length < 10 || connectionId.length > 100) {
    return false;
  }
  return true;
};

const checkRateLimit = async (userId: string): Promise<boolean> => {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const attempts = await db.collection('token_refresh_attempts')
      .where('userId', '==', userId)
      .where('timestamp', '>', oneHourAgo)
      .get();
    
    const maxAttempts = 10; // Higher limit for refresh (more frequent operation)
    if (attempts.size >= maxAttempts) {
      return false;
    }
    
    await db.collection('token_refresh_attempts').add({
      userId,
      timestamp: Date.now(),
    });
    
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('index') || errorMessage.includes('FAILED_PRECONDITION')) {
      console.error('Firestore index missing for rate limiting. Allowing request but index should be created.');
      return true;
    }
    throw error;
  }
};

const logSecurityEvent = async (
  eventType: string,
  userId: string,
  success: boolean,
  errorType?: string
): Promise<void> => {
  await db.collection('security_events').add({
    eventType,
    userId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    success,
    errorType: errorType || null,
  });
};

export const refreshTrueLayerToken = functions.https.onCall(
  async (data: TokenRefreshRequest, context): Promise<TokenRefreshResponse> => {
    const userId = context.auth?.uid;
    
    if (!userId) {
      await logSecurityEvent('token_refresh_attempt', 'anonymous', false, 'unauthorized');
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { refreshToken, connectionId } = data;

    if (!refreshToken || !connectionId) {
      await logSecurityEvent('token_refresh_attempt', userId, false, 'missing_parameters');
      throw new functions.https.HttpsError('invalid-argument', 'RefreshToken and connectionId are required');
    }

    if (!validateRefreshToken(refreshToken)) {
      await logSecurityEvent('token_refresh_attempt', userId, false, 'invalid_refresh_token_format');
      throw new functions.https.HttpsError('invalid-argument', 'Invalid refresh token format');
    }

    if (!validateConnectionId(connectionId)) {
      await logSecurityEvent('token_refresh_attempt', userId, false, 'invalid_connection_id_format');
      throw new functions.https.HttpsError('invalid-argument', 'Invalid connection ID format');
    }

    const withinRateLimit = await checkRateLimit(userId);
    if (!withinRateLimit) {
      await logSecurityEvent('token_refresh_attempt', userId, false, 'rate_limit_exceeded');
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    const config = getConfig();
    if (!config.clientId || !config.clientSecret) {
      await logSecurityEvent('token_refresh_attempt', userId, false, 'server_config_error');
      throw new functions.https.HttpsError('internal', 'Server configuration error');
    }

    const authApiUrl = getAuthApiBaseUrl(config.env);

    try {
      const requestBody = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
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
        await logSecurityEvent('token_refresh_attempt', userId, false, 'invalid_token_response');
        throw new functions.https.HttpsError('internal', 'Invalid token response from TrueLayer');
      }

      if (!expires_in || typeof expires_in !== 'number' || expires_in < 0 || expires_in > 86400) {
        await logSecurityEvent('token_refresh_attempt', userId, false, 'invalid_expires_in');
        throw new functions.https.HttpsError('internal', 'Invalid expiration time in token response');
      }

      await logSecurityEvent('token_refresh_success', userId, true);

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      };
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { error?: string; error_description?: string } } };
      const status = axiosError.response?.status;
      const apiError = axiosError.response?.data?.error;

      let errorType = 'unknown_error';
      if (status === 400) {
        errorType = 'invalid_request';
      } else if (status === 401) {
        errorType = 'unauthorized';
      } else if (status === 403) {
        errorType = 'forbidden';
      }

      await logSecurityEvent('token_refresh_failure', userId, false, errorType);

      // Sanitize error messages - don't expose sensitive details
      if (status === 401 || status === 403) {
        throw new functions.https.HttpsError('unauthenticated', 'Token refresh failed. Please reconnect your account.');
      }

      const userFacingMessage = apiError || 'Failed to refresh access token';
      throw new functions.https.HttpsError('internal', userFacingMessage);
    }
  }
);

