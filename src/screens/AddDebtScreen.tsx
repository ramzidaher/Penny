import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { addDebt, getAccounts, getBudgets } from '../database/db';
import { Debt, Account, Budget } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { scheduleAllNotifications } from '../services/notifications';

const debtTypes: { value: Debt['type']; label: string }[] = [
  { value: 'loan', label: 'Loan' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'buy_now_pay_later', label: 'Buy Now Pay Later' },
  { value: 'personal', label: 'Personal Debt' },
  { value: 'other', label: 'Other' },
];

export default function AddDebtScreen() {
  const navigation = useNavigation();
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

  useEffect(() => {
    const loadData = async () => {
      const [accs, buds] = await Promise.all([
        getAccounts(),
        getBudgets(),
      ]);
      setAccounts(accs);
      setBudgets(buds);
      if (accs.length > 0 && !accountId) {
        setAccountId(accs[0].id);
      }
    };
    loadData();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a debt name');
      return;
    }
    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid total amount');
      return;
    }
    if (!remainingAmount || parseFloat(remainingAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid remaining amount');
      return;
    }
    if (parseFloat(remainingAmount) > parseFloat(totalAmount)) {
      Alert.alert('Error', 'Remaining amount cannot be greater than total amount');
      return;
    }

    try {
      const debt: Omit<Debt, 'id' | 'createdAt' | 'updatedAt'> = {
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
      };

      await addDebt(debt);
      await scheduleAllNotifications();
      navigation.goBack();
    } catch (error) {
      console.error('Error adding debt:', error);
      Alert.alert('Error', 'Failed to add debt');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Debt Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Credit Card, Student Loan"
            placeholderTextColor={colors.textLight}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Debt Type *</Text>
          <View style={styles.typeContainer}>
            {debtTypes.map((dt) => (
              <TouchableOpacity
                key={dt.value}
                style={[styles.typeButton, type === dt.value && styles.typeButtonActive]}
                onPress={() => setType(dt.value)}
              >
                <Text style={[styles.typeButtonText, type === dt.value && styles.typeButtonTextActive]}>
                  {dt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Total Amount *</Text>
          <TextInput
            style={styles.input}
            value={totalAmount}
            onChangeText={setTotalAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Remaining Amount *</Text>
          <TextInput
            style={styles.input}
            value={remainingAmount}
            onChangeText={setRemainingAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Interest Rate (%)</Text>
          <TextInput
            style={styles.input}
            value={interestRate}
            onChangeText={setInterestRate}
            placeholder="0.00"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Minimum Payment</Text>
          <TextInput
            style={styles.input}
            value={minimumPayment}
            onChangeText={setMinimumPayment}
            placeholder="0.00"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Due Date *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>{format(dueDate, 'MMM dd, yyyy')}</Text>
          </TouchableOpacity>
          {showDatePicker && (
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
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Link to Account (Optional)</Text>
          <View style={styles.pickerContainer}>
            <TouchableOpacity
              style={[styles.accountOption, !accountId && styles.accountOptionActive]}
              onPress={() => setAccountId('')}
            >
              <Text style={[styles.accountOptionText, !accountId && styles.accountOptionTextActive]}>
                None
              </Text>
            </TouchableOpacity>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[styles.accountOption, accountId === acc.id && styles.accountOptionActive]}
                onPress={() => setAccountId(acc.id)}
              >
                <Text style={[styles.accountOptionText, accountId === acc.id && styles.accountOptionTextActive]}>
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Link to Budget Category (Optional)</Text>
          <View style={styles.pickerContainer}>
            <TouchableOpacity
              style={[styles.accountOption, !budgetCategory && styles.accountOptionActive]}
              onPress={() => setBudgetCategory('')}
            >
              <Text style={[styles.accountOptionText, !budgetCategory && styles.accountOptionTextActive]}>
                None
              </Text>
            </TouchableOpacity>
            {budgets.map((budget) => (
              <TouchableOpacity
                key={budget.id}
                style={[styles.accountOption, budgetCategory === budget.category && styles.accountOptionActive]}
                onPress={() => setBudgetCategory(budget.category)}
              >
                <Text style={[styles.accountOptionText, budgetCategory === budget.category && styles.accountOptionTextActive]}>
                  {budget.category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Add Debt</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeButtonActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.background,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  dateButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  accountOptionActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.background,
  },
  accountOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  accountOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
});









