import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTransactions, deleteTransaction } from '../database/db';
import { refreshTransactions } from '../services/transactionService';
import { Transaction } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { format } from 'date-fns';
import { getTransactionIcon } from '../utils/icons';
import CompanyLogo from '../components/CompanyLogo';
import { SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

export default function TransactionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadTransactions = async () => {
    try {
      setLoading(true);
      console.log('[TransactionsScreen] Loading transactions...');
      const [trans, settings] = await Promise.all([
        getTransactions(),
        getSettings(),
      ]);
      console.log(`[TransactionsScreen] Loaded ${trans.length} transactions`);
      setTransactions(trans);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TransactionsScreen] Error loading transactions:', errorMessage);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      console.log('[TransactionsScreen] Starting refresh...');
      await refreshTransactions();
      console.log('[TransactionsScreen] Refresh complete, reloading transactions');
    } catch (error: any) {
      console.error('[TransactionsScreen] Error refreshing transactions:', error?.message || error);
    }
    await loadTransactions();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    await loadTransactions();
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
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color={colors.textLight} />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Add your first transaction to get started</Text>
          </View>
        }
        renderItem={({ item }) => {
          const iconInfo = getTransactionIcon(item.category, item.description);
          // Try to extract company name from description
          // For subscriptions, use the description directly (it's the subscription name)
          // For other transactions, extract from description
          let companyName: string | null = null;
          if (item.category === 'Subscription') {
            companyName = item.description || null;
          } else if (item.description) {
            // Remove "Subscription: " prefix if present
            const cleanDesc = item.description.replace(/^Subscription:\s*/i, '');
            companyName = cleanDesc.split(/[,\s-]/)[0].trim();
          }
          
          return (
            <TouchableOpacity 
              style={styles.transactionCard}
              activeOpacity={0.7}
            >
              <View style={styles.transactionLeft}>
                {companyName && companyName.length > 2 ? (
                  <CompanyLogo
                    name={companyName}
                    type="transaction"
                    category={item.category}
                    description={item.description}
                    size={56}
                  />
                ) : (
                  <View style={[
                    styles.transactionIconContainer,
                    item.type === 'income' ? styles.incomeIconBg : styles.expenseIconBg
                  ]}>
                    <Ionicons
                      name={iconInfo.name}
                      size={24}
                      color={iconInfo.color}
                    />
                  </View>
                )}
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionCategory}>{item.category}</Text>
                  <Text style={styles.transactionDescription} numberOfLines={1}>
                    {item.description || 'No description'}
                  </Text>
                  <Text style={styles.transactionDate}>
                    {format(new Date(item.date), 'MMM dd, yyyy • h:mm a')}
                  </Text>
                </View>
              </View>
              <View style={styles.transactionRight}>
                <Text style={[
                  styles.transactionAmount,
                  item.type === 'income' ? styles.incomeAmount : styles.expenseAmount
                ]}>
                  {item.type === 'income' ? '+' : '-'}{formatCurrencySync(item.amount, currencyCode)}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={styles.deleteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 20 }]}
      />
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom + 80 }]}
        onPress={() => navigation.navigate('AddTransaction' as never)}
        activeOpacity={0.8}
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
    paddingBottom: 100,
  },
  transactionCard: {
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
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  transactionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  incomeIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  expenseIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  transactionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.textLight,
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  incomeAmount: {
    color: colors.primary,
  },
  expenseAmount: {
    color: colors.text,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1A1A1A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(26, 26, 26, 0.3)',
      },
    }),
  },
});
