# Penny

A minimalist finance tracking app with AI-powered insights. Track your accounts, expenses, budgets, and subscriptions all in one place.

## Features

- 📊 **Account Management** - Track multiple banks, cards, cash, and investments
- 💰 **Expense Tracking** - Log income and expenses with categories
- 📈 **Budget Management** - Set budgets by category and track spending
- 📅 **Subscription Tracking** - Never miss a subscription renewal
- 🤖 **AI Financial Advisor** - Get insights and purchase advice powered by ChatGPT
- 🔔 **Push Notifications** - Budget alerts and subscription reminders
- 🎨 **Minimalist Design** - Clean black & white interface
- ☁️ **Cloud Sync** - Firebase Firestore integration for cross-device access
- 🔐 **Secure Authentication** - Email/password authentication with Firebase

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (for Mac) or Android Studio (for Android development)
- OpenAI API key (for AI features)
- Firebase project (for cloud sync and authentication)

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up Environment Variables**
   
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
   EXPO_PUBLIC_LOGO_DEV_KEY=your_logo_dev_public_key_here
   EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
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

## Environment Variables Setup

### How Expo Loads .env Files

Expo **automatically** loads `.env` files from your project root (Expo SDK 50+). No additional configuration needed!

### Requirements

1. **File Location:** `.env` must be in the project root directory
2. **Variable Prefix:** All variables must start with `EXPO_PUBLIC_`
3. **Format:** One variable per line: `EXPO_PUBLIC_VARIABLE_NAME=value`

### Using Environment Variables in Code

Access variables using `process.env`:
```typescript
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
```

### Important Notes

**⚠️ Restart Required**
After changing `.env` file, you **must** restart the Expo server:
```bash
# Stop the current server (Ctrl+C)
# Then restart with cache cleared:
npx expo start --clear
```

**🔒 Security**
- `.env` file is in `.gitignore` (not committed to Git)
- Only variables with `EXPO_PUBLIC_` prefix are accessible in your app
- Variables are embedded in the JavaScript bundle (not secret)

**📱 Production Builds**
For production builds (EAS), environment variables are set in `eas.json`, not `.env`:
- **Development:** Uses `.env` file
- **Production:** Uses `eas.json` production profile

### Verification

Check if Expo is reading your `.env` file:
```bash
# Check Expo config
npx expo config --type public

# Or verify with script
npm run verify-env
```

### Troubleshooting Environment Variables

**Variables Not Loading?**
1. Check file location: `.env` must be in project root
2. Check prefix: Must start with `EXPO_PUBLIC_`
3. Restart server: Run `npx expo start --clear`
4. Check syntax: No spaces around `=`, no quotes needed
5. Verify with: `npm run verify-env`

**Common Issues:**
- **Variables are `undefined`**: Make sure they start with `EXPO_PUBLIC_` and restart Expo server with `--clear` flag
- **Changes not reflected**: Stop and restart Expo server, clear cache: `npx expo start --clear`
- **Variables work in dev but not in build**: For production builds, set variables in `eas.json` (see Production Setup section)

## Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard

### 2. Enable Firestore Database

1. In your Firebase project, go to **Firestore Database**
2. Click "Create database"
3. Start in **test mode** (for development) or **production mode** (for production)
4. Choose a location for your database

### 3. Enable Email/Password Authentication

1. Go to **Authentication** in Firebase Console
2. Click "Get started"
3. Enable **Email/Password** sign-in method
4. Click **Save**

**Important**: The app uses email/password authentication for secure user accounts. Anonymous authentication is not used.

### 4. Get Your Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Register your app (you can name it "Penny Web")
5. Copy the Firebase configuration object
6. Add the values to your `.env` file (see Installation section above)

### 5. Set Firestore Security Rules

In Firebase Console, go to **Firestore Database** → **Rules** and add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This ensures:
- Only authenticated users can access data
- Users can only access their own data (by userId)
- Email/password auth provides secure user IDs

## Authentication

The app uses **email/password authentication** instead of anonymous authentication. This means:
- ✅ Users create accounts with email and password
- ✅ Sessions persist across app restarts
- ✅ Each user has their own secure data
- ✅ No more new users on every app open

### Login Screen
- Email and password input
- Show/hide password toggle
- Forgot password functionality
- Link to register screen
- Monochromatic design matching app theme

