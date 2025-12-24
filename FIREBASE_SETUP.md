# Firebase Cloud Database Setup

This app now supports cloud storage using Firebase Firestore. Your data will be synced to the cloud and accessible across all your devices.

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard

### 2. Enable Firestore Database

1. In your Firebase project, go to **Firestore Database**
2. Click "Create database"
3. Start in **test mode** (for development) or **production mode** (for production)
4. Choose a location for your database

### 3. Enable Anonymous Authentication (Optional but Recommended)

1. Go to **Authentication** in Firebase Console
2. Click "Get started"
3. Enable **Anonymous** sign-in method
4. Save

### 4. Get Your Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Register your app (you can name it "MeFinance Web")
5. Copy the Firebase configuration object

### 5. Add Configuration to .env File

Add these environment variables to your `.env` file:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 6. Set Firestore Security Rules

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

**Important**: For production, you should use proper authentication (email/password) instead of anonymous auth.

## How It Works

- **Cloud-First**: When Firebase is configured, the app uses Firestore as the primary database
- **Local Fallback**: If Firebase is unavailable, the app falls back to local storage (SQLite/localStorage)
- **Offline Support**: Firestore automatically caches data locally for offline access
- **Auto-Sync**: Changes are automatically synced to the cloud when online

## Data Structure

Your data is stored in Firestore under:
```
users/{userId}/
  ├── accounts/
  ├── transactions/
  ├── budgets/
  └── subscriptions/
```

Each user has their own isolated data collection.

## Migration

Existing local data will continue to work. When you first use the app with Firebase:
- New data will be saved to the cloud
- You can manually migrate existing data by re-adding it (or we can add an auto-migration feature)

## Troubleshooting

- **"Firebase not available"**: Check your `.env` file has all required variables
- **Permission denied**: Check your Firestore security rules
- **Data not syncing**: Ensure you have internet connection and Firebase is properly initialized

## Next Steps

- Consider adding email/password authentication for better security
- Set up proper Firestore indexes for better query performance
- Configure Firebase Analytics if desired

