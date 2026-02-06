import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Platform, Animated, Dimensions, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { Transaction, Account, Budget, Debt } from '../database/schema';
import { getAccounts, getBudgets, addDebt, updateTransaction } from '../database/db';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addMonths } from 'date-fns';
import { scheduleAllNotifications } from '../services/notifications';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const debtTypes: { value: Debt['type']; label: string }[] = [
  { value: 'loan', label: 'Loan' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'buy_now_pay_later', label: 'Buy Now Pay Later' },
  { value: 'personal', label: 'Personal Debt' },
  { value: 'other', label: 'Other' },
];

interface DebtCreationDialogProps {
  visible: boolean;
  transaction: Transaction | null;
  category: string;
  onClose: () => void;
  onComplete: (debtId?: string) => void;
  onNavigateToDebts?: () => void;
}

export default function DebtCreationDialog({
  visible,
  transaction,
  category,
  onClose,
  onComplete,
  onNavigateToDebts,
}: DebtCreationDialogProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [remainingAmount, setRemainingAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [minimumPayment, setMinimumPayment] = useState('');
  const [type, setType] = useState<Debt['type']>('loan');
  const [accountId, setAccountId] = useState<string>('');
  const [budgetCategory, setBudgetCategory] = useState<string>('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [debtDirection, setDebtDirection] = useState<'owed' | 'owing'>('owing'); // 'owing' = you owe (expense), 'owed' = owed to you (income)
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
      const [accs, buds] = await Promise.all([
        getAccounts(),
        getBudgets(),
      ]);
      setAccounts(accs);
      setBudgets(buds);
      
      if (accs.length > 0 && !accountId) {
        const transactionAccount = accs.find(a => a.id === transaction?.accountId);
        setAccountId(transactionAccount?.id || accs[0].id);
      }

      // Pre-select budget category if it matches transaction category
      if (category) {
        const matchingBudget = buds.find(b => b.category === category);
        if (matchingBudget) {
          setBudgetCategory(category);
        }
      }
    } catch (error) {
      console.error('Error loading data for debt dialog:', error);
    }
  };

  const extractMerchantName = (description: string): string => {
    if (!description) return '';
    
    const cleanDesc = description
      .replace(/^Payment\s+to\s+/i, '')
      .replace(/^Payment\s+/i, '')
      .replace(/^Loan\s+payment\s+to\s+/i, '')
      .trim();
    
    const parts = cleanDesc.split(/[,\s-]/);
    if (parts.length > 0 && parts[0].length > 2) {
      return parts[0].trim();
    }
    
    return cleanDesc || '';
  };

  const populateFromTransaction = () => {
    if (!transaction) return;

    // Extract name from description
    const merchantName = extractMerchantName(transaction.description || '');
    if (merchantName) {
      setName(merchantName);
    }

    // Pre-fill amounts (use transaction amount as minimum payment)
    if (transaction.amount > 0) {
      setMinimumPayment(transaction.amount.toString());
      // Suggest total amount as 10x the payment (common for loans)
      const suggestedTotal = transaction.amount * 10;
      setTotalAmount(suggestedTotal.toString());
      setRemainingAmount(suggestedTotal.toString());
    }

    // Pre-fill account
    if (transaction.accountId) {
      setAccountId(transaction.accountId);
    }

    // Suggest due date (1 month from transaction date)
    const transactionDate = new Date(transaction.date);
    const suggestedDate = addMonths(transactionDate, 1);
    setDueDate(suggestedDate);
  };

  const handleCreate = async () => {
    if (!transaction) return;

    if (!name.trim()) {
      return;
    }

    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      return;
    }

    if (!remainingAmount || parseFloat(remainingAmount) <= 0) {
      return;
    }

    if (parseFloat(remainingAmount) > parseFloat(totalAmount)) {
      return;
    }

    try {
      const debtId = await addDebt({
        name: name.trim(),
        description: description.trim() || '',
        totalAmount: parseFloat(totalAmount),
        remainingAmount: parseFloat(remainingAmount),
        interestRate: interestRate ? parseFloat(interestRate) : undefined,
        minimumPayment: minimumPayment ? parseFloat(minimumPayment) : undefined,
        dueDate: dueDate.toISOString(),
        accountId: accountId || undefined,
        budgetCategory: budgetCategory || undefined,
        type,
        status: 'active',
      });

      // Link transaction to debt
      // Use budgetCategory if set, otherwise use the provided category or 'Debt'
      const transactionCategory = budgetCategory || category || 'Debt';
      // If debt is 'owed' (owed to you), it's income. If 'owing' (you owe), it's expense
      const transactionType = debtDirection === 'owed' ? 'income' : 'expense';
      await updateTransaction(transaction.id, {
        type: transactionType,
        debtId,
        category: transactionCategory,
      });

      await scheduleAllNotifications();

      onComplete(debtId);
    } catch (error) {
      console.error('Error creating debt:', error);
    } finally {
      handleClose();
    }
  };

  const handleSkip = () => {
    // Just update the transaction category and type without creating debt
    if (transaction) {
      const transactionType = debtDirection === 'owed' ? 'income' : 'expense';
      updateTransaction(transaction.id, {
        type: transactionType,
        category: category || 'Debt' || transaction.category,
      }).catch(console.error);
    }
    onComplete();
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setTotalAmount('');
    setRemainingAmount('');
    setInterestRate('');
    setMinimumPayment('');
    setType('loan');
    setAccountId('');
    setBudgetCategory('');
    setDueDate(new Date());
    setShowDatePicker(false);
    setDebtDirection('owing');
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
              <Text style={styles.title}>Create Debt</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <View style={styles.directionRow}>
                <TouchableOpacity
                  style={[styles.directionButton, debtDirection === 'owing' && styles.directionButtonActive]}
                  onPress={() => setDebtDirection('owing')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-down" size={16} color={debtDirection === 'owing' ? colors.background : colors.textSecondary} />
                  <Text style={[styles.directionButtonText, debtDirection === 'owing' && styles.directionButtonTextActive]}>
                    You Owe
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.directionButton, debtDirection === 'owed' && styles.directionButtonActive]}
                  onPress={() => setDebtDirection('owed')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-up" size={16} color={debtDirection === 'owed' ? colors.background : colors.textSecondary} />
                  <Text style={[styles.directionButtonText, debtDirection === 'owed' && styles.directionButtonTextActive]}>
                    Owed to You
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Debt name"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={styles.typeContainer}>
                  {debtTypes.slice(0, 3).map((dt) => (
                    <TouchableOpacity
                      key={dt.value}
                      style={[
                        styles.typeButton,
                        type === dt.value && styles.typeButtonActive,
                      ]}
                      onPress={() => setType(dt.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.typeButtonText,
                        type === dt.value && styles.typeButtonTextActive,
                      ]}>
                        {dt.label.charAt(0)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.amountRow}>
                <View style={styles.amountField}>
                  <Text style={styles.amountLabel}>Total</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={totalAmount}
                    onChangeText={setTotalAmount}
                    placeholder="0.00"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.amountField}>
                  <Text style={styles.amountLabel}>Remaining</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={remainingAmount}
                    onChangeText={setRemainingAmount}
                    placeholder="0.00"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.amountField}>
                  <Text style={styles.amountLabel}>Min. Payment</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={minimumPayment}
                    onChangeText={setMinimumPayment}
                    placeholder="0.00"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.budgetRow}>
                {budgets.length > 0 && (
                  <View style={styles.budgetSelector}>
                    <Text style={styles.budgetLabel}>Link to Budget</Text>
                    <View style={styles.budgetChips}>
                      <TouchableOpacity
                        style={[styles.budgetChip, !budgetCategory && styles.budgetChipActive]}
                        onPress={() => setBudgetCategory('')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.budgetChipText, !budgetCategory && styles.budgetChipTextActive]}>
                          None
                        </Text>
                      </TouchableOpacity>
                      {budgets.slice(0, 3).map((budget) => (
                        <TouchableOpacity
                          key={budget.id}
                          style={[styles.budgetChip, budgetCategory === budget.category && styles.budgetChipActive]}
                          onPress={() => setBudgetCategory(budget.category)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.budgetChipText, budgetCategory === budget.category && styles.budgetChipTextActive]}>
                            {budget.category}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateLabelContainer}>
                  <Text style={styles.dateLabel}>Due Date</Text>
                </View>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                  <Text style={styles.dateButtonText}>{format(dueDate, 'MMM dd, yyyy')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
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
                              value={dueDate}
                              mode="date"
                              display="spinner"
                              onChange={(event, selectedDate) => {
                                if (selectedDate) {
                                  setDueDate(selectedDate);
                                }
                              }}
                            />
                          </View>
                        </View>
                      </Modal>
                    ) : (
                      <DateTimePicker
                        value={dueDate}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowDatePicker(false);
                          if (selectedDate) {
                            setDueDate(selectedDate);
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
                <Text style={styles.createButtonText}>Create Debt</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
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
  directionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  directionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  directionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  directionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  directionButtonTextActive: {
    color: colors.background,
    fontWeight: '700',
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
  inputLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
    marginLeft: 14,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  typeButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.background,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  amountField: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 64,
  },
  amountLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  amountInput: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    padding: 0,
    margin: 0,
  },
  budgetRow: {
    marginBottom: 12,
  },
  budgetSelector: {
    marginBottom: 0,
  },
  budgetLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  budgetChips: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  budgetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  budgetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  budgetChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  budgetChipTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  dateRow: {
    marginBottom: 0,
  },
  dateLabelContainer: {
    marginBottom: 8,
  },
  dateLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'left',
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

