# Debugging Android App - Log Monitoring Guide

## Quick Start

### Option 1: Use the Log Script (Easiest)

1. **Open a terminal** and run:
   ```bash
   ./scripts/android-logs.sh
   ```

2. **In another terminal or your IDE**, run your app:
   ```bash
   npx expo run:android
   # OR if using EAS build:
   # Open the APK on your device
   ```

3. **Watch the logs** in the first terminal as you use the app

### Option 2: Direct ADB Command

Run this in a terminal:
```bash
adb logcat -c && adb logcat | grep -E "(ReactNativeJS|RootLayout|onAuthState|lockState|isAppLocked|truelayer|OAuth)" -i
```

### Option 3: See ALL React Native Logs

```bash
adb logcat | grep ReactNativeJS
```

## What to Look For

When testing the lock screen issue, watch for these log messages:

1. **Auth State Changes:**
   - `onAuthStateChanged`
   - `Initial auth state`
   - `handleAuthStateChange`

2. **Lock Screen State:**
   - `lockStateDetermined`
   - `isAppLocked`
   - `hasCheckedInitialLock`

3. **Navigation:**
   - `Navigation effect`
   - `connect-bank`
   - `OAuth flow active`

4. **Android-specific:**
   - `Android: Found restored user`
   - `Android: No user found`

## Tips

- **Clear logs before testing:** The script does this automatically
- **Reproduce the issue** while watching logs
- **Look for timing issues** - note the order of log messages
- **Check for errors** - any red error messages

## If Logs Don't Show

1. Make sure your device/emulator is connected:
   ```bash
   adb devices
   ```

2. Make sure the app is installed and running

3. Try unfiltered logs:
   ```bash
   adb logcat
   ```


