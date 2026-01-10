# Deploy Firebase Functions - Step by Step Guide

## Prerequisites

1. Firebase CLI installed (or use npx)
2. Logged into Firebase
3. Node.js 18+ installed

## Step 1: Login to Firebase

```bash
npx firebase-tools login
```

This will open a browser window for authentication.

## Step 2: Set Firebase Project

```bash
cd /Users/ramzidaher/Projects/finance
npx firebase-tools use mefi-1ba18
```

## Step 3: Enable Legacy Config Commands (Required for now)

```bash
npx firebase-tools experiments:enable legacyRuntimeConfigCommands
```

## Step 4: Set Function Configuration

```bash
npx firebase-tools functions:config:set \
  truelayer.client_id="myfinance-90e7c9" \
  truelayer.client_secret="da7f04a6-31e5-46dc-afdc-7856cef13f5d" \
  truelayer.env="live"
```

## Step 5: Build Functions

```bash
cd functions
npm run build
cd ..
```

## Step 6: Deploy Function

```bash
npx firebase-tools deploy --only functions:exchangeTrueLayerToken
```

## Verification

After deployment, you should see output like:
```
✔  functions[exchangeTrueLayerToken(us-central1)] Successful create operation.
Function URL: https://us-central1-mefi-1ba18.cloudfunctions.net/exchangeTrueLayerToken
```

## Troubleshooting

If you get authentication errors:
- Run `npx firebase-tools login` again
- Make sure you have access to the Firebase project

If you get "function not found" errors:
- Make sure the function name matches exactly: `exchangeTrueLayerToken`
- Check that the build succeeded: `cd functions && npm run build`

## Security Note

After deployment, **rotate the client secret** since it was exposed in version control:
1. Generate new secret in TrueLayer dashboard
2. Update Firebase Functions config with new secret
3. Redeploy function

