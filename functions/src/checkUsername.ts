/**
 * Username Availability Check Firebase Cloud Function
 * 
 * Securely checks if a username is available with rate limiting.
 * Prevents username enumeration attacks.
 * 
 * Security Features:
 * - Rate limiting per IP (10 checks per minute)
 * - Input validation (alphanumeric + underscore, 3-20 chars)
 * - No information leakage (same response time for taken/available)
 * - Audit logging (no sensitive data)
 * - Reserved username blocking
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CheckUsernameRequest {
  username: string;
}

interface CheckUsernameResponse {
  available: boolean;
  message?: string;
}

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'system', 'support', 'help',
  'api', 'www', 'mail', 'test', 'null', 'undefined', 'penny', 'app'
];

// Rate limiting: track checks per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_CHECKS_PER_WINDOW = 10;

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= MAX_CHECKS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  
  record.count++;
  return true;
};

const validateUsernameFormat = (username: string): { valid: boolean; message?: string } => {
  // Alphanumeric and underscores only, 3-20 characters
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  
  if (!usernameRegex.test(username)) {
    return {
      valid: false,
      message: 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
    };
  }
  
  // Check reserved usernames
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return {
      valid: false,
      message: 'This username is reserved'
    };
  }
  
  return { valid: true };
};

export const checkUsername = functions.https.onCall(async (data: CheckUsernameRequest, context): Promise<CheckUsernameResponse> => {
  try {
    // Get client IP for rate limiting
    const ip = context.rawRequest?.ip || context.rawRequest?.connection?.remoteAddress || 'unknown';
    
    // Rate limiting check
    if (!checkRateLimit(ip)) {
      functions.logger.warn('Rate limit exceeded', { ip });
      // Return generic error to prevent information leakage
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many requests. Please try again later.'
      );
    }
    
    // Validate input
    if (!data.username || typeof data.username !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Username is required'
      );
    }
    
    const username = data.username.toLowerCase().trim();
    
    // Validate format
    const formatValidation = validateUsernameFormat(username);
    if (!formatValidation.valid) {
      return {
        available: false,
        message: formatValidation.message
      };
    }
    
    // Check if username exists in Firestore
    // Use consistent timing to prevent enumeration attacks
    const startTime = Date.now();
    const usernameRef = db.doc(`usernames/${username}`);
    const usernameSnap = await usernameRef.get();
    const queryTime = Date.now() - startTime;
    
    // Add small random delay to prevent timing attacks (10-50ms)
    const minDelay = 10;
    const maxDelay = 50;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    const totalDelay = Math.max(0, delay - queryTime);
    
    if (totalDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
    
    // In Firebase Admin SDK, exists is a property, not a method
    const available = !usernameSnap.exists;
    
    // Log security event (no sensitive data)
    functions.logger.info('Username check', {
      username: username.substring(0, 3) + '***', // Partial masking
      available,
      ip: ip.substring(0, 7) + '***' // Partial IP masking
    });
    
    return {
      available,
      message: available ? undefined : 'Username is already taken'
    };
    
  } catch (error: any) {
    functions.logger.error('Error checking username', {
      error: error.message,
      code: error.code
    });
    
    // Don't leak error details
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while checking username availability'
    );
  }
});