### Register Screen
- Name, email, password, and confirm password
- Email validation
- Password strength requirements (min 6 characters)
- Password match validation
- Link to login screen

### Session Persistence
- Firebase automatically persists user sessions
- Users stay logged in across app restarts
- No need to login every time

### Security Features
- Password hashing (handled by Firebase)
- Secure token-based authentication
- User data isolation (each user only sees their data)
- Password reset functionality

### User Flow

1. **First Time**: User sees Login screen → Taps "Sign Up" → Creates account → Automatically logged in
2. **Returning User**: App checks for existing session → If found, user is logged in automatically
3. **Sign Out**: User taps "Sign Out" in Settings → Returns to Login screen

### Data Migration

**Important**: Existing anonymous users' data will not be accessible after switching to email/password auth. 

If you have existing data:
1. Export your data before updating
2. After creating an account, re-enter your data
3. Or contact support for data migration assistance

## Cloud Database

### How It Works

- **Cloud-First**: When Firebase is configured, the app uses Firestore as the primary database
- **Local Fallback**: If Firebase is unavailable, the app falls back to local storage (SQLite/localStorage)
- **Offline Support**: Firestore automatically caches data locally for offline access
- **Auto-Sync**: Changes are automatically synced to the cloud when online

### Data Structure

Your data is stored in Firestore under:
```
users/{userId}/
  ├── accounts/
  ├── transactions/
  ├── budgets/
  └── subscriptions/
```

Each user has their own isolated data collection.

### Migration

Existing local data will continue to work. When you first use the app with Firebase:
- New data will be saved to the cloud
- You can manually migrate existing data by re-adding it (or we can add an auto-migration feature)

## Local Database (SQLite)

The app also uses SQLite for local storage as a fallback. All data is stored locally on your device when Firebase is not configured.

### Database Location

**On Android (when installed as APK):**
- **File path**: `/data/data/com.penny.app/databases/penny.db`
- **Access methods**:
  - **Via ADB** (Android Debug Bridge):
    ```bash
    # Connect device via USB with USB debugging enabled
    adb shell
    run-as com.penny.app
    cd databases
    ls -la  # You'll see penny.db
    ```
  - **Via File Manager** (requires root): Use a root file manager app to navigate to the path above
  - **Via App**: The database is automatically created and managed by the app - you don't need to access it manually

**On iOS:**
- **File path**: `Library/Application Support/penny.db` (within the app's sandbox)
- **Access**: Requires Xcode and device connection, or use a file manager app with proper permissions

**On Web:**
- Data is stored in browser's `localStorage` (not a SQLite file)
- Access via browser DevTools → Application → Local Storage

**Note**: The database is created automatically when you first run the app. It contains tables for:
- `accounts` - Your financial accounts
- `transactions` - Income and expense records
- `budgets` - Budget categories and limits
- `subscriptions` - Subscription tracking

## Building APK

### Prerequisites
1. Expo account (free) - sign up at https://expo.dev
2. EAS CLI installed: `npm install -g eas-cli`

### Steps to Build APK

1. **Login to Expo**
   ```bash
   eas login
   ```
   This will prompt you to:
   - Enter your email (or create an account)
   - Verify your email
   - Complete authentication

2. **Configure EAS** (if not already done)
   ```bash
   eas build:configure
   ```

3. **Build the APK**
   ```bash
   npm run build:android
   ```
   
   Or directly:
   ```bash
   eas build --platform android --profile preview
   ```

4. **What Happens Next**
   - EAS will upload your project to Expo's servers
   - Build will take 10-20 minutes
   - You'll get a download link when it's done
   - The APK will be available in your Expo dashboard

5. **Download the APK**
   - Check your email for the build completion notification
   - Or visit: https://expo.dev/accounts/[your-username]/projects/penny/builds
   - Download the APK file
   - Install on Android device (enable "Install from unknown sources" if needed)

### Environment Variables in APK Build

The `.env` file is not included in production APK builds. Environment variables are configured in `eas.json` or using EAS Secrets.

**Option 1: Using EAS Secrets (Recommended - More Secure)**

```bash
# Set secrets
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "your_api_key"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "your_domain"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "your_project_id"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "your_bucket"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "your_sender_id"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID --value "your_app_id"
eas secret:create --scope project --name EXPO_PUBLIC_LOGO_DEV_KEY --value "your_logo_dev_key"
```

Then remove the `env` section from `eas.json` - EAS will automatically use the secrets.

**Option 2: Direct Configuration in eas.json**

Environment variables can be added directly to `eas.json` in the `env` section of each build profile.

### Alternative: Local Build (Advanced)

If you want to build locally instead of using EAS cloud:

1. Install Android Studio and set up Android SDK
2. Run: `npx expo prebuild`
3. Build with: `cd android && ./gradlew assembleRelease`
4. APK will be in: `android/app/build/outputs/apk/release/app-release.apk`

### Notes
- The `preview` profile builds an APK (installable file)
- The `production` profile also builds an APK
- APK files can be installed directly on Android devices
- No Google Play Store account needed for APK distribution

## Production Setup

For production builds using EAS (Expo Application Services), environment variables are configured in `eas.json` under the `production` build profile. The `.env` file is only used for local development.

### Required Environment Variables

#### 1. Firebase

**Get your Firebase config from:** https://console.firebase.google.com

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional, for analytics)

