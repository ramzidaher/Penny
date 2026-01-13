import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Platform, Animated, Dimensions, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Transaction, Account, Subscription } from '../database/schema';
import { getAccounts, getSubscriptions, addSubscription, updateTransaction } from '../database/db';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addMonths } from 'date-fns';
import { scheduleAllNotifications } from '../services/notifications';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const frequencies = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

interface SubscriptionCreationDialogProps {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onComplete: (subscriptionId?: string) => void;
}

export default function SubscriptionCreationDialog({
  visible,
  transaction,
  onClose,
  onComplete,
}: SubscriptionCreationDialogProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existingSubscriptions, setExistingSubscriptions] = useState<Subscription[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [accountId, setAccountId] = useState('');
  const [nextBillingDate, setNextBillingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedExistingSubscription, setSelectedExistingSubscription] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && transaction) {
      loadData();
      populateFromTransaction();
      // Animate in
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, transaction]);

  const loadData = async () => {
    try {
      const [accs, subs] = await Promise.all([
        getAccounts(),
        getSubscriptions(),
      ]);
      setAccounts(accs);
      setExistingSubscriptions(subs);
      
      if (accs.length > 0 && !accountId) {
        // Prefer transaction's account, otherwise first account
        const transactionAccount = accs.find(a => a.id === transaction?.accountId);
        setAccountId(transactionAccount?.id || accs[0].id);
      }
    } catch (error) {
      console.error('Error loading data for subscription dialog:', error);
    }
  };

  const extractMerchantName = (description: string): string => {
    if (!description) return '';
    
    const cleanDesc = description
      .replace(/^Subscription:\s*/i, '')
      .replace(/^Payment\s+to\s+/i, '')
      .replace(/^Payment\s+/i, '')
      .replace(/^PURCHASE\s*-\s*/i, '')
      .replace(/^RECURRENT\s+TRANSACTION\s+AT\s+/i, '')
      .replace(/^GOOGLE\s+PAY\s+IN-APP\s+AT\s+/i, '')
      .replace(/\s+AT\s+.*$/i, '')
      .replace(/\s+OF\s+\d+\.\d+\s+\w+\s+ON\s+.*$/i, '')
      .trim();
    
    const parts = cleanDesc.split(/[,\s-]/);
    if (parts.length > 0 && parts[0].length > 2) {
      return parts[0].trim();
    }
    
    return cleanDesc || '';
  };

  const populateFromTransaction = () => {
    if (!transaction) return;

    // Extract merchant name
    const merchantName = extractMerchantName(transaction.description || '');
    if (merchantName) {
      setName(merchantName);
    }

    // Pre-fill amount
    setAmount(transaction.amount.toString());

    // Pre-fill account
    if (transaction.accountId) {
      setAccountId(transaction.accountId);
    }

    // Suggest next billing date (1 month from transaction date)
    const transactionDate = new Date(transaction.date);
    const suggestedDate = addMonths(transactionDate, 1);
    setNextBillingDate(suggestedDate);

    // Check if there's a matching existing subscription
    const matchingSub = existingSubscriptions.find(sub => {
      const subNameLower = sub.name.toLowerCase();
      const merchantLower = merchantName.toLowerCase();
      return subNameLower.includes(merchantLower) || merchantLower.includes(subNameLower);
    });

    if (matchingSub) {
      setSelectedExistingSubscription(matchingSub.id);
      setMode('link');
    }
  };

  const handleCreate = async () => {
    if (!transaction) return;

    if (!name.trim()) {
      return;
    }

    if (!accountId) {
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return;
    }

    try {
      if (mode === 'link' && selectedExistingSubscription) {
        // Link to existing subscription
        await updateTransaction(transaction.id, {
          subscriptionId: selectedExistingSubscription,
        });
        onComplete(selectedExistingSubscription);
      } else {
        // Create new subscription
        const subscriptionId = await addSubscription({
          name: name.trim(),
          amount: amountNum,
          currency: 'USD',
          frequency,
          nextBillingDate: nextBillingDate.toISOString(),
          accountId,
        });

        // Link transaction to subscription
        await updateTransaction(transaction.id, {
          subscriptionId,
        });

        await scheduleAllNotifications();
        onComplete(subscriptionId);
      }
    } catch (error) {
      console.error('Error creating/linking subscription:', error);
    } finally {
      handleClose();
    }
  };

  const handleSkip = () => {
    // Just update the transaction category without creating subscription
    if (transaction) {
      updateTransaction(transaction.id, {
        category: 'Subscription',
      }).catch(console.error);
    }
    onComplete();
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setAmount('');
    setFrequency('monthly');
    setAccountId('');
    setNextBillingDate(new Date());
    setSelectedExistingSubscription(null);
    setMode('create');
    setShowDatePicker(false);
    onClose();
  };

  if (!transaction) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: opacityAnim,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>
        
        <View style={styles.centerContainer}>
          <Animated.View
            style={[
              styles.container,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Create Subscription</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              {/* Link to existing subscription option */}
              {existingSubscriptions.length > 0 && (
                <View style={styles.existingSection}>
                  <Text style={styles.existingLabel}>Link to existing:</Text>
                  <View style={styles.existingList}>
                    {existingSubscriptions.slice(0, 3).map((sub) => (
                      <TouchableOpacity
                        key={sub.id}
                        style={[
                          styles.existingItem,
                          selectedExistingSubscription === sub.id && styles.existingItemActive,
                        ]}
                        onPress={() => {
                          setSelectedExistingSubscription(sub.id);
                          setMode('link');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.existingItemText,
                          selectedExistingSubscription === sub.id && styles.existingItemTextActive,
                        ]}>
                          {sub.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.inputRow}>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Name"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="Amount"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.periodRow}>
                <View style={styles.periodContainer}>
                  {frequencies.map((f) => (
                    <TouchableOpacity
                      key={f.value}
                      style={[
                        styles.periodButton,
                        frequency === f.value && styles.periodButtonActive,
                      ]}
                      onPress={() => setFrequency(f.value as 'weekly' | 'monthly' | 'yearly')}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.periodButtonText,
                        frequency === f.value && styles.periodButtonTextActive,
                      ]}>
                        {f.label.charAt(0)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.dateButtonText}>{format(nextBillingDate, 'MMM dd')}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <>
                    {Platform.OS === 'ios' ? (
                      <Modal
                        transparent
                        visible={showDatePicker}
                        animationType="slide"
                        onRequestClose={() => setShowDatePicker(false)}
                      >
                        <View style={styles.datePickerModal}>
                          <View style={styles.datePickerContainer}>
                            <View style={styles.datePickerHeader}>
                              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                <Text style={styles.datePickerCancel}>Cancel</Text>
                              </TouchableOpacity>
                              <Text style={styles.datePickerTitle}>Select Date</Text>
                              <TouchableOpacity
                                onPress={() => {
                                  setShowDatePicker(false);
                                }}
                              >
                                <Text style={styles.datePickerDone}>Done</Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={nextBillingDate}
                              mode="date"
                              display="spinner"
                              onChange={(event, selectedDate) => {
                                if (selectedDate) {
                                  setNextBillingDate(selectedDate);
                                }
                              }}
                            />
                          </View>
                        </View>
                      </Modal>
                    ) : (
                      <DateTimePicker
                        value={nextBillingDate}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowDatePicker(false);
                          if (selectedDate) {
                            setNextBillingDate(selectedDate);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </View>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createButton} onPress={handleCreate} activeOpacity={0.8}>
                <Text style={styles.createButtonText}>
                  {mode === 'link' ? 'Link' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  centerContainer: {
    width: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.background,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  existingSection: {
    marginBottom: 16,
  },
  existingLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  existingList: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  existingItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  existingItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  existingItemText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  existingItemTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  periodContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  periodButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  periodButtonTextActive: {
    color: colors.background,
    fontWeight: '700',
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  dateButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  createButton: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontSize: 15,
    color: colors.background,
    fontWeight: '700',
  },
  datePickerModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePickerCancel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  datePickerDone: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
});

