# Security Architecture & Best Practices

## Overview

This finance application implements finance-grade security measures following GDPR-level data protection standards. All financial data is treated as highly sensitive and subject to regulatory, audit, and forensic scrutiny.

## Security Principles

1. **Security First**: Security takes priority over speed, convenience, or brevity
2. **Zero Trust**: Never trust external inputs; validate strictly
3. **Least Privilege**: Request only necessary OAuth scopes and permissions
4. **Data Minimization**: Store only essential data; implement TTL for cached data
5. **No Sensitive Logging**: Never log codes, tokens, account IDs, balances, or PII
6. **Fail Securely**: If secure storage is unavailable, fail rather than fall back to insecure storage

## Architecture

### Token Storage

- **OAuth Tokens**: Stored exclusively in SecureStore (encrypted keychain/keystore)
- **Additional Encryption Layer**: Tokens are encrypted with device-specific key before storage in SecureStore (XOR cipher + base64)
- **No AsyncStorage Fallback**: If SecureStore is unavailable, the app fails securely rather than storing tokens in unencrypted storage
- **Connection IDs**: Non-sensitive connection ID list can use AsyncStorage fallback

### Data Storage Strategy

- **TrueLayer Financial Data**: Never persisted in cloud (Firestore)
  - Balances: Fetched on-demand, cached locally (30-minute TTL)
  - Transactions: Fetched on-demand, cached locally (6-hour TTL)
  - All caches encrypted in SecureStore
- **Account Metadata**: Stored in Firestore (name, type, currency, TrueLayer IDs only)
- **Manual Accounts**: Full data stored in Firestore (user-provided)

### OAuth Flow Security

- **State Parameter**: Cryptographically secure state parameter for CSRF protection (IMPLEMENTED)
- **Code Replay Protection**: Server-side and client-side tracking of used authorization codes (IMPLEMENTED)
- **RedirectUri Validation**: Strict whitelist validation (IMPLEMENTED)
- **Deep-link Protection**: Validates app scheme and host, prevents deep link hijacking (IMPLEMENTED)
- **Client-side Rate Limiting**: Prevents API abuse with per-endpoint rate limits (IMPLEMENTED)

### Backend Token Exchange & Refresh

- **Client Secret**: Never in client code; stored server-side only (Firebase Cloud Functions)
- **Token Exchange**: Handled by backend service (`exchangeTrueLayerToken`) with:
  - Firebase Auth verification
  - OAuth state parameter validation
  - Code replay protection
  - Rate limiting per user (5 attempts per hour)
  - Input validation
  - Error sanitization
  - Audit logging (no sensitive data)
- **Token Refresh**: Handled by backend service (`refreshTrueLayerToken`) with:
  - Firebase Auth verification
  - Rate limiting per user (10 attempts per hour)
  - Input validation
  - Error sanitization
  - Audit logging (no sensitive data)

## Security Features

### Implemented

- [x] Secure token storage (SecureStore only, no AsyncStorage fallback)
- [x] Encrypted local caching (transactions, balances)
- [x] No cloud persistence of TrueLayer financial data
- [x] Secure logging utility (validates no sensitive data)
- [x] Token refresh mechanism (backend service)
- [x] Per-user data isolation
- [x] OAuth state parameter (CSRF protection)
- [x] Code replay protection (server-side and client-side)
- [x] Backend token exchange service
- [x] Backend token refresh service
- [x] Token validation before storage
- [x] Token encryption (additional layer beyond SecureStore)
- [x] Rate limiting on token exchange (server-side)
- [x] Rate limiting on token refresh (server-side)
- [x] Client-side rate limiting for API calls
- [x] Input validation (OAuth codes, tokens, account IDs, connection IDs)
- [x] Deep link security validation
- [x] Firestore security rules
- [x] Firebase Functions authentication requirement

### To Be Implemented

- [ ] Token revocation handling - Optional enhancement
- [ ] GDPR data deletion service
- [ ] Audit trail with retention policy

## Known Security Issues

### Critical (Must Fix Immediately)

None - All critical issues have been resolved.

### High Priority

1. **Dependency Updates**: Regularly update dependencies for security patches
2. **Token Rotation**: Consider implementing proactive token rotation mechanism

## Data Retention Policy

- **Transaction Cache**: 6 hours TTL
- **Balance Cache**: 30 minutes TTL
- **Audit Logs**: 90 days (configurable)
- **OAuth Tokens**: Until revoked or expired

## GDPR Compliance

- **Data Minimization**: Only essential data stored
- **Right to Deletion**: User data deletion service (to be implemented)
- **No Analytics on Financial Data**: No telemetry touches financial data
- **Secure Data Transfer**: All API calls use HTTPS

## Security Logging

The application uses a secure logging utility (`src/utils/securityLogger.ts`) that:
- Validates no sensitive data is logged
- Logs only: event type, timestamp, user ID (hashed), success/failure
- Never logs: codes, tokens, account IDs, balances, PII

## Secret Management

- **Development**: `.env` file (not in version control)
- **Production**: EAS Secrets (for client-side non-sensitive config)
- **Backend**: Firebase Functions config (encrypted) - for CLIENT_SECRET and other sensitive secrets
- **Gitignore**: `.env`, `.env.local`, `eas.json` are in `.gitignore`

## Secret Rotation Process

If a secret is exposed or compromised:

1. **Immediately rotate the secret** in the source system (TrueLayer dashboard, OpenAI, etc.)
2. **Update Firebase Functions config**:
   ```bash
   firebase functions:config:set truelayer.client_secret="NEW_SECRET"
   firebase deploy --only functions
   ```
3. **Update EAS Secrets** (if used for production builds):
   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_OPENAI_API_KEY --value "NEW_KEY"
   ```
4. **Revoke old tokens** (if applicable):
   - TrueLayer: Revoke all connections in TrueLayer dashboard
   - Users will need to reconnect
5. **Document the incident** in security logs
6. **Review access logs** for unauthorized access during exposure window

## Best Practices

1. **Never log sensitive data** - Use `securityLogger` for all security events
2. **Validate all inputs** - Strict format checks, type validation
3. **Fail securely** - If secure storage unavailable, fail rather than compromise
4. **Rotate secrets** - Regularly rotate exposed secrets
5. **Monitor security events** - Track failed authentications, suspicious patterns
6. **Keep dependencies updated** - Regularly update security-critical dependencies

## Incident Response

If a security incident is detected:
1. Rotate all exposed secrets immediately
2. Revoke affected tokens
3. Review audit logs
4. Update security measures
5. Document incident and remediation

## Contact

For security concerns, please follow responsible disclosure practices.