**Note:** Make sure you're using your production Firebase project, not a test project.

#### 2. OpenAI

- `EXPO_PUBLIC_OPENAI_API_KEY` - Your OpenAI API key for AI features

**Get from:** https://platform.openai.com/api-keys

#### 3. Logo Dev Key (Optional)

- `EXPO_PUBLIC_LOGO_DEV_KEY` - API key for logo service (if used)

### Setup Methods

#### Method 1: Direct Configuration in eas.json

Edit `eas.json` and add your production credentials in the `production` profile's `env` section:

```json
{
  "build": {
    "production": {
      "env": {
        // ... Firebase, OpenAI, and other variables
      }
    }
  }
}
```

**Pros:**
- Simple and straightforward
- Easy to see all configuration in one place

**Cons:**
- Credentials are visible in the file (but eas.json should be in .gitignore)
- Less secure than using EAS Secrets

#### Method 2: EAS Secrets (Recommended for Security)

Use EAS Secrets to store sensitive credentials securely:

```bash
# Set Firebase credentials
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "your-api-key" --type string
# ... repeat for all Firebase variables

# Set OpenAI key
eas secret:create --scope project --name EXPO_PUBLIC_OPENAI_API_KEY --value "your-openai-key" --type string
```

Then remove the `env` section from `eas.json` production profile - EAS will automatically use the secrets.

**Pros:**
- More secure (credentials not in code)
- Can be managed per environment
- Can be updated without changing code

**Cons:**
- Requires EAS CLI setup
- Slightly more complex

### Steps to Configure Production

1. **Get Production Credentials**
   - **Firebase**: Ensure you're using your production Firebase project. Get config from Firebase Console → Project Settings → General
   - **OpenAI**: Get API key from https://platform.openai.com/api-keys. Ensure you have production quota/billing set up

2. **Update eas.json**
   Edit `eas.json` and replace placeholder values in the `production` profile

3. **Verify Configuration**
   Before building, verify:
   - ✅ All placeholder values replaced with real credentials
   - ✅ Firebase project is production (not test/dev)
   - ✅ All API keys are valid and have proper permissions

4. **Build Production APK**
   ```bash
   # Build production APK
   eas build --platform android --profile production
   
   # Or for iOS
   eas build --platform ios --profile production
   ```

### Security Best Practices

1. **Never commit credentials to Git:**
   - Ensure `eas.json` is in `.gitignore` if it contains secrets
   - Or use EAS Secrets instead

2. **Rotate keys regularly:**
   - Update API keys periodically
   - Revoke old keys when rotating

3. **Limit API key permissions:**
   - Only grant necessary permissions
   - Use separate keys for different services

### Testing Production Build

Before releasing:

1. **Test Firebase:**
   - Verify authentication works
   - Test data sync
   - Check cloud storage

2. **Test AI features:**
   - Verify OpenAI integration


## Production Readiness Checklist

Use this checklist to ensure your app is ready for production deployment.

### ✅ Environment Variables Configuration

