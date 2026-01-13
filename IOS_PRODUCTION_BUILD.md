# iOS Production Build Guide

This guide explains how to build a production-ready iOS app (IPA) for the Penny app that runs standalone without Expo Go.

## Prerequisites

- **For EAS Cloud Builds:**
  - Expo account (free) - sign up at https://expo.dev
  - EAS CLI installed: `npm install -g eas-cli`
  - Apple Developer account ($99/year) - required for App Store distribution
  - EAS credentials configured (EAS can manage this automatically)

- **For Local Builds:**
  - macOS computer
  - Xcode installed (latest version recommended)
  - Xcode Command Line Tools: `xcode-select --install`
  - CocoaPods installed: `sudo gem install cocoapods`
  - Apple Developer account ($99/year)
  - Valid code signing certificates and provisioning profiles

## Understanding Build Types

### Distribution Methods:

1. **App Store** - For distribution via Apple App Store
   - Requires App Store Connect setup
   - Requires App Store review process
   - Users install from App Store

2. **Ad-Hoc** - For testing on specific devices
   - Limited to 100 registered devices per year
   - No App Store review needed
   - Install via TestFlight or direct IPA distribution

3. **Enterprise** - For internal company distribution (requires Enterprise account)

## Building for Production

### Option 1: EAS Cloud Build (Recommended - Easiest)

This is the simplest method and doesn't require a Mac or Xcode setup.

#### Step 1: Login to Expo

```bash
eas login
```

#### Step 2: Configure EAS (if not already done)

```bash
eas build:configure
```

#### Step 3: Build for App Store Distribution

```bash
npm run build:ios:production
```

Or directly:
```bash
eas build --platform ios --profile production
```

This will:
- Build an IPA file ready for App Store submission
- Automatically handle code signing (if credentials are set up)
- Upload the build to EAS servers
- Provide a download link when complete

#### Step 4: Download and Submit

1. **Download the IPA:**
   - Check your email for build completion notification
   - Or visit: https://expo.dev/accounts/[your-username]/projects/penny/builds
   - Download the IPA file

2. **Submit to App Store:**
   ```bash
   npm run submit:ios
   ```
   
   Or:
   ```bash
   eas submit --platform ios --profile production
   ```

### Option 2: EAS Local Build (Requires Mac)

Build locally using EAS tooling but with your own Mac:

```bash
npm run build:ios:production:local
```

Or:
```bash
eas build --platform ios --profile production-adhoc --local
```

**Note:** This requires:
- macOS with Xcode installed
- Valid code signing certificates
- Proper provisioning profiles

### Option 3: Build with Xcode (Full Native Build)

This gives you full control over the build process.

#### Step 1: Install Dependencies

```bash
cd ios
pod install
cd ..
```

#### Step 2: Open in Xcode

```bash
open ios/Penny.xcworkspace
```

**Important:** Always open `.xcworkspace`, not `.xcodeproj`

#### Step 3: Configure Signing & Capabilities

1. In Xcode, select the **Penny** project in the navigator
2. Select the **Penny** target
3. Go to **Signing & Capabilities** tab
4. Select your **Team** (Apple Developer account)
5. Ensure **Bundle Identifier** is: `com.pennyfinance.app`
6. Xcode will automatically generate provisioning profiles

#### Step 4: Select Build Scheme

1. Click on the scheme selector (next to the play/stop buttons)
2. Select **Penny** scheme
3. Select **Any iOS Device** or a connected device (not simulator)

#### Step 5: Build Archive

1. Menu: **Product → Archive**
2. Wait for the archive to complete
3. The Organizer window will open automatically

#### Step 6: Distribute App

1. In Organizer, select your archive
2. Click **Distribute App**
3. Choose distribution method:
   - **App Store Connect** - For App Store submission
   - **Ad Hoc** - For testing on registered devices
   - **Enterprise** - For enterprise distribution
   - **Development** - For development builds
4. Follow the wizard to complete distribution

### Option 4: Command Line Build (Advanced)

Build directly from command line using `xcodebuild`:

```bash
# Navigate to iOS directory
cd ios

# Clean build folder
xcodebuild clean -workspace Penny.xcworkspace -scheme Penny

# Build archive
xcodebuild archive \
  -workspace Penny.xcworkspace \
  -scheme Penny \
  -configuration Release \
  -archivePath ./build/Penny.xcarchive \
  -allowProvisioningUpdates

# Export IPA (for App Store)
xcodebuild -exportArchive \
  -archivePath ./build/Penny.xcarchive \
  -exportPath ./build \
  -exportOptionsPlist ExportOptions.plist
```

You'll need to create an `ExportOptions.plist` file for the export step.

## Code Signing Setup

### Automatic (Recommended for EAS)

EAS can automatically manage your certificates and provisioning profiles:

```bash
eas credentials
```

This will guide you through:
- Setting up Apple Developer account connection
- Managing certificates
- Managing provisioning profiles
- Setting up App Store Connect API key

### Manual Setup

If you prefer to manage certificates manually:

1. **Create App ID in Apple Developer Portal:**
   - Go to https://developer.apple.com/account
   - Certificates, Identifiers & Profiles
   - Create App ID: `com.pennyfinance.app`

