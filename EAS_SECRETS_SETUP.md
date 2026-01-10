# EAS Secrets Setup Guide

## Overview

Sensitive secrets have been removed from `eas.json` and should be managed using EAS Secrets for production builds.

## Secrets Removed from eas.json

The following secrets have been removed and must be configured using EAS Secrets:

- `EXPO_PUBLIC_TRUELAYER_CLIENT_SECRET` - TrueLayer OAuth client secret (now handled by backend)
- `EXPO_PUBLIC_OPENAI_API_KEY` - OpenAI API key

## Setting Up EAS Secrets

### 1. Install EAS CLI (if not already installed)

```bash
npm install -g eas-cli
```

### 2. Login to EAS

```bash
eas login
```

### 3. Set Secrets

For each secret, use the following command:

```bash
# OpenAI API Key
eas secret:create --scope project --name EXPO_PUBLIC_OPENAI_API_KEY --value "your-openai-api-key"

# Note: EXPO_PUBLIC_TRUELAYER_CLIENT_SECRET is no longer needed in client code
# It is now stored in Firebase Functions config (server-side only)
```

### 4. Verify Secrets

```bash
eas secret:list
```

## Firebase Functions Secrets

TrueLayer client secret is now stored in Firebase Functions config (server-side):

```bash
firebase functions:config:set truelayer.client_id="your-client-id"
firebase functions:config:set truelayer.client_secret="your-client-secret"
firebase functions:config:set truelayer.env="live"
```

## Development vs Production

- **Development**: Uses `.env` file (local development)
- **Production**: Uses EAS Secrets (automatically injected during build)

## Security Notes

- Never commit secrets to version control
- Rotate secrets immediately if exposed
- Use different secrets for development and production
- Review secret access regularly

