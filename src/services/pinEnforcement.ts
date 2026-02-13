import * as SecureStore from 'expo-secure-store';
import { hasPIN } from './pinService';

const PIN_SETUP_REQUIRED_KEY = 'pin_setup_required';

/**
 * Check if PIN setup is required
 * PIN setup is only enforced during onboarding in the UI
 */
export const isPINSetupRequired = async (): Promise<boolean> => {
  try {
    const hasPin = await hasPIN();
    const required = !hasPin;
    // If PIN doesn't exist, setup is required
    return required;
  } catch (error) {
    console.error('[pinEnforcement] Error checking PIN setup requirement:', error);
    // Fail securely - require PIN setup if check fails
    return true;
  }
};

/**
 * Mark PIN setup as complete
 * This is called after PIN is successfully set
 */
export const markPINSetupComplete = async (): Promise<void> => {
  try {
    // PIN setup is complete when PIN exists
    // No need to store a separate flag - PIN existence is the flag
    // This function exists for clarity and future extensibility
  } catch (error) {
    console.error('Error marking PIN setup complete:', error);
  }
};

