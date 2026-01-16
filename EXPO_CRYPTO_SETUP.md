# Expo Crypto Setup Guide

## Issue
`expo-crypto` native module is not available in the current development build, causing PIN setup to fail.

## Solution

### For Development Builds

1. **Rebuild your development build** to include the native module:

```bash
# For iOS
eas build --profile development --platform ios

# For Android  
eas build --profile development --platform android

# Or build locally
npx expo run:ios
npx expo run:android
```

2. **Install the new build** on your device/simulator

3. **Test PIN setup** - it should now work

### For Production Builds

**Good news:** Production builds with EAS will automatically include `expo-crypto` since it's listed in `package.json`. No additional configuration needed!

When you build for production:

```bash
# For iOS
eas build --profile production --platform ios

# For Android
eas build --profile production --platform android
```

The native module will be automatically included in the build.

## Verification

After rebuilding, test that `expo-crypto` works:

1. Open the app
2. Try to set up a PIN
3. It should work without errors

## Current Status

- ✅ `expo-crypto` is installed in `package.json` (v15.0.8)
- ✅ Code is configured to handle the module gracefully
- ⚠️ Development build needs to be rebuilt to include native module
- ✅ Production builds will work automatically with EAS

## Troubleshooting

If you still see errors after rebuilding:

1. **Clear caches:**
   ```bash
   rm -rf node_modules
   npm cache clean --force
   npm install
   ```

2. **Clean and rebuild:**
   ```bash
   npx expo prebuild --clean
   eas build --profile development --platform ios
   ```

3. **Verify version compatibility:**
   - Expo SDK: 54.0.0
   - expo-crypto: 15.0.8
   - These are compatible ✅

## Important Notes

- **Development builds** require rebuilding when adding native modules
- **Production builds** with EAS automatically include all native modules from `package.json`
- The current implementation includes proper error handling for missing crypto module
- PIN functionality is critical - ensure the build includes expo-crypto before deploying








