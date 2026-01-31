import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { getTransactions, deleteTransaction, untagTransaction } from '../database/db';
import { Transaction } from '../database/schema';
import { TransactionType } from '../utils/categories';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { format } from 'date-fns';
import SwipeableTransactionCard from '../components/SwipeableTransactionCard';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import SubscriptionCreationDialog from '../components/SubscriptionCreationDialog';
import BudgetCreationDialog from '../components/BudgetCreationDialog';
import DebtCreationDialog from '../components/DebtCreationDialog';
import { SkeletonList } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';
import { filterTransactionsByPeriod, getPeriodLabel, FilterPeriod } from '../utils/transactionFilters';
import { useDialog } from '../contexts/DialogContext';
import ScreenHeader from '../components/ScreenHeader';
import { getBudgets, updateTransaction } from '../database/db';
import { suggestCategory, learnFromCategorization } from '../services/categoryService';

type TabType = 'income' | 'expense' | 'all';
type FilterType = 'all' | 'subscriptions' | 'debts' | 'untagged';

export default function IncomeExpenseScreen() {
  const router = useRouter();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [debtDialogVisible, setDebtDialogVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'right-income-left-expense' | 'right-expense-left-income'>(
    'right-income-left-expense'
  );

  const loadTransactions = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [trans, settings] = await Promise.all([
        getTransactions(),
        getSettings(),
      ]);
      setTransactions(trans);
      setCurrencyCode(settings.defaultCurrency);
      setSwipeDirection(settings.swipeDirection);
    } catch (error) {
      console.error('[IncomeExpenseScreen] Error loading transactions:', error);
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
    await loadTransactions();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    const result = await dialog.showDialog(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(id);
              await loadTransactions();
            } catch (error) {
              dialog.alert('Error', 'Failed to delete transaction');
            }
          },
        },
      ]
    );
  };

  const handleUntag = async (id: string, type: 'subscription' | 'debt') => {
    try {
      await untagTransaction(id, type);
      await loadTransactions();
    } catch (error) {
      dialog.alert('Error', `Failed to untag ${type}`);
    }
  };

  const handleSwipeRight = async (transaction: Transaction) => {
    // Get swipe direction preference
    const rightSwipeType = swipeDirection === 'right-income-left-expense' ? 'income' : 'expense';
    
    // First uncategorize if it has tags (income shouldn't have subscription/debt tags)
    if (rightSwipeType === 'income' && (transaction.subscriptionId || transaction.debtId)) {
      try {
        await untagTransaction(transaction.id, 'all');
      } catch (error) {
        console.error('Error uncategorizing before marking as income:', error);
      }
    }
    
    const suggestion = await suggestCategory(transaction.description || '', rightSwipeType, transaction.amount);
    setSelectedTransaction(transaction);
    setSelectedType(rightSwipeType);
    setSuggestedCategory(suggestion.category);
    setCategoryPickerVisible(true);
  };

  const handleSwipeLeft = async (transaction: Transaction) => {
    // Get swipe direction preference
    const leftSwipeType = swipeDirection === 'right-income-left-expense' ? 'expense' : 'income';
    
    // First uncategorize if it has tags (income shouldn't have subscription/debt tags)
    if (leftSwipeType === 'income' && (transaction.subscriptionId || transaction.debtId)) {
      try {
        await untagTransaction(transaction.id, 'all');
      } catch (error) {
        console.error('Error uncategorizing before marking as income:', error);
      }
    }
    
    const suggestion = await suggestCategory(transaction.description || '', leftSwipeType, transaction.amount);
    setSelectedTransaction(transaction);
    setSelectedType(leftSwipeType);
    setSuggestedCategory(suggestion.category);
    setCategoryPickerVisible(true);
  };

  const handleCategorySelect = async (category: string) => {
    if (!selectedTransaction) return;
    
    // Close category picker first
    setCategoryPickerVisible(false);
    
    // Small delay to ensure category picker closes before showing next dialog
    await new Promise(resolve => setTimeout(resolve, 100));
    
    setPendingCategory(category);
    
    try {
      // If category is Subscription, show subscription creation dialog
      if (category === 'Subscription') {
        setSubscriptionDialogVisible(true);
        return;
      }
      
      // If it's an expense category, check if budget exists
      if (selectedType === 'expense' && category !== 'Income') {
        const budgets = await getBudgets();
        const budgetExists = budgets.some(b => b.category === category);
        
        if (!budgetExists) {
          // Show budget creation dialog
          setBudgetDialogVisible(true);
          return;
        }
      }
      
      // Check if this might be a debt-related category
      const debtCategories = ['Debt', 'Loan', 'Credit Card'];
      if (debtCategories.includes(category) || category.toLowerCase().includes('debt')) {
        setDebtDialogVisible(true);
        return;
      }
      
      // Otherwise, proceed with normal update
      await proceedWithCategoryUpdate(category);
    } catch (error) {
      console.error('[IncomeExpenseScreen] Error in category selection:', error);
      setPendingCategory(null);
      setSelectedTransaction(null);
    }
  };

  const proceedWithCategoryUpdate = async (category: string) => {
    if (!selectedTransaction) return;
    
    try {
      // Get suggestion again to check for subscription and debt links
      const suggestion = await suggestCategory(selectedTransaction.description || '', selectedType, selectedTransaction.amount);
      
      // Update transaction type, category, and links if applicable
      const updateData: Partial<Transaction> = {
        type: selectedType,
        category,
      };
      
      // If we found a matching debt, link it
      if (suggestion.debtId) {
        updateData.debtId = suggestion.debtId;
      }
      
      await updateTransaction(selectedTransaction.id, updateData);
      
      // Learn from user's categorization
      await learnFromCategorization(
        selectedTransaction.description || '',
        category,
        selectedType
      );
      
      // Reload transactions
      await loadTransactions();
    } catch (error) {
      console.error('[IncomeExpenseScreen] Error updating transaction');
    } finally {
      setSelectedTransaction(null);
      setPendingCategory(null);
      setSuggestedCategory(undefined);
    }
  };

  const handleSubscriptionDialogComplete = async (subscriptionId?: string) => {
    setSubscriptionDialogVisible(false);
    if (pendingCategory) {
      await proceedWithCategoryUpdate(pendingCategory);
    }
  };

  const handleBudgetDialogComplete = async (budgetId?: string) => {
    setBudgetDialogVisible(false);
    if (pendingCategory) {
      await proceedWithCategoryUpdate(pendingCategory);
    }
  };

  const handleDebtDialogComplete = async (debtId?: string) => {
    setDebtDialogVisible(false);
    // Debt dialog already updates the transaction with type='expense' and debtId
    // Just reload transactions to reflect changes
    await loadTransactions();
    setSelectedTransaction(null);
    setPendingCategory(null);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    await dialog.showDialog(
      'Delete Transactions',
      `Are you sure you want to delete ${selectedIds.size} transaction(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(Array.from(selectedIds).map(id => deleteTransaction(id)));
              setSelectedIds(new Set());
              await loadTransactions();
            } catch (error) {
              dialog.alert('Error', 'Failed to delete some transactions');
            }
          },
        },
      ]
    );
  };

  const handleBulkUntag = async (type: 'subscription' | 'debt') => {
    if (selectedIds.size === 0) return;

    try {
      await Promise.all(Array.from(selectedIds).map(id => untagTransaction(id, type)));
      setSelectedIds(new Set());
      await loadTransactions();
    } catch (error) {
      dialog.alert('Error', `Failed to untag ${type}s`);
    }
  };

  // Filter transactions
  const filteredData = filterTransactionsByPeriod(transactions, filterPeriod);
  let filteredTransactions = filteredData.transactions;

  // Apply tab filter
  if (activeTab === 'income') {
    filteredTransactions = filteredTransactions.filter(t => t.type === 'income');
  } else if (activeTab === 'expense') {
    filteredTransactions = filteredTransactions.filter(t => t.type === 'expense');
  }

  // Apply type filter
  if (filterType === 'subscriptions') {
    filteredTransactions = filteredTransactions.filter(t => t.subscriptionId);
  } else if (filterType === 'debts') {
    filteredTransactions = filteredTransactions.filter(t => t.debtId);
  } else if (filterType === 'untagged') {
    filteredTransactions = filteredTransactions.filter(t => !t.subscriptionId && !t.debtId);
  }

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredTransactions = filteredTransactions.filter(t =>
      t.description?.toLowerCase().includes(query) ||
      t.category?.toLowerCase().includes(query)
    );
  }

  // Calculate stats
  const income = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const net = income - expenses;

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
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
      <ScreenHeader
        title="Income & Expenses"
        rightAction={
          selectedIds.size > 0
            ? {
                icon: 'close-outline',
                onPress: () => setSelectedIds(new Set()),
              }
            : undefined
        }
      />

        {/* Stats Cards */}
        <View style={[styles.statsContainer, { paddingTop: insets.top + 12 }]}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Income</Text>
            <Text style={[styles.statValue, styles.incomeValue]}>
              {formatCurrencySync(income, currencyCode)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Expenses</Text>
            <Text style={[styles.statValue, styles.expenseValue]}>
              {formatCurrencySync(expenses, currencyCode)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Net</Text>
            <Text style={[styles.statValue, net >= 0 ? styles.incomeValue : styles.expenseValue]}>
              {formatCurrencySync(net, currencyCode)}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {(['all', 'income', 'expense'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor={colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Period Filter */}
        <View style={styles.filterBar}>
          {(['week', 'month', 'year', 'all'] as FilterPeriod[]).map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.filterButton,
                filterPeriod === period && styles.filterButtonActive,
              ]}
              onPress={() => setFilterPeriod(period)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterPeriod === period && styles.filterButtonTextActive,
                ]}
              >
                {getPeriodLabel(period)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Type Filter */}
        <View style={styles.typeFilterBar}>
          {(['all', 'subscriptions', 'debts', 'untagged'] as FilterType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeFilterButton,
                filterType === type && styles.typeFilterButtonActive,
              ]}
              onPress={() => setFilterType(type)}
            >
              <Ionicons
                name={
                  type === 'subscriptions' ? 'repeat' :
                  type === 'debts' ? 'card' :
                  type === 'untagged' ? 'link-outline' : 'list'
                }
                size={16}
                color={filterType === type ? colors.background : colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeFilterButtonText,
                  filterType === type && styles.typeFilterButtonTextActive,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <View style={styles.bulkActions}>
            <Text style={styles.bulkActionsText}>{selectedIds.size} selected</Text>
            <View style={styles.bulkButtons}>
              <TouchableOpacity
                style={styles.bulkButton}
                onPress={() => handleBulkUntag('subscription')}
              >
                <Ionicons name="repeat" size={18} color={colors.text} />
                <Text style={styles.bulkButtonText}>Untag Sub</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bulkButton}
                onPress={() => handleBulkUntag('debt')}
              >
                <Ionicons name="card" size={18} color={colors.text} />
                <Text style={styles.bulkButtonText}>Untag Debt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkButton, styles.bulkButtonDanger]}
                onPress={handleBulkDelete}
              >
                <Ionicons name="trash" size={18} color={colors.error} />
                <Text style={[styles.bulkButtonText, styles.bulkButtonTextDanger]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={64} color={colors.textLight} />
              <Text style={styles.emptyText}>No transactions found</Text>
              <Text style={styles.emptySubtext}>
                {searchQuery ? 'Try a different search term' : 'No transactions match your filters'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SwipeableTransactionCard
              transaction={item}
              currencyCode={currencyCode}
              onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: item.id } })}
              onSwipeRight={() => handleSwipeRight(item)}
              onSwipeLeft={() => handleSwipeLeft(item)}
              onDelete={() => handleDelete(item.id)}
              showTagBadges={true}
              swipeDirection={swipeDirection}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
        
        <CategoryPickerDialog
          visible={categoryPickerVisible}
          type={selectedType}
          onSelect={handleCategorySelect}
          onClose={() => {
            // Only clear if we're not about to show another dialog
            if (!subscriptionDialogVisible && !budgetDialogVisible && !debtDialogVisible) {
              setCategoryPickerVisible(false);
              setSelectedTransaction(null);
              setSuggestedCategory(undefined);
              setPendingCategory(null);
            } else {
              // Just close the category picker, keep transaction for next dialog
              setCategoryPickerVisible(false);
            }
          }}
          suggestedCategory={suggestedCategory}
        />
        
        <SubscriptionCreationDialog
          visible={subscriptionDialogVisible}
          transaction={selectedTransaction}
          onClose={() => {
            setSubscriptionDialogVisible(false);
            setPendingCategory(null);
          }}
          onComplete={handleSubscriptionDialogComplete}
        />
        
        <BudgetCreationDialog
          visible={budgetDialogVisible}
          transaction={selectedTransaction}
          category={pendingCategory || ''}
          onClose={() => {
            setBudgetDialogVisible(false);
            setPendingCategory(null);
          }}
          onComplete={handleBudgetDialogComplete}
        />
        
        <DebtCreationDialog
          visible={debtDialogVisible}
          transaction={selectedTransaction}
          category={pendingCategory || ''}
          onClose={() => {
            setDebtDialogVisible(false);
            setPendingCategory(null);
          }}
          onComplete={handleDebtDialogComplete}
          onNavigateToDebts={() => {
            router.push('/(tabs)/finance/debts' as any);
          }}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '700',
  },
  incomeValue: {
    color: colors.primary,
  },
  expenseValue: {
    color: colors.text,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  tabTextActive: {
    color: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  filterButtonTextActive: {
    color: colors.background,
  },
  typeFilterBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  typeFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  typeFilterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeFilterButtonText: {
    ...typography.bodySmall,
    fontSize: 12,
    color: colors.textSecondary,
  },
  typeFilterButtonTextActive: {
    color: colors.background,
  },
  bulkActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bulkActionsText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  bulkButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  bulkButtonDanger: {
    borderColor: colors.error,
  },
  bulkButtonText: {
    ...typography.bodySmall,
    fontSize: 12,
    color: colors.text,
  },
  bulkButtonTextDanger: {
    color: colors.error,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
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
});

