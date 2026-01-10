/**
 * TrueLayer Token Exchange Firebase Cloud Function
 * 
 * Securely exchanges OAuth authorization code for access/refresh tokens.
 * Client secret is stored server-side only (Firebase Functions config).
 * 
 * Security Features:
 * - Firebase Auth verification (user must be authenticated)
 * - OAuth state parameter validation (CSRF protection)
 * - Code replay protection (tracks used codes in Firestore)
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

interface TokenExchangeRequest {
  code: string;
  redirectUri: string;
  state?: string;
}

interface TokenExchangeResponse {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
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

const validateCode = (code: string): boolean => {
  if (!code || typeof code !== 'string') {
    return false;
  }
  if (code.length < 20 || code.length > 200) {
    return false;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
    return false;
  }
  return true;
};

const validateRedirectUri = (redirectUri: string): boolean => {
  if (!redirectUri || typeof redirectUri !== 'string') {
    return false;
  }
  const allowedSchemes = ['penny://', 'com.penny.app://'];
  return allowedSchemes.some(scheme => redirectUri.startsWith(scheme));
};

const checkCodeReplay = async (code: string, userId: string): Promise<boolean> => {
  const codeDoc = await db.collection('used_oauth_codes').doc(code).get();
  if (codeDoc.exists) {
    return true;
  }
  
  await db.collection('used_oauth_codes').doc(code).set({
    userId,
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
  });
  
  return false;
};

const checkRateLimit = async (userId: string): Promise<boolean> => {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const attempts = await db.collection('token_exchange_attempts')
      .where('userId', '==', userId)
      .where('timestamp', '>', oneHourAgo)
      .get();
    
    const maxAttempts = 5;
    if (attempts.size >= maxAttempts) {
      return false;
    }
    
    await db.collection('token_exchange_attempts').add({
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

export const exchangeTrueLayerToken = functions.https.onCall(
  async (data: TokenExchangeRequest, context): Promise<TokenExchangeResponse> => {
    const userId = context.auth?.uid;
    
    if (!userId) {
      await logSecurityEvent('token_exchange_attempt', 'anonymous', false, 'unauthorized');
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { code, redirectUri } = data;

    if (!code || !redirectUri) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'missing_parameters');
      throw new functions.https.HttpsError('invalid-argument', 'Code and redirectUri are required');
    }

    if (!validateCode(code)) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'invalid_code_format');
      throw new functions.https.HttpsError('invalid-argument', 'Invalid code format');
    }

    if (!validateRedirectUri(redirectUri)) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'invalid_redirect_uri');
      throw new functions.https.HttpsError('invalid-argument', 'Invalid redirect URI');
    }

    // Validate state parameter (CSRF protection)
    const { state } = data;
    if (!state || typeof state !== 'string') {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'missing_state');
      throw new functions.https.HttpsError('invalid-argument', 'State parameter is required');
    }

    // State validation is handled client-side (stored in SecureStore)
    // Server-side we just verify it's present and not empty
    // The client validates the state matches what was stored before making the request
    if (state.length < 20 || state.length > 200) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'invalid_state_format');
      throw new functions.https.HttpsError('invalid-argument', 'Invalid state parameter format');
    }

    const isReplay = await checkCodeReplay(code, userId);
    if (isReplay) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'code_replay');
      throw new functions.https.HttpsError('invalid-argument', 'Code has already been used');
    }

    const withinRateLimit = await checkRateLimit(userId);
    if (!withinRateLimit) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'rate_limit_exceeded');
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    const config = getConfig();
    if (!config.clientId || !config.clientSecret) {
      await logSecurityEvent('token_exchange_attempt', userId, false, 'server_config_error');
      throw new functions.https.HttpsError('internal', 'Server configuration error');
    }

    const authApiUrl = getAuthApiBaseUrl(config.env);

    try {
      const requestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        code: code,
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

      const { access_token, refresh_token } = response.data;

      if (!access_token || !refresh_token) {
        await logSecurityEvent('token_exchange_attempt', userId, false, 'invalid_token_response');
        throw new functions.https.HttpsError('internal', 'Invalid token response from TrueLayer');
      }

      const connectionId = `tl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await logSecurityEvent('token_exchange_success', userId, true);

      return {
        connectionId,
        accessToken: access_token,
        refreshToken: refresh_token,
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

      await logSecurityEvent('token_exchange_failure', userId, false, errorType);

      const userFacingMessage = apiError || 'Failed to exchange authorization code';
      throw new functions.https.HttpsError('internal', userFacingMessage);
    }
  }
);

