#!/bin/bash

# Android Log Watcher for Finance App
# This script filters and displays relevant logs from the Android app

echo "🔍 Starting Android log monitoring..."
echo "📱 Filtering for: React Native, Expo, Firebase, and app logs"
echo "Press Ctrl+C to stop"
echo ""

# Filter for:
# - React Native logs (ReactNativeJS)
# - Expo logs (ExpoModules)
# - Firebase logs (FirebaseApp, FirebaseAuth)
# - App-specific logs (RootLayout, ConnectBankScreen, etc.)
# - JavaScript console logs

adb logcat -c  # Clear existing logs

adb logcat | grep -E "(ReactNativeJS|ExpoModules|FirebaseApp|FirebaseAuth|RootLayout|ConnectBankScreen|AppLockScreen|onAuthStateChanged|lockStateDetermined|isAppLocked|truelayer-callback|OAuth|Navigation)" --color=always


