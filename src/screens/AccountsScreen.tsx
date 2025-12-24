import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, deleteAccount } from '../database/db';
import { Account } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SkeletonCard, SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

export default function AccountsScreen() {
  const navigation = useNavigation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadAccounts = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [accs, settings] = await Promise.all([
        getAccounts(),
        getSettings(),
      ]);
      setAccounts(accs);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAccounts();
    }, 100);
    const unsubscribe = navigation.addListener('focus', loadAccounts);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteAccount(id);
    await loadAccounts();
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank':
        return 'business';
      case 'card':
        return 'card';
      case 'cash':
        return 'cash';
      case 'investment':
        return 'trending-up';
      default:
        return 'wallet';
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          <SkeletonList count={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No accounts yet</Text>
            <Text style={styles.emptySubtext}>Add your first account to get started</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.accountCard}>
            <View style={styles.accountLeft}>
              <View style={styles.accountIcon}>
                <Ionicons name={getAccountIcon(item.type) as any} size={24} color={colors.background} />
              </View>
              <View>
                <Text style={styles.accountName}>{item.name}</Text>
                <Text style={styles.accountType}>{item.type}</Text>
              </View>
            </View>
            <View style={styles.accountRight}>
              <Text style={styles.accountBalance}>{formatCurrencySync(item.balance, currencyCode)}</Text>
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddAccount' as never)}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 20,
  },
  accountCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  accountType: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  accountRight: {
    alignItems: 'flex-end',
  },
  accountBalance: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  deleteButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});

