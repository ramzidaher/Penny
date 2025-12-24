# Building APK for MeFinance

## Prerequisites
1. Expo account (free) - sign up at https://expo.dev
2. EAS CLI installed ✅ (already done)

## Steps to Build APK

### 1. Login to Expo
```bash
eas login
```
This will prompt you to:
- Enter your email (or create an account)
- Verify your email
- Complete authentication

### 2. Build the APK
Once logged in, run:
```bash
npm run build:android
```

Or directly:
```bash
eas build --platform android --profile preview
```

### 3. What Happens Next
- EAS will upload your project to Expo's servers
- Build will take 10-20 minutes
- You'll get a download link when it's done
- The APK will be available in your Expo dashboard

### 4. Download the APK
- Check your email for the build completion notification
- Or visit: https://expo.dev/accounts/[your-username]/projects/mefinance/builds
- Download the APK file
- Install on Android device (enable "Install from unknown sources" if needed)

## Alternative: Local Build (Advanced)
If you want to build locally instead of using EAS cloud:

1. Install Android Studio and set up Android SDK
2. Run: `npx expo prebuild`
3. Build with: `cd android && ./gradlew assembleRelease`
4. APK will be in: `android/app/build/outputs/apk/release/`

## Notes
- The `preview` profile builds an APK (installable file)
- The `production` profile also builds an APK
- APK files can be installed directly on Android devices
- No Google Play Store account needed for APK distribution

