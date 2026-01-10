import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { getFirestoreDb, getUserId, isFirebaseAvailable, waitForFirebase } from './firebase';
import { AppSettings, defaultSettings } from '../database/settingsSchema';

// Helper to convert Firestore timestamp to ISO string
const timestampToISO = (timestamp: any): string => {
  if (timestamp?.toDate) {
    return timestamp.toDate().toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return timestamp || new Date().toISOString();
};

// Helper to convert ISO string to Firestore timestamp
const isoToTimestamp = (iso: string): Timestamp => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    // If invalid date, use current date
    return Timestamp.now();
  }
  return Timestamp.fromDate(date);
};

let cachedSettings: AppSettings | null = null;

// Get user settings
export const getSettings = async (): Promise<AppSettings> => {
  await waitForFirebase();
  
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  // Return cached settings if available
  if (cachedSettings) {
    return cachedSettings;
  }
  
  try {
    const userId = getUserId();
    const settingsRef = doc(db, `users/${userId}/settings`, 'app');
    const settingsSnap = await getDoc(settingsRef);
    
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      cachedSettings = {
        id: settingsSnap.id,
        userId,
        ...data,
        createdAt: timestampToISO(data.createdAt),
        updatedAt: timestampToISO(data.updatedAt),
      } as AppSettings;
      return cachedSettings;
    } else {
      // Create default settings
      const now = new Date().toISOString();
      const defaultSettingsData: AppSettings = {
        id: 'app',
        userId,
        ...defaultSettings,
        createdAt: now,
        updatedAt: now,
      };
      
      await setDoc(settingsRef, {
        ...defaultSettings,
        createdAt: isoToTimestamp(now),
        updatedAt: isoToTimestamp(now),
      });
      
      cachedSettings = defaultSettingsData;
      return cachedSettings;
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }
};

// Update user settings
export const updateSettings = async (updates: Partial<AppSettings>): Promise<void> => {
  await waitForFirebase();
  
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase is not available');
  }
  
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore database not initialized');
  }
  
  try {
    const userId = getUserId();
    const settingsRef = doc(db, `users/${userId}/settings`, 'app');
    
    // Create update data, excluding fields that shouldn't be updated
    const updateData: any = {};
    
    // Only include valid fields from updates
    const validFields: (keyof AppSettings)[] = [
      'defaultCurrency',
      'lowBalanceThreshold',
      'enableLowBalanceAlerts',
      'enableDailyReminders',
      'dailyReminderTime',
      'enableSubscriptionReminders',
      'subscriptionReminderDays',
      'enableBudgetAlerts',
      'budgetAlertThresholds',
      'enableNotifications',
      'enableSound',
      'enableBadge',
      'enableBiometric',
      'theme',
    ];
    
    validFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });
    
    // Always update the updatedAt timestamp
    updateData.updatedAt = Timestamp.now();
    
    await setDoc(settingsRef, updateData, { merge: true });
    
    // Update cache and clear it to force reload
    cachedSettings = null;
    // Reload settings to update cache
    await getSettings();
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

// Clear cache (useful for testing or when user changes)
export const clearSettingsCache = (): void => {
  cachedSettings = null;
};

