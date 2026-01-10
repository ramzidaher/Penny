# Security Quick Reference

**Last Updated:** January 2026

## Quick Status

✅ **All Critical Issues Resolved**  
✅ **Production Ready**

## Security Features

### Authentication & Authorization
- ✅ Firebase Auth required for all operations
- ✅ User data isolation enforced
- ✅ OAuth state parameter (CSRF protection)
- ✅ Code replay protection (client + server)

### Token Management
- ✅ Tokens stored in SecureStore only
- ✅ Additional encryption layer (XOR cipher)
- ✅ Token validation before storage
- ✅ Backend token exchange & refresh
- ✅ No client secrets in client code

### Rate Limiting
- ✅ Server-side: Token exchange (5/hour), Token refresh (10/hour)
- ✅ Client-side: Per-endpoint limits (10-20 requests/minute)

### Input Validation
- ✅ OAuth codes, tokens, IDs, dates validated
- ✅ Strict format checks on all inputs
- ✅ Deep link security validation

### Data Protection
- ✅ Financial data never stored in cloud
- ✅ Encrypted local caching
- ✅ Secure error handling (no data leakage)

## Firebase Functions

| Function | Purpose | Rate Limit |
|----------|---------|------------|
| `exchangeTrueLayerToken` | OAuth token exchange | 5/hour |
| `refreshTrueLayerToken` | Token refresh | 10/hour |

## Deployment Commands

```bash
# Deploy all functions
npx firebase-tools deploy --only functions

# Deploy indexes
npx firebase-tools deploy --only firestore:indexes

# Configure secrets
npx firebase-tools functions:config:set \
  truelayer.client_id="..." \
  truelayer.client_secret="..." \
  truelayer.env="live"
```

## Key Files

- `SECURITY.md` - Security architecture
- `docs/SECURITY_AUDIT_AND_HARDENING.md` - Full audit documentation
- `firestore.rules` - Database security rules
- `functions/src/truelayerTokenExchange.ts` - Token exchange function
- `functions/src/truelayerTokenRefresh.ts` - Token refresh function

## Security Checklist

Before production:
- [ ] All secrets in Firebase Functions config (not client)
- [ ] Firestore rules deployed
- [ ] Functions deployed and tested
- [ ] Rate limiting working
- [ ] OAuth flow tested with state parameter
- [ ] Token refresh tested via backend

## Support

For security concerns, see `SECURITY.md` for contact information.

