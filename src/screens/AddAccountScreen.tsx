import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { addAccount, getAccounts } from '../database/db';
import { scheduleAllNotifications } from '../services/notifications';
import { Account } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export default function AddAccountScreen() {
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [type, setType] = useState<'bank' | 'card' | 'cash' | 'investment'>('bank');
  const [balance, setBalance] = useState('');
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardPin, setCardPin] = useState('');

  useEffect(() => {
    const loadBankAccounts = async () => {
      if (type === 'card') {
        const accounts = await getAccounts();
        // Only show bank accounts for linking
        const banks = accounts.filter(acc => acc.type === 'bank');
        setBankAccounts(banks);
        if (banks.length > 0 && !linkedAccountId) {
          setLinkedAccountId(banks[0].id);
        }
      }
    };
    loadBankAccounts();
  }, [type]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an account name');
      return;
    }

    // For cards, require linking to a bank account
    if (type === 'card' && !linkedAccountId) {
      Alert.alert('Error', 'Please select a bank account to link this card to');
      return;
    }

    // For cards, require card number and PIN
    if (type === 'card') {
      if (!cardNumber.trim() || cardNumber.trim().length < 4) {
        Alert.alert('Error', 'Please enter a valid card number');
        return;
      }
      if (!cardPin.trim() || cardPin.trim().length !== 4) {
        Alert.alert('Error', 'Please enter the last 4 digits of your card');
        return;
      }
    }

    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      Alert.alert('Error', 'Please enter a valid balance');
      return;
    }

    try {
      const linkedAccount = bankAccounts.find(acc => acc.id === linkedAccountId);
      const accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt'> = {
        name: name.trim(),
        type,
        balance: balanceNum,
        currency: 'USD',
      };

      // Add card-specific fields
      if (type === 'card') {
        accountData.linkedAccountId = linkedAccountId;
        accountData.cardNumber = cardNumber.trim();
        accountData.cardPin = cardPin.trim();
        // Extract bank name from linked account for logo
        if (linkedAccount) {
          accountData.cardLogo = linkedAccount.name;
        }
      }

      await addAccount(accountData);
      // Reschedule notifications after adding account (for low balance checks)
      await scheduleAllNotifications();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to add account');
    }
  };

  const accountTypes: Array<{ value: 'bank' | 'card' | 'cash' | 'investment'; label: string }> = [
    { value: 'bank', label: 'Bank' },
    { value: 'card', label: 'Card' },
    { value: 'cash', label: 'Cash' },
    { value: 'investment', label: 'Investment' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>

        <View style={styles.field}>
          <Text style={styles.label}>Account Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Chase Checking"
            placeholderTextColor={colors.textLight}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Account Type</Text>
          <View style={styles.typeContainer}>
            {accountTypes.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeButton, type === t.value && styles.typeButtonActive]}
                onPress={() => setType(t.value)}
              >
                <Text style={[styles.typeButtonText, type === t.value && styles.typeButtonTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {type === 'card' && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Link to Bank Account</Text>
              {bankAccounts.length === 0 ? (
                <Text style={styles.hintText}>
                  No bank accounts found. Please create a bank account first.
                </Text>
              ) : (
                <View style={styles.pickerContainer}>
                  {bankAccounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[styles.accountOption, linkedAccountId === acc.id && styles.accountOptionActive]}
                      onPress={() => setLinkedAccountId(acc.id)}
                    >
                      <Text style={[styles.accountOptionText, linkedAccountId === acc.id && styles.accountOptionTextActive]}>
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Card Number</Text>
              <TextInput
                style={styles.input}
                value={cardNumber}
                onChangeText={setCardNumber}
                placeholder="Enter full card number"
                placeholderTextColor={colors.textLight}
                keyboardType="numeric"
                secureTextEntry
                maxLength={19}
              />
              <Text style={styles.hintText}>This will be stored securely</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Card PIN (Last 4 Digits)</Text>
              <TextInput
                style={styles.input}
                value={cardPin}
                onChangeText={(text) => {
                  // Only allow 4 digits
                  const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
                  setCardPin(digits);
                }}
                placeholder="1234"
                placeholderTextColor={colors.textLight}
                keyboardType="numeric"
                maxLength={4}
              />
              <Text style={styles.hintText}>This will be displayed on the card</Text>
            </View>
          </>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Current Balance</Text>
          <TextInput
            style={styles.input}
            value={balance}
            onChangeText={setBalance}
            placeholder="0.00"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
          />
          {type === 'card' && (
            <Text style={styles.hintText}>
              Card balance will reflect the linked bank account balance
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Account</Text>
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
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.background,
  },
  saveButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '600',
  },
  accountOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  accountOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  accountOptionText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  accountOptionTextActive: {
    color: colors.background,
  },
  hintText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
});

