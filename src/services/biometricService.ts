import * as SecureStore from 'expo-secure-store';
import { Platform, Alert } from 'react-native';
import { loginUser } from './firebase';

const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

// Try to import LocalAuthentication statically, but handle cases where it's not available
let LocalAuthentication: typeof import('expo-local-authentication') | null = null;

try {
  // Use require for more reliable native module loading
  LocalAuthentication = require('expo-local-authentication');
} catch (error) {
  // Module not available - this is expected in Expo Go or if not properly configured
  console.warn('expo-local-authentication module not available at import time. This requires a development build or production build.');
  LocalAuthentication = null;
}

const getLocalAuthentication = () => {
  if (!LocalAuthentication) {
    return null;
  }
  
  // Verify the module has the required functions
  if (typeof LocalAuthentication.hasHardwareAsync !== 'function') {
    console.warn('expo-local-authentication module loaded but hasHardwareAsync is not available.');
    return null;
  }
  
  return LocalAuthentication;
};

export interface BiometricCredentials {
  email: string;
  password: string; // Encrypted/stored securely
}

/**
 * Check if biometric authentication is available on the device
 */
export const isBiometricAvailable = async (): Promise<boolean> => {
  try {
    const authModule = getLocalAuthentication();
    if (!authModule) {
      return false;
    }

    const compatible = await authModule.hasHardwareAsync();
    if (!compatible) {
      return false;
    }

    if (typeof authModule.isEnrolledAsync !== 'function') {
      console.warn('isEnrolledAsync is not available on expo-local-authentication module');
      return false;
    }

    const enrolled = await authModule.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
};

/**
 * Get the type of biometric authentication available
 */
export const getBiometricType = async (): Promise<string> => {
  try {
    const authModule = getLocalAuthentication();
    if (!authModule) {
      return 'Biometric';
    }

    if (typeof authModule.supportedAuthenticationTypesAsync !== 'function') {
      return 'Biometric';
    }

    const types = await authModule.supportedAuthenticationTypesAsync();
    if (authModule.AuthenticationType && types.includes(authModule.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    } else if (authModule.AuthenticationType && types.includes(authModule.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    } else if (authModule.AuthenticationType && types.includes(authModule.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    return 'Biometric';
  } catch (error) {
    console.error('Error getting biometric type:', error);
    return 'Biometric';
  }
};

/**
 * Authenticate using biometrics
 */
export const authenticateWithBiometric = async (
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authModule = getLocalAuthentication();
    if (!authModule) {
      return {
        success: false,
        error: 'Biometric authentication module is not available. Please rebuild the app with a development build.',
      };
    }

    if (typeof authModule.authenticateAsync !== 'function') {
      return {
        success: false,
        error: 'Biometric authentication functions are not available. Please rebuild the app with a development build.',
      };
    }

    const available = await isBiometricAvailable();
    if (!available) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device',
      };
    }

    const biometricType = await getBiometricType();
    const result = await authModule.authenticateAsync({
      promptMessage: reason || `Authenticate with ${biometricType}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use Password',
    });

    if (result.success) {
      return { success: true };
    } else {
      if (result.error === 'user_cancel') {
        return { success: false, error: 'Authentication cancelled' };
      }
      return { success: false, error: result.error || 'Authentication failed' };
    }
  } catch (error: any) {
    console.error('Biometric authentication error:', error);
    return {
      success: false,
      error: error.message || 'Biometric authentication failed',
    };
  }
};

/**
 * Save credentials for biometric login
 */
export const saveBiometricCredentials = async (
  email: string,
  password: string
): Promise<void> => {
  try {
    const credentials: BiometricCredentials = {
      email,
      password, // SecureStore will encrypt this
    };
    await SecureStore.setItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      JSON.stringify(credentials)
    );
  } catch (error) {
    console.error('Error saving biometric credentials:', error);
    throw new Error('Failed to save credentials for biometric login');
  }
};

/**
 * Get saved credentials for biometric login
 */
export const getBiometricCredentials = async (): Promise<BiometricCredentials | null> => {
  try {
    const credentialsJson = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
    if (!credentialsJson) {
      return null;
    }
    return JSON.parse(credentialsJson) as BiometricCredentials;
  } catch (error) {
    console.error('Error getting biometric credentials:', error);
    return null;
  }
};

/**
 * Delete saved biometric credentials
 */
export const deleteBiometricCredentials = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY);
  } catch (error) {
    console.error('Error deleting biometric credentials:', error);
  }
};

/**
 * Perform biometric login - authenticates with biometric and then logs in with saved credentials
 */
export const performBiometricLogin = async (): Promise<void> => {
  try {
    // First, authenticate with biometric
    const biometricResult = await authenticateWithBiometric('Sign in to your account');
    if (!biometricResult.success) {
      throw new Error(biometricResult.error || 'Biometric authentication failed');
    }

    // Get saved credentials
    const credentials = await getBiometricCredentials();
    if (!credentials) {
      throw new Error('No saved credentials found');
    }

    // Login with saved credentials
    await loginUser(credentials.email, credentials.password);
  } catch (error: any) {
    console.error('Biometric login error:', error);
    throw error;
  }
};

/**
 * Check if biometric credentials are saved
 */
export const hasBiometricCredentials = async (): Promise<boolean> => {
  try {
    const credentials = await getBiometricCredentials();
    return credentials !== null;
  } catch (error) {
    return false;
  }
};

