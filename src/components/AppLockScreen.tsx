import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, Modal, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDialog } from '../contexts/DialogContext';
import { colors } from '../theme/colors';
import {
  isBiometricAvailable,
  getBiometricType,
  authenticateWithBiometricForLock,
  hasBiometricCredentials,
} from '../services/biometricService';
import { validatePIN, hasPIN } from '../services/pinService';
import { logoutUser } from '../services/firebase';

interface AppLockScreenProps {
  onUnlock: () => void;
}

export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const dialog = useDialog();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [showPINInput, setShowPINInput] = useState(false);
  const [biometricAttempted, setBiometricAttempted] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      console.log('[AppLockScreen] Starting auth check...');
      
      const available = await isBiometricAvailable();
      console.log('[AppLockScreen] Biometric available:', available);
      setBiometricAvailable(available);
      
      let hasCredentials = false;
      if (available) {
        const type = await getBiometricType();
        console.log('[AppLockScreen] Biometric type:', type);
        setBiometricType(type);
        
        hasCredentials = await hasBiometricCredentials();
        console.log('[AppLockScreen] Has biometric credentials:', hasCredentials);
        setHasSavedCredentials(hasCredentials);
      }
      
      const hasPin = await hasPIN();
      console.log('[AppLockScreen] PIN check:', { hasPin, available, hasCredentials });
      setPinSet(hasPin);
      
      // Always show PIN input if PIN is set (even if biometric is available)
      if (hasPin) {
        console.log('[AppLockScreen] PIN is set, showing PIN input');
        setShowPINInput(true);
      } else {
        console.log('[AppLockScreen] WARNING: PIN is not set but lock screen is showing!');
      }
      
      // Auto-trigger biometric if available and credentials exist
      if (available && hasCredentials && !biometricAttempted) {
        console.log('[AppLockScreen] Auto-triggering biometric unlock...');
        setBiometricAttempted(true);
        setTimeout(() => {
          handleBiometricUnlock();
        }, 300);
      } else {
        console.log('[AppLockScreen] Not auto-triggering biometric:', {
          available,
          hasCredentials,
          biometricAttempted
        });
      }
    };
    
    checkAuth();
  }, []);

  const handleBiometricUnlock = async () => {
    console.log('[AppLockScreen] handleBiometricUnlock called');
    try {
      setLoading(true);
      console.log('[AppLockScreen] Starting biometric authentication...');
      const result = await authenticateWithBiometricForLock();
      console.log('[AppLockScreen] Biometric result:', result);
      
      if (result.success) {
        console.log('[AppLockScreen] Biometric unlock successful, calling onUnlock');
        onUnlock();
      } else {
        console.log('[AppLockScreen] Biometric unlock failed:', result.error);
        // Biometric failed or cancelled - PIN input should already be visible if PIN is set
        // Just show error message
        if (!pinSet) {
          dialog.alert('Biometric Unlock Failed', result.error || 'Failed to authenticate. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('[AppLockScreen] Biometric unlock error:', error);
      // PIN input should already be visible if PIN is set
      if (!pinSet) {
        dialog.alert('Biometric Unlock Failed', error.message || 'Failed to authenticate.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePINUnlock = async (pinToValidate?: string) => {
    const pinValue = pinToValidate || pin;
    console.log('[AppLockScreen] handlePINUnlock called with PIN length:', pinValue?.length);
    
    if (!pinValue || pinValue.length !== 6) {
      console.log('[AppLockScreen] PIN validation failed: length is', pinValue?.length);
      dialog.alert('Error', 'PIN must be exactly 6 digits');
      return;
    }

    try {
      setLoading(true);
      console.log('[AppLockScreen] Validating PIN...');
      const isValid = await validatePIN(pinValue);
      console.log('[AppLockScreen] PIN validation result:', isValid);
      
      if (isValid) {
        console.log('[AppLockScreen] PIN unlock successful, calling onUnlock');
        onUnlock();
      } else {
        console.log('[AppLockScreen] PIN validation failed - incorrect PIN');
        dialog.alert('Incorrect PIN', 'The PIN you entered is incorrect. Please try again.');
        setPin('');
      }
    } catch (error: any) {
      console.error('[AppLockScreen] PIN unlock error:', error);
      dialog.alert('Error', 'Failed to validate PIN. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleUsePassword = async () => {
    dialog.showDialog(
      'Use Password',
      'This will log you out. You will need to sign in with your email and password.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logoutUser();
              // Navigation will be handled by auth state change
            } catch (error: any) {
              dialog.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handlePINChange = (text: string) => {
    // Only allow digits and limit to exactly 6 characters
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
    console.log('[AppLockScreen] PIN changed, length:', digitsOnly.length);
    setPin(digitsOnly);
    
    // Auto-submit when exactly 6 digits entered
    if (digitsOnly.length === 6) {
      console.log('[AppLockScreen] PIN reached 6 digits, auto-submitting...');
      // Small delay to let user see the last digit, then validate with the actual value
      setTimeout(() => {
        handlePINUnlock(digitsOnly);
      }, 200);
    }
  };

  return (
    <Modal
      visible={true}
      animationType="none"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={() => {
        // Prevent back button on Android
      }}
    >
      <View style={styles.modalWrapper}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentInsetAdjustmentBehavior="automatic"
          alwaysBounceVertical={false}
        >
          <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../assets/Penny Logo RD.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>App Locked</Text>
          <Text style={styles.subtitle}>
            {biometricAvailable && hasSavedCredentials && pinSet
              ? `Use ${biometricType} or PIN to unlock`
              : biometricAvailable && hasSavedCredentials
                ? `Use ${biometricType} to unlock`
                : pinSet
                  ? 'Enter your PIN to continue'
                  : 'Enter your PIN to continue'
            }
          </Text>

          {/* Biometric Button - Show if available and credentials exist */}
          {biometricAvailable && hasSavedCredentials && (
            <>
              <TouchableOpacity
                style={[styles.biometricButton, loading && styles.biometricButtonDisabled]}
                onPress={handleBiometricUnlock}
                disabled={loading}
              >
                <Ionicons 
                  name={Platform.OS === 'ios' ? 'finger-print-outline' : 'finger-print'} 
                  size={32} 
                  color={colors.background} 
                />
                <Text style={styles.biometricButtonText}>
                  {loading ? 'Authenticating...' : `Unlock with ${biometricType}`}
                </Text>
              </TouchableOpacity>
              
              {pinSet && (
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
              )}
            </>
          )}

          {/* PIN Input - PIN is mandatory, so always show if lock screen is displayed */}
          {pinSet && (
            <>
              <View style={styles.pinContainer}>
                <TextInput
                  style={styles.pinInput}
                  value={pin}
                  onChangeText={handlePINChange}
                  keyboardType="number-pad"
                  secureTextEntry={Platform.OS === 'ios'}
                  maxLength={6}
                  autoFocus={!biometricAvailable || !hasSavedCredentials}
                  editable={!loading}
                  placeholder="Enter 6-digit PIN"
                  placeholderTextColor={colors.textLight}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (pin.length === 6) {
                      handlePINUnlock(pin);
                    }
                  }}
                />
              </View>
              
              {/* Show PIN dots for visual feedback on Android */}
              {Platform.OS === 'android' && (
                <View style={styles.pinDotsContainer}>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.pinDot,
                        index < pin.length && styles.pinDotFilled,
                      ]}
                    />
                  ))}
                </View>
              )}
              
              {loading && (
                <Text style={styles.loadingText}>Verifying...</Text>
              )}
            </>
          )}

          {/* Use Password Link */}
          <TouchableOpacity
            style={styles.passwordLink}
            onPress={handleUsePassword}
            disabled={loading}
          >
            <Text style={styles.passwordLinkText}>Use Password</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
    backgroundColor: colors.background,
    minHeight: '100%',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    fontWeight: '500',
  },
  pinContainer: {
    width: '100%',
    marginBottom: 20,
  },
  pinInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 20,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? 8 : 4,
    fontWeight: '600',
    width: '100%',
    minHeight: 60,
    opacity: 1,
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  noPinText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 64,
    gap: 12,
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  biometricButtonDisabled: {
    opacity: 0.6,
  },
  biometricButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  passwordLink: {
    marginTop: 24,
    padding: 12,
  },
  passwordLinkText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
});