#### Firebase
- [ ] Production Firebase project configured
- [ ] All Firebase environment variables set in `eas.json`:
  - [ ] `EXPO_PUBLIC_FIREBASE_API_KEY`
  - [ ] `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - [ ] `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
  - [ ] `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - [ ] `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - [ ] `EXPO_PUBLIC_FIREBASE_APP_ID`
  - [ ] `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`

#### OpenAI
- [ ] Production API key obtained
- [ ] API key has sufficient quota/billing configured
- [ ] `EXPO_PUBLIC_OPENAI_API_KEY` set in `eas.json` production profile

#### Logo Dev Key (if used)
- [ ] Production key obtained (if different from dev)
- [ ] `EXPO_PUBLIC_LOGO_DEV_KEY` set in `eas.json` production profile

### ✅ Code Configuration

#### App Configuration
- [ ] `app.json` has correct bundle identifier/package name
- [ ] App version number is correct
- [ ] Deep link scheme configured: `penny://`
- [ ] Icons and splash screens are production-ready

### ✅ Security

- [ ] No hardcoded credentials in code
- [ ] `.env` file is in `.gitignore`
- [ ] Sensitive values are in `eas.json` or EAS Secrets (not committed)
- [ ] API keys have appropriate permissions/restrictions
- [ ] Production credentials are different from development

### ✅ Testing

#### Pre-Production Testing
- [ ] Test Firebase authentication
- [ ] Test data sync to Firebase
- [ ] Test AI features with production API key
- [ ] Test on physical devices (Android/iOS)

#### Production Build Testing
- [ ] Build production APK/IPA successfully
- [ ] Install and test production build
- [ ] Verify all environment variables are loaded correctly
- [ ] Test all critical features in production build

### ✅ Deployment

#### Before Building
- [ ] All checklist items completed
- [ ] Credentials verified in `eas.json` production profile

#### Build Command
```bash
# Android
eas build --platform android --profile production

# iOS
eas build --platform ios --profile production
```

#### After Building
- [ ] Download and test production build
- [ ] Verify all features work correctly
- [ ] Monitor for any errors in production

## Testing Notifications

### Quick Test (Easiest)

1. **Open Settings** in the app
2. **Scroll to "Test Notifications"** section
3. **Tap "Send Test Notification"**
4. You should see a notification immediately!

### Testing Different Notification Types

#### Method 1: Using Test Button (Settings Screen)
- Go to Settings → Test Notifications
- Tap "Send Test Notification"
- This sends a generic test notification immediately

#### Method 2: Test Real Notifications

**Test Low Balance Alert**
1. Go to **Accounts** screen
2. Add or edit an account
3. Set balance to **below your threshold** (e.g., if threshold is $100, set balance to $50)
4. Go to **Settings** → **Reminders** → Enable "Low Balance Alerts"
5. The notification should appear immediately

**Test Subscription Reminder**
1. Go to **Subscriptions** screen
2. Add a subscription with:
   - Next billing date: **Tomorrow** or **3 days from now**
3. Go to **Settings** → **Reminders** → Enable "Subscription Reminders"
4. The notification will be scheduled for the appropriate time

**Test Budget Alert**
1. Go to **Budgets** screen
2. Create a budget (e.g., Food & Dining, $100 limit)
3. Go to **Transactions** and add expenses in that category
4. When you reach **80%, 90%, or 100%** of the budget, you'll get an alert
5. Make sure **Settings** → **Reminders** → "Budget Alerts" is enabled

**Test Debt Reminder**
1. Go to **Finance** → **Debts**
2. Add a debt with:
   - Due date: **Tomorrow** or **3 days from now**
3. Go to **Settings** → **Reminders** → Enable "Subscription Reminders" (also controls debt reminders)
4. The notification will be scheduled

**Test Daily Reminder**
1. Go to **Settings** → **Reminders**
2. Enable "Daily Account Update"
3. Set the time to **a few minutes from now** (for testing)
4. The notification will appear at the scheduled time

### Testing on Different Platforms

**Android**
- Notifications work in both foreground and background
- Make sure notification permissions are granted
- Test with app in background for best results

**iOS**
- Notifications work when app is in background
- In foreground, notifications appear as banners (if enabled in settings)
- Make sure notification permissions are granted in device Settings

**Web**
- Notifications require browser permission
- Click "Allow" when prompted
- Works best in Chrome/Edge browsers

