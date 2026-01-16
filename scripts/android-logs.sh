#!/bin/bash

# Android Log Viewer - Shows all relevant app logs
# Usage: ./scripts/android-logs.sh [device_serial]

echo "🔍 Android Log Monitor"
echo "======================"
echo ""

# Check for devices
DEVICES=$(adb devices | grep -v "List" | grep "device$" | awk '{print $1}')
DEVICE_COUNT=$(echo "$DEVICES" | grep -c . || echo "0")

if [ "$DEVICE_COUNT" -eq "0" ]; then
    echo "❌ No Android devices found!"
    echo "Please connect a device or start an emulator"
    exit 1
fi

# Handle device selection
if [ "$DEVICE_COUNT" -eq "1" ]; then
    DEVICE=$(echo "$DEVICES" | head -1)
    echo "📱 Using device: $DEVICE"
elif [ -n "$1" ]; then
    DEVICE="$1"
    echo "📱 Using specified device: $DEVICE"
else
    echo "Multiple devices found:"
    echo "$DEVICES" | nl -w2 -s'. '
    echo ""
    read -p "Enter device number (1-$DEVICE_COUNT): " DEVICE_NUM
    DEVICE=$(echo "$DEVICES" | sed -n "${DEVICE_NUM}p")
    if [ -z "$DEVICE" ]; then
        echo "❌ Invalid selection"
        exit 1
    fi
    echo "📱 Using device: $DEVICE"
fi

echo ""
echo "This will show logs from your app in real-time"
echo "Press Ctrl+C to stop"
echo ""
echo "Filtering for:"
echo "  - React Native/Expo logs"
echo "  - Firebase Auth logs"
echo "  - App navigation logs"
echo "  - Lock screen logs"
echo "  - OAuth/callback logs"
echo ""
echo "Starting in 2 seconds..."
sleep 2

# Clear existing logs for the specific device
adb -s "$DEVICE" logcat -c

# Show filtered logs with timestamps
adb -s "$DEVICE" logcat -v time | grep --line-buffered -E "(ReactNativeJS|ExpoModules|Firebase|RootLayout|ConnectBank|AppLock|onAuthState|lockState|isAppLocked|truelayer|OAuth|Navigation|auth|pin)" -i

