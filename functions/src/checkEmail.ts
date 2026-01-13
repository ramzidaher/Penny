import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Rate limiting storage (in-memory, resets on function restart)
const emailCheckCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_CHECKS_PER_WINDOW = 10; // 10 checks per minute per IP

/**
 * Cloud Function to securely check if an email is available
 * Implements rate limiting and input validation to prevent abuse
 */
export const checkEmail = onCall(async (request) => {
  const email = request.data?.email;
  const clientIP = request.rawRequest.ip || request.rawRequest.socket?.remoteAddress || 'unknown';

  // Input validation
  if (!email || typeof email !== 'string') {
    logger.warn('Invalid email check request', { email, clientIP });
    throw new HttpsError('invalid-argument', 'Email is required and must be a string');
  }

  // Sanitize and validate email format
  const sanitized = email.toLowerCase().trim();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(sanitized)) {
    logger.warn('Invalid email format', { email: sanitized, clientIP });
    throw new HttpsError('invalid-argument', 'Invalid email format');
  }

  // Check length (RFC 5321 max length)
  if (sanitized.length > 254) {
    logger.warn('Email too long', { email: sanitized, length: sanitized.length, clientIP });
    throw new HttpsError('invalid-argument', 'Email is too long');
  }

  // Rate limiting
  const now = Date.now();
  const clientData = emailCheckCounts.get(clientIP);
  
  if (clientData) {
    // Reset if window expired
    if (now > clientData.resetTime) {
      emailCheckCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else if (clientData.count >= MAX_CHECKS_PER_WINDOW) {
      logger.warn('Rate limit exceeded for email check', { clientIP, count: clientData.count });
      throw new HttpsError('resource-exhausted', 'Too many email checks. Please wait a moment and try again.');
    } else {
      clientData.count++;
    }
  } else {
    emailCheckCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  }

  try {
    // Check if email is already registered using Firebase Admin Auth
    const auth = admin.auth();
    
    // Try to get user by email - this is the most reliable way to check
    let userExists = false;
    try {
      const user = await auth.getUserByEmail(sanitized);
      userExists = !!user;
    } catch (error: any) {
      // If user doesn't exist, getUserByEmail throws an error
      // Check if it's a "user not found" error
      if (error.code === 'auth/user-not-found') {
        userExists = false;
      } else {
        // For other errors, log and assume unavailable for security
        logger.error('Error checking email availability', { email: sanitized, error: error.message, clientIP });
        throw new HttpsError('internal', 'Unable to check email availability');
      }
    }

    // Timing attack prevention - add random delay
    const delay = Math.random() * 100; // 0-100ms random delay
    await new Promise(resolve => setTimeout(resolve, delay));

    // Log for audit (without sensitive data)
    logger.info('Email availability checked', {
      email: sanitized.substring(0, 3) + '***', // Only log first 3 chars
      available: !userExists,
      clientIP,
    });

    // Return availability (true if user doesn't exist)
    return { available: !userExists };
  } catch (error: any) {
    // If it's already an HttpsError, re-throw it
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // For unexpected errors, don't reveal details
    logger.error('Unexpected error in checkEmail', { error: error.message, clientIP });
    throw new HttpsError('internal', 'Unable to check email availability');
  }
});

