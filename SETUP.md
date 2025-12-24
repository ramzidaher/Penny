# MeFinance Setup Guide

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (for Mac) or Android Studio (for Android development)
- OpenAI API key (for AI features)

## Installation Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up Environment Variables**
   Create a `.env` file in the root directory:
   ```
   EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
   ```
   
   Get your OpenAI API key from: https://platform.openai.com/api-keys

3. **Create App Assets** (Optional)
   The app expects these asset files, but you can use placeholders:
   - `assets/icon.png` (1024x1024)
   - `assets/splash.png` (1242x2436)
   - `assets/adaptive-icon.png` (1024x1024)
   - `assets/favicon.png` (48x48)
   - `assets/notification-icon.png` (96x96)

4. **Start the Development Server**
   ```bash
   npm start
   ```

5. **Run on Device/Simulator**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on your physical device

## Features

- ✅ Account Management (Banks, Cards, Cash, Investments)
- ✅ Transaction Tracking (Income & Expenses)
- ✅ Budget Management with Progress Tracking
- ✅ Subscription Tracking with Billing Reminders
- ✅ AI Financial Advisor (ChatGPT powered)
- ✅ Push Notifications for Budget Alerts & Subscription Reminders

## Building an APK

To build an APK file for Android installation:

### Option 1: EAS Build (Recommended - Cloud-based)

1. **Install EAS CLI**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**
   ```bash
   eas login
   ```

3. **Configure EAS** (if not already done)
   ```bash
   eas build:configure
   ```

4. **Build APK**
   ```bash
   eas build --platform android --profile preview
   ```
   
   This will build an APK file. You can download it from the Expo dashboard or the build will provide a download link when complete.

5. **Install the APK**
   - Download the APK file from the build output
   - Transfer it to your Android device
   - Enable "Install from Unknown Sources" in Android settings
   - Open the APK file to install

### Option 2: Local Build (Requires Android Studio)

1. **Install Android Studio** and set up Android SDK
2. **Generate native project**
   ```bash
   npx expo prebuild
   ```
3. **Build APK**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   The APK will be in `android/app/build/outputs/apk/release/app-release.apk`

## Database

The app uses SQLite for local storage. All data is stored locally on your device.

### Database Location

**On Android (when installed as APK):**
- **File path**: `/data/data/com.mefinance.app/databases/mefinance.db`
- **Access methods**:
  - **Via ADB** (Android Debug Bridge):
    ```bash
    # Connect device via USB with USB debugging enabled
    adb shell
    run-as com.mefinance.app
    cd databases
    ls -la  # You'll see mefinance.db
    ```
  - **Via File Manager** (requires root): Use a root file manager app to navigate to the path above
  - **Via App**: The database is automatically created and managed by the app - you don't need to access it manually

**On iOS:**
- **File path**: `Library/Application Support/mefinance.db` (within the app's sandbox)
- **Access**: Requires Xcode and device connection, or use a file manager app with proper permissions

**On Web:**
- Data is stored in browser's `localStorage` (not a SQLite file)
- Access via browser DevTools → Application → Local Storage

**Note**: The database is created automatically when you first run the app. It contains tables for:
- `accounts` - Your financial accounts
- `transactions` - Income and expense records
- `budgets` - Budget categories and limits
- `subscriptions` - Subscription tracking

## Notes

- The app is designed with a minimalist black & white theme
- All financial data is stored locally - no cloud sync (yet)
- AI features require an active OpenAI API key
- Push notifications require device permissions

