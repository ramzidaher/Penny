import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { Resend } from 'resend';

if (!admin.apps.length) {
  admin.initializeApp();
}

// Rate limiting (in-memory, resets on cold start)
const resetCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_RESETS_PER_WINDOW = 3;

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Escape for safe use inside HTML text content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Branded HTML for Penny password reset. Logo URL should be hosted at pennyfinance.app. */
function getPasswordResetHtml(displayEmail: string, resetLink: string): string {
  const encodedLink = resetLink;
  const safeEmail = escapeHtml(displayEmail);
  const logoUrl = process.env.PENNY_LOGO_URL || 'https://pennyfinance.app/logo.png';
  const primaryColor = '#15803D'; // Penny success green
  const textColor = '#121212';
  const mutedColor = '#6B6B6B';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Penny password</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #faf9f6; color: ${textColor};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #faf9f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding: 40px 40px 32px 40px; text-align: center;">
              <img src="${logoUrl}" alt="Penny" width="120" height="40" style="display: inline-block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 24px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: ${textColor};">
                Reset your password
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 24px 40px; font-size: 16px; line-height: 1.5; color: ${mutedColor};">
              We received a request to reset the password for your Penny account (<strong style="color: ${textColor};">${safeEmail}</strong>).
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px; text-align: center;">
              <a href="${encodedLink}" style="display: inline-block; padding: 14px 28px; background-color: ${primaryColor}; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
                Set new password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px; font-size: 14px; line-height: 1.5; color: ${mutedColor}; border-top: 1px solid #e5e5e5;">
              If you didn’t request this, you can ignore this email. Your password will stay the same.
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 24px 40px; font-size: 12px; color: ${mutedColor}; text-align: center;">
              — The Penny team
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

/**
 * Callable Cloud Function: request a branded password reset email.
 * Uses Firebase Admin to generate the reset link and Resend to send from your domain.
 * Set RESEND_API_KEY and PASSWORD_RESET_FROM (e.g. "Penny <noreply@pennyfinance.app>") in Firebase config.
 */
export const requestPasswordReset = onCall(async (request) => {
  const email = request.data?.email;
  const clientIP = request.rawRequest.ip || request.rawRequest.socket?.remoteAddress || 'unknown';

  if (!email || typeof email !== 'string') {
    throw new HttpsError('invalid-argument', 'Email is required');
  }

  const sanitized = email.trim().toLowerCase();
  if (!sanitized || !EMAIL_REGEX.test(sanitized) || sanitized.length > 254) {
    throw new HttpsError('invalid-argument', 'Invalid email address');
  }

  // Rate limit by IP
  const now = Date.now();
  const data = resetCounts.get(clientIP);
  if (data) {
    if (now > data.resetTime) {
      resetCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else if (data.count >= MAX_RESETS_PER_WINDOW) {
      logger.warn('Password reset rate limit exceeded', { clientIP });
      throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
    } else {
      data.count++;
    }
  } else {
    resetCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.PASSWORD_RESET_FROM || 'Penny <noreply@pennyfinance.app>';

  if (!apiKey) {
    logger.error('requestPasswordReset: RESEND_API_KEY not set');
    throw new HttpsError('failed-precondition', 'Password reset is not configured. Please try again later.');
  }

  const auth = admin.auth();
  let userExists = false;
  try {
    await auth.getUserByEmail(sanitized);
    userExists = true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      userExists = false;
    } else {
      logger.error('requestPasswordReset: getUserByEmail failed', { error: (err as Error).message });
      throw new HttpsError('internal', 'Something went wrong. Please try again.');
    }
  }

  // Don't reveal whether the email is registered; always return success
  if (!userExists) {
    logger.info('Password reset requested for unknown email (no email sent)', { emailPrefix: sanitized.substring(0, 3) + '***', clientIP });
    return { success: true };
  }

  let resetLink: string;
  try {
    resetLink = await auth.generatePasswordResetLink(sanitized);
  } catch (err) {
    logger.error('requestPasswordReset: generatePasswordResetLink failed', { error: (err as Error).message });
    throw new HttpsError('internal', 'Something went wrong. Please try again.');
  }

  const resend = new Resend(apiKey);
  const html = getPasswordResetHtml(sanitized, resetLink);

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [sanitized],
      subject: 'Reset your Penny password',
      html,
    });
    if (error) {
      logger.error('requestPasswordReset: Resend failed', { error: error.message });
      throw new HttpsError('internal', 'Failed to send email. Please try again later.');
    }
    logger.info('Password reset email sent', { emailPrefix: sanitized.substring(0, 3) + '***', clientIP });
    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('requestPasswordReset: send failed', { error: (err as Error).message });
    throw new HttpsError('internal', 'Failed to send email. Please try again later.');
  }
});