2. **Create Distribution Certificate:**
   - Certificates → + → Apple Distribution
   - Download and install in Keychain

3. **Create Provisioning Profile:**
   - Profiles → + → App Store (or Ad Hoc)
   - Select App ID: `com.pennyfinance.app`
   - Select certificate
   - Download and install

4. **Configure in Xcode:**
   - Xcode will automatically use installed profiles
   - Or specify in Signing & Capabilities

## Testing the Build

### Install on Device (Ad-Hoc Build)

1. **Build Ad-Hoc:**
   ```bash
   npm run build:ios:adhoc
   ```

2. **Register Device UDID:**
   - Get device UDID from Xcode or device settings
   - Add to Apple Developer Portal → Devices
   - Rebuild with updated provisioning profile

3. **Install IPA:**
   - Use TestFlight (recommended)
   - Or use Apple Configurator 2
   - Or use `xcrun simctl install` for simulator

### TestFlight Distribution

1. **Upload to App Store Connect:**
   ```bash
   eas submit --platform ios
   ```

2. **Configure in App Store Connect:**
   - Go to https://appstoreconnect.apple.com
   - Select your app
   - Go to TestFlight tab
   - Add internal/external testers
   - Testers receive email invitation

## Current Configuration

- **Bundle Identifier:** `com.pennyfinance.app`
- **App Name:** Penny
- **Version:** 1.0.0
- **Build Number:** 5 (increment for each build)
- **Minimum iOS Version:** 12.0

## Updating Build Number

Before each production build, update the build number:

**Option 1: In `app.json`:**
```json
{
  "expo": {
    "ios": {
      "buildNumber": "6"
    }
  }
}
```

**Option 2: In Xcode:**
- Open `ios/Penny.xcodeproj`
- Select target → General tab
- Update Build number

**Option 3: Automatic with EAS:**
EAS can auto-increment build numbers if configured.

## Environment Variables

Production environment variables are configured in `eas.json` under the `production` profile. These are automatically included in EAS builds.

Current production environment variables:
- Firebase configuration
- TrueLayer configuration
- Gemini API key
- Logo Dev key

## Troubleshooting

### "No signing certificate found"

**Solution:**
```bash
eas credentials
```
Select iOS platform and configure signing credentials.

### "Provisioning profile doesn't match"

**Solution:**
- Ensure Bundle Identifier matches: `com.pennyfinance.app`
- Regenerate provisioning profile in Apple Developer Portal
- Or let EAS manage it automatically

### "Build fails with pod install error"

**Solution:**
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

### "Archive fails in Xcode"

**Common fixes:**
1. Clean build folder: **Product → Clean Build Folder** (Shift+Cmd+K)
2. Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`
3. Reinstall pods: `cd ios && pod install && cd ..`
4. Check signing: Ensure valid team and certificates selected

### "App crashes on launch"

**Check:**
1. Ensure all native modules are properly linked
2. Check device logs in Xcode: **Window → Devices and Simulators**
3. Verify environment variables are set correctly
4. Test with development build first to isolate issues

### "Can't install on device"

**For Ad-Hoc builds:**
- Device UDID must be registered in Apple Developer Portal
- Provisioning profile must include the device
- Rebuild after adding device

**For App Store builds:**
- Must be installed via App Store or TestFlight
- Cannot install IPA directly (unless jailbroken)

## Publishing to App Store

### Step 1: Build Production IPA

```bash
npm run build:ios:production
```

### Step 2: Submit to App Store

```bash
npm run submit:ios
```

### Step 3: Complete App Store Connect Setup

1. Go to https://appstoreconnect.apple.com
2. Create new app (if first time)
3. Fill in app information:
   - Name, description, screenshots
   - Privacy policy URL
   - App category
   - Age rating
4. Submit for review

### Step 4: Monitor Review Status

- Check App Store Connect for review status
- Respond to any review feedback
- App will be live after approval

## Best Practices

1. **Always test before submitting:**
   - Use TestFlight for beta testing
   - Test on multiple devices and iOS versions
   - Test all critical features

2. **Increment build number:**
   - Each App Store submission needs a new build number
   - Version can stay same for patches

3. **Keep certificates secure:**
   - Never commit certificates to git
   - Use EAS credentials management
   - Backup certificates securely

4. **Monitor build sizes:**
   - Keep app size reasonable
   - Use App Thinning
   - Optimize assets

5. **Update dependencies regularly:**
   - Keep Expo SDK updated
   - Update native dependencies
   - Test after updates

## Quick Reference Commands

```bash
# EAS Cloud Build (App Store)
npm run build:ios:production

# EAS Cloud Build (Ad-Hoc)
npm run build:ios:adhoc

# EAS Local Build
npm run build:ios:production:local

# Submit to App Store
npm run submit:ios

# Run on device (development)
npm run build:ios:device

# Run on simulator (development)
npm run build:ios:local

# Manage credentials
eas credentials

# Check build status
eas build:list
```

## Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [iOS Code Signing Guide](https://developer.apple.com/documentation/xcode/managing-your-team-s-signing-assets)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Expo iOS Build Guide](https://docs.expo.dev/build/building-on-ci/)

---

**Last Updated**: Generated automatically - update this date when making changes to the build process.