### Troubleshooting Notifications

**Notifications Not Appearing?**

1. **Check Permissions**
   - Android: Settings → Apps → Penny → Notifications (should be ON)
   - iOS: Settings → Penny → Notifications (should be ON)
   - Web: Check browser notification settings

2. **Check App Settings**
   - Settings → Notifications → "Enable Notifications" should be ON
   - Settings → Notifications → "Sound" should be ON (if you want sound)

3. **Check Reminder Settings**
   - Make sure the specific reminder type is enabled
   - For subscriptions/debts: Enable "Subscription Reminders"
   - For budgets: Enable "Budget Alerts"
   - For low balance: Enable "Low Balance Alerts"

4. **Test Immediately**
   - Use the "Send Test Notification" button in Settings
   - This bypasses all scheduling and sends immediately

5. **Check Console Logs**
   - Look for "All notifications scheduled successfully" message
   - Check for any error messages

### Testing Scheduled Notifications

For notifications that are scheduled (not immediate):

1. **Set dates close to now** for testing:
   - Subscription due date: Tomorrow
   - Debt due date: Tomorrow
   - Daily reminder: Set time to 1-2 minutes from now

2. **Wait for the scheduled time** or:
   - Change your device time (not recommended)
   - Use the test button for immediate testing

### Advanced Testing

**View All Scheduled Notifications**
You can add this to your code temporarily:
```javascript
import * as Notifications from 'expo-notifications';
const all = await Notifications.getAllScheduledNotificationsAsync();
console.log('Scheduled notifications:', all);
```

**Cancel All Notifications**
```javascript
import { cancelAllNotifications } from '../services/notifications';
await cancelAllNotifications();
```

### Notes
- **Immediate notifications** (low balance, budget alerts) appear right away
- **Scheduled notifications** (subscriptions, debts, daily) appear at the scheduled time
- **Test notifications** always appear immediately
- Notifications work best when the app is in the background
- On iOS, foreground notifications appear as banners (if enabled)

## Tech Stack

- **React Native** with Expo - Cross-platform mobile development
- **TypeScript** - Type-safe code
- **SQLite** - Local data storage
- **Firebase Firestore** - Cloud database and authentication
- **OpenAI API** - AI financial analysis
- **Expo Notifications** - Push notifications

## Project Structure

```
src/
  ├── components/     # Reusable UI components
  ├── database/       # SQLite database operations
  ├── screens/        # App screens
  ├── services/       # AI, notifications, and Firebase services
  ├── theme/          # Design system (colors, typography)
  └── utils/          # Utility functions (currency, icons)
```

## Troubleshooting

### Firebase Issues

- **"Firebase not available"**: Check your `.env` file has all required variables
- **Permission denied**: Check your Firestore security rules
- **Data not syncing**: Ensure you have internet connection and Firebase is properly initialized

### Authentication Issues

- **"Email already in use"**: User already has an account - use Login instead
- **"Weak password"**: Password must be at least 6 characters
- **"Invalid email"**: Check email format (must include @ and domain)
- **Session not persisting**: Make sure Firebase is properly initialized and user completed registration successfully

### Environment Variables

- Make sure all required environment variables are set in `.env` file
- For APK builds, use EAS Secrets or configure in `eas.json`
- Variables must start with `EXPO_PUBLIC_` to be accessible in the app

### Production Build Issues

- **"Invalid credentials" error**: Verify credentials are correct in `eas.json`
- **"Configuration not found" error**: Verify all environment variables are set in `eas.json`, check variable names match exactly (case-sensitive), restart build after changing `eas.json`

## Security Best Practices

- ✅ Passwords are hashed by Firebase (never stored in plain text)
- ✅ Email verification can be added later
- ✅ Two-factor authentication can be added later
- ✅ Rate limiting is handled by Firebase
- ✅ Secure token-based sessions
- ✅ User data isolation (each user only sees their data)
- ✅ Never commit credentials to Git
- ✅ Use EAS Secrets for production builds
- ✅ Rotate API keys regularly
- ✅ Limit API key permissions

## Notes

- The app is designed with a minimalist black & white theme
- Cloud sync requires Firebase configuration
- AI features require an active OpenAI API key
- Push notifications require device permissions
- All financial data is stored securely with user isolation

## License

MIT
