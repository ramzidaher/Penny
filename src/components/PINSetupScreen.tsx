import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, Modal, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDialog } from '../contexts/DialogContext';
import { useTheme } from '../contexts/ThemeContext';
import { setPIN } from '../services/pinService';
import { markPINSetupComplete } from '../services/pinEnforcement';

interface PINSetupScreenProps {
  onComplete: () => void;
}

export default function PINSetupScreen({ onComplete }: PINSetupScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dialog = useDialog();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [loading, setLoading] = useState(false);

  const handlePINChange = (text: string, isConfirm: boolean = false) => {
    // Only allow digits and limit to 6 characters
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
    
    if (isConfirm) {
      setConfirmPin(digitsOnly);
      
      // Auto-submit when 6 digits entered in confirm step
      if (digitsOnly.length === 6 && step === 'confirm') {
        // Use setTimeout to ensure state is updated, then check with the new value
        setTimeout(() => {
          handlePINSetup(digitsOnly);
        }, 150);
      }
    } else {
      setPin(digitsOnly);
      
      // Auto-advance when 6 digits entered in enter step
      if (digitsOnly.length === 6 && step === 'enter') {
        setTimeout(() => {
          setStep('confirm');
          // Clear confirm pin when moving to confirm step
          setConfirmPin('');
        }, 100);
      }
    }
  };

  const handlePINSetup = async (confirmPinValue?: string) => {
    // Use provided confirmPinValue or state value
    const currentConfirmPin = confirmPinValue !== undefined ? confirmPinValue : confirmPin;
    
    if (pin.length !== 6) {
      dialog.alert('Error', 'PIN must be exactly 6 digits');
      return;
    }

    if (currentConfirmPin.length !== 6) {
      dialog.alert('Error', 'Please confirm your PIN');
      return;
    }

    if (pin !== currentConfirmPin) {
      dialog.alert('Error', 'PINs do not match. Please try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
      return;
    }

    try {
      setLoading(true);
      await setPIN(pin);
      await markPINSetupComplete();
      onComplete();
    } catch (error: any) {
      console.error('[PINSetup] PIN setup error:', error);
      dialog.alert('Error', error.message || 'Failed to set PIN. Please try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('enter');
      setConfirmPin('');
    }
  };

  return (
    <Modal
      visible={true}
      animationType="none"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={() => {
        // Prevent back button - PIN setup is mandatory
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
          <Text style={styles.title}>Set Up PIN</Text>
          <Text style={styles.subtitle}>
            {step === 'enter' 
              ? 'Enter a 6-digit PIN to secure your app'
              : 'Confirm your 6-digit PIN'
            }
          </Text>

          {/* PIN Input */}
          <View style={styles.pinContainer}>
            <TextInput
              style={styles.pinInput}
              value={step === 'enter' ? pin : confirmPin}
              onChangeText={(text) => handlePINChange(text, step === 'confirm')}
              keyboardType="number-pad"
              secureTextEntry={Platform.OS === 'ios'}
              maxLength={6}
              autoFocus
              editable={!loading}
              placeholder="••••••"
              placeholderTextColor={colors.textLight}
            />
          </View>

          {/* Show PIN dots for visual feedback */}
          <View style={styles.pinDotsContainer}>
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const currentValue = step === 'enter' ? pin : confirmPin;
              return (
                <View
                  key={index}
                  style={[
                    styles.pinDot,
                    index < currentValue.length && styles.pinDotFilled,
                  ]}
                />
              );
            })}
          </View>

          {loading && (
            <Text style={styles.loadingText}>Setting up PIN...</Text>
          )}

          {/* Back button (only on confirm step) */}
          {step === 'confirm' && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              disabled={loading}
            >
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
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
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 12,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
});

