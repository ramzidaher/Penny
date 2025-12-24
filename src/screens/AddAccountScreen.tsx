import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { addAccount } from '../database/db';
import { scheduleAllNotifications } from '../services/notifications';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export default function AddAccountScreen() {
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [type, setType] = useState<'bank' | 'card' | 'cash' | 'investment'>('bank');
  const [balance, setBalance] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an account name');
      return;
    }

    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      Alert.alert('Error', 'Please enter a valid balance');
      return;
    }

    try {
      await addAccount({
        name: name.trim(),
        type,
        balance: balanceNum,
        currency: 'USD',
      });
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
});

