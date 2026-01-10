# Android Production Build Guide

This guide explains how to build a production-ready Android APK for the Penny app.

## ⚠️ Important Security Note

**The current keystore password (`penny123`) is a default value and MUST be changed before releasing to production!** See the [Changing Keystore Password](#changing-keystore-password) section below.

## Prerequisites

- Android Studio installed
- Java JDK installed
- Node.js and npm installed
- Expo CLI installed (`npm install -g expo-cli`)

## Current Keystore Information

- **Location**: `android/app/release.keystore`
- **Alias**: `penny-release`
- **Current Password**: `penny123` ⚠️ **CHANGE THIS!**
- **Key Algorithm**: RSA 2048-bit
- **Validity**: 10,000 days

## Building for Production

### Option 1: Build in Android Studio

1. **Open the project in Android Studio**
   - Launch Android Studio
   - File → Open → Navigate to `/android` folder
   - Wait for Gradle sync to complete

2. **Build the APK**
   - Method A: Menu → Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Method B: Open Gradle panel (right side) → `app` → `Tasks` → `build` → Double-click `assembleRelease`

3. **Locate the APK**
   - The APK will be generated at:
   - `android/app/build/outputs/apk/release/app-release.apk`

### Option 2: Build from Command Line

```bash
# From project root
npm run build:android:local

# Or directly with Gradle
cd android
./gradlew assembleRelease
```

The APK will be in: `android/app/build/outputs/apk/release/app-release.apk`

### Option 3: Build with EAS (Expo Application Services)

```bash
npm run build:android:production
```

This will build in the cloud using EAS Build. The APK will be available for download from the Expo dashboard.

## Changing Keystore Password

### Step 1: Generate a New Keystore (Recommended)

**⚠️ Important**: If you change the keystore, you'll need to use the new keystore for all future updates. The old keystore cannot be used again.

1. **Delete the old keystore** (after backing it up if needed):
   ```bash
   rm android/app/release.keystore
   ```

2. **Generate a new keystore with a strong password**:
   ```bash
   cd android/app
   keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore \
     -alias penny-release -keyalg RSA -keysize 2048 -validity 10000 \
     -storepass YOUR_STRONG_PASSWORD \
     -keypass YOUR_STRONG_PASSWORD \
     -dname "CN=Penny, OU=Mobile, O=Penny, L=City, ST=State, C=US"
   ```
   
   Replace `YOUR_STRONG_PASSWORD` with a strong, unique password.

3. **Update `android/app/build.gradle`**:
   ```gradle
   release {
       // ... other config ...
       storeFile file('release.keystore')
       storePassword 'YOUR_STRONG_PASSWORD'  // Update this
       keyAlias 'penny-release'
       keyPassword 'YOUR_STRONG_PASSWORD'    // Update this
   }
   ```

### Step 2: Use Secure Password Storage (Recommended for Teams)

Instead of hardcoding passwords, use a `keystore.properties` file:

1. **Create `android/keystore.properties`** (this file is gitignored):
   ```properties
   MYAPP_RELEASE_STORE_FILE=release.keystore
   MYAPP_RELEASE_STORE_PASSWORD=your_strong_password_here
   MYAPP_RELEASE_KEY_ALIAS=penny-release
   MYAPP_RELEASE_KEY_PASSWORD=your_strong_password_here
   ```

2. **Update `android/app/build.gradle`** to use the properties file:
   ```gradle
   // Load keystore properties
   def keystorePropertiesFile = rootProject.file("keystore.properties")
   def keystoreProperties = new Properties()
   if (keystorePropertiesFile.exists()) {
       keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
   }
   
   signingConfigs {
       release {
           if (keystorePropertiesFile.exists()) {
               storeFile file(keystoreProperties['MYAPP_RELEASE_STORE_FILE'])
               storePassword keystoreProperties['MYAPP_RELEASE_STORE_PASSWORD']
               keyAlias keystoreProperties['MYAPP_RELEASE_KEY_ALIAS']
               keyPassword keystoreProperties['MYAPP_RELEASE_KEY_PASSWORD']
           } else {
               // Fallback (remove this in production)
               storeFile file('release.keystore')
               storePassword 'penny123'
               keyAlias 'penny-release'
               keyPassword 'penny123'
           }
       }
   }
   ```

3. **Add to `.gitignore`** (should already be there):
   ```
   android/keystore.properties
   ```

## Keystore Security Best Practices

1. **Never commit keystore files or passwords to version control**
   - The `.gitignore` file already excludes `*.keystore` files
   - Keep `keystore.properties` out of version control

2. **Use strong passwords**
   - Minimum 16 characters
   - Mix of uppercase, lowercase, numbers, and special characters
   - Don't use dictionary words

3. **Backup your keystore securely**
   - Store in a secure password manager
   - Keep multiple encrypted backups
   - **Losing the keystore means you cannot update your app on Google Play**

4. **Document keystore information securely**
   - Store password in a secure password manager
   - Share with team members through secure channels only
   - Never email or message passwords

5. **For production releases**
   - Use `keystore.properties` file (not hardcoded passwords)
   - Consider using environment variables in CI/CD
   - Rotate passwords periodically

## Verifying the APK

After building, verify the APK is signed correctly:

```bash
# Check APK signature
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk

# Or use apksigner (Android SDK tool)
apksigner verify --verbose android/app/build/outputs/apk/release/app-release.apk
```

## Troubleshooting

### Build fails with "keystore not found"
- Ensure `release.keystore` exists in `android/app/` directory
- Check the path in `build.gradle` is correct

### "Password was incorrect" error
- Verify the password matches what's in `build.gradle` or `keystore.properties`
- Check for extra spaces or special characters

### "Keystore was tampered with, or password was incorrect"
- The keystore file may be corrupted
- Restore from backup or generate a new keystore

### Build succeeds but app won't install
- Uninstall any previous debug versions first
- Ensure the APK is signed (check with `jarsigner` or `apksigner`)

## Publishing to Google Play Store

1. **Build an Android App Bundle (AAB)** instead of APK for Play Store:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

2. **Or use EAS Build with production profile**:
   ```bash
   eas build --platform android --profile production
   ```
   Select "aab" when prompted (or configure in `eas.json`)

3. **Upload to Google Play Console**
   - Go to [Google Play Console](https://play.google.com/console)
   - Create a new release or update existing app
   - Upload the AAB file

## Additional Resources

- [React Native Signing APK Guide](https://reactnative.dev/docs/signed-apk-android)
- [Android App Signing](https://developer.android.com/studio/publish/app-signing)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)

---

**Last Updated**: Generated automatically - update this date when making changes to the build process.


