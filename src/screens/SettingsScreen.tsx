import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Platform, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDialog } from '../contexts/DialogContext';
import { getSettings, updateSettings } from '../services/settingsService';
import { AppSettings } from '../database/settingsSchema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { waitForFirebase, getUserEmail, verifyPassword, getCurrentUser } from '../services/firebase';
import { scheduleAllNotifications, sendTestNotification, requestPermissions } from '../services/notifications';
import {
  isBiometricAvailable,
  getBiometricType,
  deleteBiometricCredentials,
  hasBiometricCredentials,
  saveBiometricCredentials,
} from '../services/biometricService';
import { hasPIN, setPIN, deletePIN, validatePIN } from '../services/pinService';

const currencies = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSet, setPinSet] = useState(false);
  const [settingPIN, setSettingPIN] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const userSettings = await getSettings();
      setSettings(userSettings);
      
      // Check biometric availability
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricType(type);
      }
      
      // Check if PIN is set
      const hasPin = await hasPIN();
      setPinSet(hasPin);
    } catch (error) {
      console.error('Error loading settings:', error);
      dialog.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  const handleUpdate = async (updates: Partial<AppSettings>) => {
    if (!settings) return;
    
    try {
      setSaving(true);
      
      // Handle biometric setting change
      if (updates.enableBiometric !== undefined) {
        if (!updates.enableBiometric) {
          // If disabling biometric, delete saved credentials
          await deleteBiometricCredentials();
        } else {
          // If enabling biometric, check if credentials exist
          const hasCredentials = await hasBiometricCredentials();
          if (!hasCredentials) {
            // Check if user is logged in
            const user = getCurrentUser();
            const userEmail = getUserEmail();
            
            if (!user || !userEmail) {
              // User is not logged in
              dialog.showDialog(
                'Biometric Login',
                `To enable ${biometricType} login, please sign in with your email and password first. Your credentials will be saved securely for future ${biometricType} authentication.`,
                [{ text: 'OK' }]
              );
              // Don't update the setting if user is not logged in
              setSaving(false);
              return;
            }
            
            // User is logged in but no credentials saved - prompt for password
            // Store the pending update so we can apply it after password verification
            setShowPasswordModal(true);
            // Don't update the setting yet - wait for password verification
            // Return early to prevent the setting from being updated
            setSaving(false);
            return;
          }
        }
      }
      
      await updateSettings(updates);
      const updatedSettings = await getSettings();
      setSettings(updatedSettings);
      
      // Reschedule notifications if reminder settings changed
      if (updates.enableLowBalanceAlerts !== undefined || 
          updates.enableDailyReminders !== undefined ||
          updates.enableSubscriptionReminders !== undefined ||
          updates.enableBudgetAlerts !== undefined) {
        await scheduleAllNotifications();
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      dialog.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCurrencyChange = async (currency: string) => {
    await handleUpdate({ defaultCurrency: currency });
  };

  const handleTimeChange = async (time: string) => {
    await handleUpdate({ dailyReminderTime: time });
  };

  const handleThresholdChange = async (threshold: number) => {
    await handleUpdate({ lowBalanceThreshold: threshold });
  };

  const handlePasswordVerification = async () => {
    if (!passwordInput.trim()) {
      dialog.alert('Error', 'Please enter your password');
      return;
    }

    try {
      setVerifyingPassword(true);
      const userEmail = getUserEmail();
      
      if (!userEmail) {
        dialog.alert('Error', 'User not logged in');
        setShowPasswordModal(false);
        setPasswordInput('');
        return;
      }

      // Verify password
      const isValid = await verifyPassword(passwordInput);
      
      if (!isValid) {
        dialog.alert('Error', 'Incorrect password. Please try again.');
        setPasswordInput('');
        setVerifyingPassword(false);
        return;
      }

      // Check if we're setting up biometric or PIN based on what triggered the modal
      // If biometric is already enabled, we're setting up PIN
      const isBiometricSetup = settings && !settings.enableBiometric && biometricAvailable;
      
      if (isBiometricSetup) {
        // Save credentials for biometric
        await saveBiometricCredentials(userEmail, passwordInput);
        
        // Now update the setting
        await updateSettings({ enableBiometric: true });
        const updatedSettings = await getSettings();
        setSettings(updatedSettings);
        
        // Close modal and clear password
        setShowPasswordModal(false);
        setPasswordInput('');
        
        dialog.alert('Success', `${biometricType} unlock has been enabled.`);
      } else {
        // Password verified for PIN setup - show PIN modal
        setShowPasswordModal(false);
        setPasswordInput('');
        setShowPINModal(true);
      }
    } catch (error: any) {
      console.error('Error verifying password:', error);
      dialog.alert('Error', error.message || 'Failed to verify password. Please try again.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handlePINSetup = async () => {
    if (!pinInput.trim() || pinInput.length !== 6) {
      dialog.alert('Error', 'PIN must be exactly 6 digits');
      return;
    }

    if (pinInput !== pinConfirm) {
      dialog.alert('Error', 'PINs do not match. Please try again.');
      setPinInput('');
      setPinConfirm('');
      return;
    }

    try {
      setSettingPIN(true);
      await setPIN(pinInput);
      
      setPinSet(true);
      setShowPINModal(false);
      setPinInput('');
      setPinConfirm('');
      
      dialog.alert('Success', pinSet ? 'PIN has been updated.' : 'PIN has been set. You can now use it to unlock the app.');
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      dialog.alert('Error', error.message || 'Failed to set PIN. Please try again.');
    } finally {
      setSettingPIN(false);
    }
  };

  if (loading || !settings) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Currency Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Currency</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.settingLabel}>Default Currency</Text>
          <TouchableOpacity
            style={styles.currencyDropdown}
            onPress={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
            activeOpacity={0.7}
          >
            <Text style={styles.currencyDropdownText}>
              {currencies.find(c => c.code === settings.defaultCurrency)?.symbol} {settings.defaultCurrency}
            </Text>
            <Ionicons 
              name={showCurrencyDropdown ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={colors.textSecondary} 
            />
          </TouchableOpacity>
          {showCurrencyDropdown && (
            <View style={styles.currencyDropdownList}>
              {currencies.map((currency, index) => (
                <TouchableOpacity
                  key={currency.code}
                  style={[
                    styles.currencyDropdownItem,
                    index === currencies.length - 1 && styles.currencyDropdownItemLast,
                    settings.defaultCurrency === currency.code && styles.currencyDropdownItemActive,
                  ]}
                  onPress={() => {
                    handleCurrencyChange(currency.code);
                    setShowCurrencyDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.currencyDropdownItemText,
                      settings.defaultCurrency === currency.code && styles.currencyDropdownItemTextActive,
                    ]}
                  >
                    {currency.symbol} {currency.code} - {currency.name}
                  </Text>
                  {settings.defaultCurrency === currency.code && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Transaction Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transaction Preferences</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Swipe Direction</Text>
            <Text style={styles.settingDescription}>
              Choose how you want to swipe transactions
            </Text>
          </View>
          <View style={styles.swipeDirectionContainer}>
            <TouchableOpacity
              style={[
                styles.swipeDirectionOption,
                settings.swipeDirection === 'right-income-left-expense' && styles.swipeDirectionOptionActive,
              ]}
              onPress={() => handleUpdate({ swipeDirection: 'right-income-left-expense' })}
            >
              <View style={styles.swipeDirectionVisual}>
                <View style={styles.swipeDirectionArrow}>
                  <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
                  <Text style={styles.swipeDirectionLabel}>Left</Text>
                </View>
                <Text style={styles.swipeDirectionEquals}>=</Text>
                <Text style={styles.swipeDirectionType}>Expense</Text>
                <Text style={styles.swipeDirectionEquals}>=</Text>
                <Text style={styles.swipeDirectionType}>Income</Text>
                <Text style={styles.swipeDirectionEquals}>=</Text>
                <View style={styles.swipeDirectionArrow}>
                  <Text style={styles.swipeDirectionLabel}>Right</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
                </View>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.swipeDirectionOption,
                settings.swipeDirection === 'right-expense-left-income' && styles.swipeDirectionOptionActive,
              ]}
              onPress={() => handleUpdate({ swipeDirection: 'right-expense-left-income' })}
            >
              <View style={styles.swipeDirectionVisual}>
                <View style={styles.swipeDirectionArrow}>
                  <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
                  <Text style={styles.swipeDirectionLabel}>Left</Text>
                </View>
                <Text style={styles.swipeDirectionEquals}>=</Text>
                <Text style={styles.swipeDirectionType}>Income</Text>
                <Text style={styles.swipeDirectionEquals}>=</Text>
                <Text style={styles.swipeDirectionType}>Expense</Text>
                <Text style={styles.swipeDirectionEquals}>=</Text>
                <View style={styles.swipeDirectionArrow}>
                  <Text style={styles.swipeDirectionLabel}>Right</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Reminder Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reminders</Text>
        
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Low Balances</Text>
              <Text style={styles.settingDescription}>
                Get notified when account balance is low
              </Text>
            </View>
            <Switch
              value={settings.enableLowBalanceAlerts}
              onValueChange={(value) => handleUpdate({ enableLowBalanceAlerts: value })}
              trackColor={{ false: '#E0E0E0', true: '#000000' }}
              thumbColor={settings.enableLowBalanceAlerts ? '#FFFFFF' : '#000000'}
            />
          </View>

          {settings.enableLowBalanceAlerts && (
            <View style={styles.thresholdContainer}>
              <Text style={styles.thresholdLabel}>
                when balance is below: {settings.lowBalanceThreshold}
              </Text>
              <View style={styles.thresholdButtons}>
                {[50, 100, 200, 500].map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={[
                      styles.thresholdButton,
                      settings.lowBalanceThreshold === amount && styles.thresholdButtonActive,
                    ]}
                    onPress={() => handleThresholdChange(amount)}
                  >
                    <Text
                      style={[
                        styles.thresholdButtonText,
                        settings.lowBalanceThreshold === amount && styles.thresholdButtonTextActive,
                      ]}
                    >
                      {amount}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Daily Account Update</Text>
              <Text style={styles.settingDescription}>
                Reminder to update your account balances
              </Text>
            </View>
            <Switch
              value={settings.enableDailyReminders}
              onValueChange={(value) => handleUpdate({ enableDailyReminders: value })}
              trackColor={{ false: '#E0E0E0', true: '#000000' }}
              thumbColor={settings.enableDailyReminders ? '#FFFFFF' : '#000000'}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Subscription Reminders</Text>
              <Text style={styles.settingDescription}>
                Get notified before subscription renewals
              </Text>
            </View>
            <Switch
              value={settings.enableSubscriptionReminders}
              onValueChange={(value) => handleUpdate({ enableSubscriptionReminders: value })}
              trackColor={{ false: '#E0E0E0', true: '#000000' }}
              thumbColor={settings.enableSubscriptionReminders ? '#FFFFFF' : '#000000'}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Budgets</Text>
              <Text style={styles.settingDescription}>
                Get notified when approaching budget limits
              </Text>
            </View>
            <Switch
              value={settings.enableBudgetAlerts}
              onValueChange={(value) => handleUpdate({ enableBudgetAlerts: value })}
              trackColor={{ false: '#E0E0E0', true: '#000000' }}
              thumbColor={settings.enableBudgetAlerts ? '#FFFFFF' : '#000000'}
            />
          </View>
        </View>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable Notifications</Text>
              <Text style={styles.settingDescription}>
                Allow the app to send notifications
              </Text>
            </View>
            <Switch
              value={settings.enableNotifications}
              onValueChange={(value) => handleUpdate({ enableNotifications: value })}
              trackColor={{ false: '#E0E0E0', true: '#000000' }}
              thumbColor={settings.enableNotifications ? '#FFFFFF' : '#000000'}
            />
          </View>
        </View>

        {settings.enableNotifications && (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Sound</Text>
                  <Text style={styles.settingDescription}>
                    Play sound for notifications
                  </Text>
                </View>
                <Switch
                  value={settings.enableSound}
                  onValueChange={(value) => handleUpdate({ enableSound: value })}
                  trackColor={{ false: '#E0E0E0', true: '#000000' }}
                  thumbColor={settings.enableSound ? '#FFFFFF' : '#000000'}
                />
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Badge</Text>
                  <Text style={styles.settingDescription}>
                    Show badge count on app icon
                  </Text>
                </View>
                <Switch
                  value={settings.enableBadge}
                  onValueChange={(value) => handleUpdate({ enableBadge: value })}
                  trackColor={{ false: '#E0E0E0', true: '#000000' }}
                  thumbColor={settings.enableBadge ? '#FFFFFF' : '#000000'}
                />
              </View>
            </View>
          </>
        )}
      </View>

      {/* Test Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test Notifications</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.settingDescription}>
            Send a test notification to verify notifications are working correctly.
          </Text>
          <TouchableOpacity
            style={styles.testButton}
            onPress={async () => {
              try {
                const hasPermission = await requestPermissions();
                if (!hasPermission) {
                  dialog.alert('Permission Required', 'Please enable notification permissions in your device settings.');
                  return;
                }
                await sendTestNotification('generic');
                dialog.alert('Success', 'Test notification sent! Check your notification tray.');
              } catch (error: any) {
                dialog.alert('Error', error.message || 'Failed to send test notification');
              }
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.background} />
            <Text style={styles.testButtonText}>Send Test Notification</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* AI Tone Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Tone</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.settingDescription}>
            Choose how Penny's AI talks to you. You can change this anytime.
          </Text>
          <View style={styles.toneOptionsContainer}>
            {[
              { value: 'friendly' as const, label: 'Friendly & Supportive', description: 'Warm, encouraging, gentle guidance', icon: 'heart-outline' },
              { value: 'professional' as const, label: 'Professional & Calm', description: 'Formal, measured, professional advice', icon: 'briefcase-outline' },
              { value: 'direct' as const, label: 'Direct & No-Nonsense', description: 'Straightforward, no sugar-coating, casual language', icon: 'chatbubble-outline' },
              { value: 'harsh' as const, label: 'Harsh & Brutally Honest', description: 'Uses strong language, very direct, tough love approach', icon: 'flame-outline' },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.toneOptionCard,
                  settings.aiTone === option.value && styles.toneOptionCardSelected,
                ]}
                onPress={async () => {
                  await handleUpdate({ aiTone: option.value });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.toneOptionHeader}>
                  <Ionicons 
                    name={option.icon as any} 
                    size={20} 
                    color={settings.aiTone === option.value ? colors.primary : colors.textSecondary} 
                  />
                  <View style={styles.toneOptionTextContainer}>
                    <Text style={[
                      styles.toneOptionLabel,
                      settings.aiTone === option.value && styles.toneOptionLabelSelected,
                    ]}>
                      {option.label}
                    </Text>
                    <Text style={styles.toneOptionDescription}>{option.description}</Text>
                  </View>
                  {settings.aiTone === option.value && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Security Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        
        {biometricAvailable && (
          <View style={styles.sectionCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{biometricType} Unlock</Text>
                <Text style={styles.settingDescription}>
                  Use {biometricType.toLowerCase()} to unlock the app
                </Text>
              </View>
              <Switch
                value={settings.enableBiometric}
                onValueChange={async (value) => {
                  await handleUpdate({ enableBiometric: value });
                }}
                trackColor={{ false: '#E0E0E0', true: '#000000' }}
                thumbColor={settings.enableBiometric ? '#FFFFFF' : '#000000'}
              />
            </View>
          </View>
        )}
        
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>PIN Code</Text>
              <Text style={styles.settingDescription}>
                {pinSet ? 'Change your PIN code' : 'Set a PIN code to unlock the app'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.pinButton}
              onPress={() => {
                // Always show password modal first to verify identity
                setShowPasswordModal(true);
              }}
            >
              <Text style={styles.pinButtonText}>
                {pinSet ? 'Change PIN' : 'Set PIN'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Email</Text>
              <Text style={styles.settingDescription}>
                {getUserEmail() || 'Not signed in'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.bottomPadding} />
      
      {/* Password Verification Modal */}
      <Modal
        visible={showPasswordModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowPasswordModal(false);
          setPasswordInput('');
        }}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {settings && !settings.enableBiometric ? `Enable ${biometricType} Unlock` : pinSet ? 'Change PIN' : 'Set PIN'}
            </Text>
            <Text style={styles.modalDescription}>
              {settings && !settings.enableBiometric 
                ? `Enter your password to securely save your credentials for ${biometricType.toLowerCase()} authentication.`
                : 'Enter your password to verify your identity before setting up PIN.'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Password"
              placeholderTextColor={colors.textLight}
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!verifyingPassword}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowPasswordModal(false);
                  setPasswordInput('');
                  // Reload settings to ensure switch state is correct
                  loadSettings();
                }}
                disabled={verifyingPassword}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, verifyingPassword && styles.modalButtonDisabled]}
                onPress={handlePasswordVerification}
                disabled={verifyingPassword}
              >
                <Text style={styles.modalButtonConfirmText}>
                  {verifyingPassword ? 'Verifying...' : 'Enable'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* PIN Setup Modal */}
      <Modal
        visible={showPINModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowPINModal(false);
          setPinInput('');
          setPinConfirm('');
        }}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pinSet ? 'Change PIN' : 'Set PIN'}</Text>
            <Text style={styles.modalDescription}>
              Enter a 6-digit PIN code. You'll use this to unlock the app.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter 6-digit PIN"
              placeholderTextColor={colors.textLight}
              value={pinInput}
              onChangeText={(text) => setPinInput(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              editable={!settingPIN}
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 12 }]}
              placeholder="Confirm 6-digit PIN"
              placeholderTextColor={colors.textLight}
              value={pinConfirm}
              onChangeText={(text) => setPinConfirm(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              editable={!settingPIN}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowPINModal(false);
                  setPinInput('');
                  setPinConfirm('');
                }}
                disabled={settingPIN}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, settingPIN && styles.modalButtonDisabled]}
                onPress={handlePINSetup}
                disabled={settingPIN}
              >
                <Text style={styles.modalButtonConfirmText}>
                  {settingPIN ? 'Setting...' : pinSet ? 'Update' : 'Set PIN'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  currencyDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginTop: 12,
  },
  currencyDropdownText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  currencyDropdownList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  currencyDropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  currencyDropdownItemLast: {
    borderBottomWidth: 0,
  },
  currencyDropdownItemActive: {
    backgroundColor: colors.surface,
  },
  currencyDropdownItemText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  currencyDropdownItemTextActive: {
    fontWeight: '600',
    color: colors.primary,
  },
  thresholdContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  thresholdLabel: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
    fontWeight: '500',
  },
  thresholdButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  thresholdButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  thresholdButtonActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  thresholdButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  thresholdButtonTextActive: {
    color: colors.primary,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    gap: 8,
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  bottomPadding: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  pinButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  pinButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.background,
  },
  toneOptionsContainer: {
    marginTop: 16,
    gap: 12,
  },
  toneOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toneOptionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  toneOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  toneOptionTextContainer: {
    flex: 1,
  },
  toneOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  toneOptionLabelSelected: {
    color: colors.primary,
  },
  toneOptionDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  swipeDirectionContainer: {
    marginTop: 16,
    gap: 12,
  },
  swipeDirectionOption: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  swipeDirectionOptionActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '10',
  },
  swipeDirectionVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  swipeDirectionArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swipeDirectionLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  swipeDirectionEquals: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  swipeDirectionType: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
});

