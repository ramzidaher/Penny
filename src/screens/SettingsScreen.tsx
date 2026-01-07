import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Platform } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSettings, updateSettings } from '../services/settingsService';
import { AppSettings } from '../database/settingsSchema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { waitForFirebase, logoutUser, getUserEmail } from '../services/firebase';
import { scheduleAllNotifications, sendTestNotification, requestPermissions } from '../services/notifications';

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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const userSettings = await getSettings();
      setSettings(userSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
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
      Alert.alert('Error', 'Failed to update settings');
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

  if (loading || !settings) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your app preferences</Text>
      </View>

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

      {/* Reminder Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reminders</Text>
        
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Low Balance Alerts</Text>
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
                Alert when balance is below: {settings.lowBalanceThreshold}
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
              <Text style={styles.settingLabel}>Budget Alerts</Text>
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
                  Alert.alert('Permission Required', 'Please enable notification permissions in your device settings.');
                  return;
                }
                await sendTestNotification('generic');
                Alert.alert('Success', 'Test notification sent! Check your notification tray.');
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to send test notification');
              }
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.background} />
            <Text style={styles.testButtonText}>Send Test Notification</Text>
          </TouchableOpacity>
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

        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={async () => {
              console.log('Sign out button clicked!');
              
              // Use web-compatible confirmation
              const confirmSignOut = () => {
                if (Platform.OS === 'web') {
                  return window.confirm('Are you sure you want to sign out?');
                } else {
                  return new Promise<boolean>((resolve) => {
                    Alert.alert(
                      'Sign Out',
                      'Are you sure you want to sign out?',
                      [
                        { 
                          text: 'Cancel', 
                          style: 'cancel',
                          onPress: () => resolve(false)
                        },
                        {
                          text: 'Sign Out',
                          style: 'destructive',
                          onPress: () => resolve(true),
                        },
                      ],
                      { cancelable: true, onDismiss: () => resolve(false) }
                    );
                  });
                }
              };

              const shouldSignOut = await confirmSignOut();
              
              if (shouldSignOut) {
                try {
                  console.log('Signing out...');
                  await logoutUser();
                  console.log('Sign out successful - App.tsx should handle navigation');
                  // Navigation will be handled by App.tsx auth state listener
                } catch (error: any) {
                  console.error('Sign out error:', error);
                  if (Platform.OS === 'web') {
                    window.alert(error.message || 'Failed to sign out. Please try again.');
                  } else {
                    Alert.alert('Error', error.message || 'Failed to sign out. Please try again.');
                  }
                }
              } else {
                console.log('Sign out cancelled');
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.background} />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  bottomPadding: {
    height: 40,
  },
});

