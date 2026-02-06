import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBudgets, deleteBudget, getTransactions } from '../database/db';
import { Budget, Transaction } from '../database/schema';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { SkeletonList } from '../components/SkeletonLoader';
import ScreenHeader from '../components/ScreenHeader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';
import { format } from 'date-fns';

export default function BudgetsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const hasLoadedRef = useRef(false);

  const loadBudgets = async (showLoading = true) => {
    try {
      if (showLoading && !hasLoadedRef.current) {
        setLoading(true);
      }
      await waitForFirebase();
      const [buds, trans, settings] = await Promise.all([
        getBudgets(),
        getTransactions(),
        getSettings(),
      ]);
      setBudgets(buds);
      setTransactions(trans);
      setCurrencyCode(settings.defaultCurrency);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        loadBudgets(!hasLoadedRef.current);
      }, 100);
      return () => clearTimeout(timer);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudgets(false);
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteBudget(id);
    await loadBudgets(false);
  };

  const getProgressPercentage = (budget: Budget) => {
    return Math.min((budget.currentSpent / budget.limit) * 100, 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return colors.warning;
    if (percentage >= 80) return colors.textSecondary;
    return colors.primary;
  };

  const getBudgetTransactions = (budget: Budget): Transaction[] => {
    return transactions.filter(t => 
      t.type === 'expense' && 
      t.category === budget.category
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const toggleExpand = (budgetId: string) => {
    setExpandedBudgetId(expandedBudgetId === budgetId ? null : budgetId);
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
      <ScreenHeader title="Budgets" />
      <FlatList
        data={budgets}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No budgets yet</Text>
            <Text style={styles.emptySubtext}>Create a budget to track your spending</Text>
          </View>
        }
        renderItem={({ item }) => {
          const percentage = getProgressPercentage(item);
          const progressColor = getProgressColor(percentage);
          const budgetTransactions = getBudgetTransactions(item);
          const isExpanded = expandedBudgetId === item.id;
          
          return (
            <View style={styles.budgetCard}>
              <TouchableOpacity
                onPress={() => toggleExpand(item.id)}
                activeOpacity={0.7}
              >
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetCategory}>{item.category}</Text>
                  <View style={styles.budgetHeaderRight}>
                    <Text style={styles.transactionCount}>
                      {budgetTransactions.length} transaction{budgetTransactions.length !== 1 ? 's' : ''}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={colors.textSecondary} 
                    />
                  </View>
                </View>
              </TouchableOpacity>
              <View style={styles.budgetAmounts}>
                <Text
                  style={[
                    styles.budgetSpent,
                    item.currentSpent > item.limit && { color: colors.warning },
                  ]}
                >
                  {formatCurrencySync(item.currentSpent, currencyCode)}
                </Text>
                <Text style={styles.budgetLimit}>/ {formatCurrencySync(item.limit, currencyCode)}</Text>
                {item.currentSpent > item.limit && (
                  <Text style={styles.overBudgetLabel}>Over budget</Text>
                )}
              </View>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${percentage}%`, backgroundColor: progressColor }]} />
              </View>
              <Text style={styles.budgetPeriod}>{item.period}</Text>
              
              {isExpanded && (
                <View style={styles.transactionsContainer}>
                  {budgetTransactions.length === 0 ? (
                    <Text style={styles.noTransactionsText}>No transactions yet</Text>
                  ) : (
                    budgetTransactions.slice(0, 5).map((transaction) => (
                      <TouchableOpacity
                        key={transaction.id}
                        style={styles.transactionRow}
                        onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: transaction.id } })}
                      >
                        <View style={styles.transactionLeft}>
                          <Text style={styles.transactionDescription} numberOfLines={1}>
                            {transaction.description || 'Transaction'}
                          </Text>
                          <Text style={styles.transactionDate}>
                            {format(new Date(transaction.date), 'MMM dd, yyyy')}
                          </Text>
                        </View>
                        <Text style={styles.transactionAmount}>
                          {formatCurrencySync(transaction.amount, currencyCode)}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                  {budgetTransactions.length > 5 && (
                    <Text style={styles.moreTransactionsText}>
                      +{budgetTransactions.length - 5} more transactions
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: 24 + insets.bottom + 80,
            flexGrow: 1,
          },
        ]}
      />
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom + 80 }]}
        onPress={() => navigation.navigate('AddBudget' as never)}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 20,
  },
  budgetCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  budgetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  budgetCategory: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  transactionCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 4,
  },
  transactionsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 12,
  },
  transactionDescription: {
    ...typography.body,
    color: colors.text,
    marginBottom: 4,
  },
  transactionDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  transactionAmount: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  noTransactionsText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  moreTransactionsText: {
    ...typography.caption,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  budgetAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  budgetSpent: {
    ...typography.h2,
    color: colors.text,
  },
  budgetLimit: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  overBudgetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning,
    marginLeft: 8,
  },
  progressContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  budgetPeriod: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
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

