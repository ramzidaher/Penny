import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Modal, KeyboardAvoidingView, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDialog } from '../contexts/DialogContext';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dialog = useDialog();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [showPINInput, setShowPINInput] = useState(false);
  const [biometricAttempted, setBiometricAttempted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const checkAuth = async () => {
      // Run all checks in parallel for better performance
      const [available, hasPin] = await Promise.all([
        isBiometricAvailable(),
        hasPIN(),
      ]);
      
      setBiometricAvailable(available);
      setPinSet(hasPin);
      
      // Always show PIN input if PIN is set (even if biometric is available)
      if (hasPin) {
        setShowPINInput(true);
      }
      
      let hasCredentials = false;
      if (available) {
        const [type, credentials] = await Promise.all([
          getBiometricType(),
          hasBiometricCredentials(),
        ]);
        setBiometricType(type);
        setHasSavedCredentials(credentials);
        hasCredentials = credentials;
      }
      
      // Auto-trigger biometric if available and credentials exist
      if (available && hasCredentials && !biometricAttempted) {
        setBiometricAttempted(true);
        // Use requestAnimationFrame for smoother animation
        requestAnimationFrame(() => {
          setTimeout(() => {
            handleBiometricUnlock();
          }, 300);
        });
      }
    };
    
    checkAuth();
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null); // Clear any previous errors
      const result = await authenticateWithBiometricForLock();
      
      if (result.success) {
        setErrorMessage(null);
        onUnlock();
      } else {
        // Show error message directly in the lock screen
        const errorMsg = result.error || 'Failed to authenticate. Please try again.';
        setErrorMessage(errorMsg);
        // Clear error after 5 seconds
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch (error: any) {
      console.error('[AppLockScreen] Biometric unlock error:', error);
      const errorMsg = error.message || 'Failed to authenticate.';
      setErrorMessage(errorMsg);
      // Clear error after 5 seconds
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [onUnlock]);

  const handlePINUnlock = useCallback(async (pinToValidate?: string) => {
    const pinValue = pinToValidate || pin;
    
    if (!pinValue || pinValue.length !== 6) {
      setErrorMessage('PIN must be exactly 6 digits');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null); // Clear any previous errors
      const isValid = await validatePIN(pinValue);
      
      if (isValid) {
        setErrorMessage(null);
        onUnlock();
      } else {
        setErrorMessage('Incorrect PIN. Please try again.');
        setPin('');
        // Clear error after 3 seconds
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (error: any) {
      console.error('[AppLockScreen] PIN unlock error:', error);
      setErrorMessage('Failed to validate PIN. Please try again.');
      setPin('');
      // Clear error after 3 seconds
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  }, [pin, onUnlock]);

  const handleUsePassword = useCallback(() => {
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
  }, [dialog]);

  const handlePINChange = useCallback((text: string) => {
    // Clear error when user starts typing
    if (errorMessage) {
      setErrorMessage(null);
    }
    
    // Only allow digits and limit to exactly 6 characters
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
    setPin(digitsOnly);
    
    // Auto-submit when exactly 6 digits entered
    if (digitsOnly.length === 6) {
      // Small delay to let user see the last digit, then validate with the actual value
      requestAnimationFrame(() => {
        setTimeout(() => {
          handlePINUnlock(digitsOnly);
        }, 200);
      });
    }
  }, [handlePINUnlock, errorMessage]);

  // Memoize biometric icon name for performance
  // iOS shows Face ID icon (person-circle-outline), Android shows fingerprint icon
  const biometricIconName = useMemo(() => {
    if (Platform.OS === 'ios' && biometricType === 'Face ID') {
      // Use person-circle-outline for Face ID on iOS
      return 'person-circle-outline';
    }
    // Use finger-print-outline for Touch ID on iOS or fingerprint on Android
    return 'finger-print-outline';
  }, [biometricType]);

  // Memoize subtitle text for performance
  const subtitleText = useMemo(() => {
    if (biometricAvailable && hasSavedCredentials && pinSet) {
      return `Use ${biometricType} or PIN to unlock`;
    } else if (biometricAvailable && hasSavedCredentials) {
      return `Use ${biometricType} to unlock`;
    } else if (pinSet) {
      return 'Enter your PIN to continue';
    }
    return 'Enter your PIN to continue';
  }, [biometricAvailable, hasSavedCredentials, pinSet, biometricType]);

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
          <Text style={styles.subtitle}>{subtitleText}</Text>

          {/* Error Message - Show if there's an error */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#FF3B30" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Biometric Button - Show if available and credentials exist */}
          {biometricAvailable && hasSavedCredentials && (
            <>
              <TouchableOpacity
                style={[styles.biometricButton, loading && styles.biometricButtonDisabled]}
                onPress={handleBiometricUnlock}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={biometricIconName}
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

          {/* PIN Input - tap to focus and show system numeric keypad */}
          {pinSet && (
            <>
              <View style={styles.pinContainer}>
                <Pressable
                  style={styles.pinDisplay}
                  onPress={() => pinInputRef.current?.focus()}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.pinDisplayText,
                      pin.length === 0 && styles.pinPlaceholderText,
                    ]}
                    pointerEvents="none"
                  >
                    {pin.length === 0 ? 'Enter 6-digit PIN' : '•'.repeat(pin.length)}
                  </Text>
                  <TextInput
                    ref={pinInputRef}
                    style={styles.pinInputOverlay}
                    value={pin}
                    onChangeText={handlePINChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                    placeholder=""
                    accessibilityLabel="PIN entry"
                    showSoftInputOnFocus={true}
                  />
                </Pressable>
              </View>
              
              {loading && !errorMessage && (
                <Text style={styles.loadingText}>Verifying...</Text>
              )}
            </>
          )}

          {/* Use Password Link */}
          <TouchableOpacity
            style={styles.passwordLink}
            onPress={handleUsePassword}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.passwordLinkText}>Use Password</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: { background: string; text: string; textSecondary: string; surface: string; primary: string; textLight: string; border: string }) =>
  StyleSheet.create({
  modalWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
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
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    fontWeight: '500',
  },
  pinContainer: {
    width: '100%',
    marginBottom: 20,
  },
  pinDisplay: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 20,
    width: '100%',
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pinInputOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    fontSize: 16,
    color: colors.text,
  },
  pinDisplayText: {
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? 8 : 4,
    fontWeight: '600',
    fontFamily: typography.fontFamily.default,
  },
  pinPlaceholderText: {
    color: colors.textLight,
    letterSpacing: 0,
    fontWeight: '500',
    fontSize: 18,
  },
  noPinText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 16,
  },
  loadingText: {
    ...typography.bodySmall,
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
    ...typography.h3,
    fontSize: 18,
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
    ...typography.bodySmall,
    marginHorizontal: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  passwordLink: {
    marginTop: 24,
    padding: 12,
  },
  passwordLinkText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    width: '100%',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFE5E5',
  },
  errorText: {
    ...typography.bodySmall,
    color: '#FF3B30',
    flex: 1,
    textAlign: 'center',
    fontWeight: '500',
  },
  });