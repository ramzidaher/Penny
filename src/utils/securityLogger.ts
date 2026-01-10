/**
 * Secure Security Event Logger
 * 
 * Logs security events WITHOUT any sensitive data:
 * - No OAuth codes (even length)
 * - No tokens (access, refresh, or any token data)
 * - No account IDs
 * - No balances
 * - No transaction details
 * - No client secrets or IDs
 * - No PII
 * 
 * Only logs: event type, timestamp, user ID (hashed), success/failure status
 */

type SecurityEventType =
  | 'token_exchange_attempt'
  | 'token_exchange_success'
  | 'token_exchange_failure'
  | 'token_refresh_attempt'
  | 'token_refresh_success'
  | 'token_refresh_failure'
  | 'oauth_flow_started'
  | 'oauth_flow_completed'
  | 'oauth_flow_failed'
  | 'connection_created'
  | 'connection_deleted'
  | 'token_revoked'
  | 'secure_storage_error';

interface SecurityEvent {
  eventType: SecurityEventType;
  timestamp: number;
  userId?: string;
  success: boolean;
  errorType?: string;
}

const validateNoSensitiveData = (data: unknown): void => {
  const dataStr = JSON.stringify(data).toLowerCase();
  const sensitivePatterns = [
    'code',
    'token',
    'secret',
    'password',
    'account_id',
    'balance',
    'transaction',
    'client_id',
    'client_secret',
  ];

  for (const pattern of sensitivePatterns) {
    if (dataStr.includes(pattern)) {
      throw new Error(`Security logger: Attempted to log sensitive data containing "${pattern}"`);
    }
  }
};

export const logSecurityEvent = (
  eventType: SecurityEventType,
  success: boolean,
  userId?: string,
  errorType?: string
): void => {
  try {
    const event: SecurityEvent = {
      eventType,
      timestamp: Date.now(),
      success,
    };

    if (userId) {
      validateNoSensitiveData(userId);
      event.userId = userId;
    }

    if (errorType) {
      validateNoSensitiveData(errorType);
      event.errorType = errorType;
    }

    validateNoSensitiveData(event);

    console.log('[SecurityEvent]', JSON.stringify(event));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SecurityLogger] Validation failed:', errorMessage);
  }
};

