import * as SecureStore from 'expo-secure-store';
import { getFirestoreDb, getUserId, waitForFirebase, isFirebaseAvailable } from './firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

const PIN_KEY = 'app_pin_hash';
const PIN_SALT_KEY = 'app_pin_salt';

// Lazy load expo-crypto to handle cases where native module isn't available
let Crypto: typeof import('expo-crypto') | null = null;

const getCrypto = async (): Promise<typeof import('expo-crypto')> => {
  if (Crypto) {
    // Verify functions are still available
    if (typeof Crypto.getRandomBytesAsync === 'function' && typeof Crypto.digestStringAsync === 'function') {
      return Crypto;
    }
    // Functions not available, reset and try again
    Crypto = null;
  }
  
  try {
    const cryptoModule = await import('expo-crypto');
    
    // Verify the required functions are available
    if (typeof cryptoModule.getRandomBytesAsync !== 'function') {
      throw new Error('getRandomBytesAsync is not available in expo-crypto module');
    }
    if (typeof cryptoModule.digestStringAsync !== 'function') {
      throw new Error('digestStringAsync is not available in expo-crypto module');
    }
    if (!cryptoModule.CryptoDigestAlgorithm) {
      throw new Error('CryptoDigestAlgorithm is not available in expo-crypto module');
    }
    
    Crypto = cryptoModule;
    return Crypto;
  } catch (error: any) {
    console.error('[pinService] Failed to load expo-crypto:', error);
    const errorMessage = error?.message || 'Unknown error';
    throw new Error(`Crypto module not available: ${errorMessage}. This requires a development build or production build with expo-crypto properly linked. Please rebuild your app.`);
  }
};

/**
 * Hash a PIN using SHA-256 with salt
 */
const hashPIN = async (pin: string, salt: string): Promise<string> => {
  const crypto = await getCrypto();
  const combined = `${pin}${salt}`;
  return await crypto.digestStringAsync(
    crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
};

/**
 * Generate a random salt
 */
const generateSalt = async (): Promise<string> => {
  const crypto = await getCrypto();
  const bytes = await crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Sync PIN from Firestore to local storage
 */
const syncPINFromFirestore = async (): Promise<boolean> => {
  try {
    await waitForFirebase();
    if (!isFirebaseAvailable()) {
      return false;
    }
    
    const db = getFirestoreDb();
    const userId = getUserId();
    
    if (!db || !userId) {
      return false;
    }
    
    const pinRef = doc(db, `users/${userId}/security`, 'pin');
    const pinSnap = await getDoc(pinRef);
    
    if (pinSnap.exists()) {
      const data = pinSnap.data();
      if (data.pinHash && data.salt) {
        // Store in local SecureStore for fast access
        await SecureStore.setItemAsync(PIN_KEY, data.pinHash);
        await SecureStore.setItemAsync(PIN_SALT_KEY, data.salt);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('[pinService] Error syncing PIN from Firestore:', error);
    return false;
  }
};

/**
 * Check if PIN is set (checks local first, then Firestore)
 */
export const hasPIN = async (): Promise<boolean> => {
  try {
    // Check local storage first
    const pinHash = await SecureStore.getItemAsync(PIN_KEY);
    if (pinHash !== null) {
      return true;
    }
    
    // If not in local storage, try to sync from Firestore
    const synced = await syncPINFromFirestore();
    if (synced) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[pinService] Error checking PIN:', error);
    return false;
  }
};

/**
 * Set or update PIN (stores in both local SecureStore and Firestore)
 * @param pin - Exactly 6 digit PIN
 */
export const setPIN = async (pin: string): Promise<void> => {
  try {
    // Validate PIN format - must be exactly 6 digits
    if (!/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be exactly 6 digits');
    }

    // Generate salt
    const salt = await generateSalt();
    
    // Hash PIN
    const pinHash = await hashPIN(pin, salt);

    // Store hash and salt in local SecureStore for fast access
    await SecureStore.setItemAsync(PIN_KEY, pinHash);
    await SecureStore.setItemAsync(PIN_SALT_KEY, salt);

    // Also store in Firestore for cross-device sync and persistence
    try {
      await waitForFirebase();
      if (isFirebaseAvailable()) {
        const db = getFirestoreDb();
        const userId = getUserId();
        
        if (db && userId) {
          const pinRef = doc(db, `users/${userId}/security`, 'pin');
          await setDoc(pinRef, {
            pinHash,
            salt,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
        }
      }
    } catch (firestoreError) {
      console.error('[pinService] Error storing PIN in Firestore (continuing with local storage):', firestoreError);
      // Don't throw - local storage is sufficient for basic functionality
    }
  } catch (error) {
    console.error('[pinService] Error setting PIN:', error);
    throw new Error('Failed to set PIN');
  }
};

/**
 * Validate PIN
 * @param pin - PIN to validate
 * @returns true if PIN is correct
 */
export const validatePIN = async (pin: string): Promise<boolean> => {
  try {
    let storedHash = await SecureStore.getItemAsync(PIN_KEY);
    let storedSalt = await SecureStore.getItemAsync(PIN_SALT_KEY);

    // If not in local storage, try to sync from Firestore
    if (!storedHash || !storedSalt) {
      const synced = await syncPINFromFirestore();
      if (synced) {
        storedHash = await SecureStore.getItemAsync(PIN_KEY);
        storedSalt = await SecureStore.getItemAsync(PIN_SALT_KEY);
      }
    }

    if (!storedHash || !storedSalt) {
      return false;
    }

    // Hash the provided PIN with stored salt
    const providedHash = await hashPIN(pin, storedSalt);
    const isValid = providedHash === storedHash;

    // Compare hashes
    return isValid;
  } catch (error) {
    console.error('[pinService] Error validating PIN:', error);
    return false;
  }
};

/**
 * Delete PIN
 */
export const deletePIN = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(PIN_KEY);
    await SecureStore.deleteItemAsync(PIN_SALT_KEY);
  } catch (error) {
    console.error('Error deleting PIN:', error);
  }
};

