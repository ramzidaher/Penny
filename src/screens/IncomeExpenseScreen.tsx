import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { getTransactions, deleteTransaction, untagTransaction, updateTransaction, getBudgets } from '../database/db';
import { Transaction } from '../database/schema';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { format } from 'date-fns';
import SwipeableTransactionCard from '../components/SwipeableTransactionCard';
import { SkeletonList, SkeletonStatStrip } from '../components/SkeletonLoader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';
import { filterTransactionsByPeriod, getPeriodLabel, FilterPeriod } from '../utils/transactionFilters';
import type { TransactionType } from '../utils/categories';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import SubscriptionCreationDialog from '../components/SubscriptionCreationDialog';
import BudgetCreationDialog from '../components/BudgetCreationDialog';
import DebtCreationDialog from '../components/DebtCreationDialog';
import { suggestCategory, learnFromCategorization } from '../services/categoryService';
import { useDialog } from '../contexts/DialogContext';

type TabType = 'income' | 'expense' | 'all';
type FilterType = 'all' | 'subscriptions' | 'debts' | 'untagged';

export default function IncomeExpenseScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [swipeDirection, setSwipeDirection] = useState<'right-income-left-expense' | 'right-expense-left-income'>(
    'right-income-left-expense'
  );
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [debtDialogVisible, setDebtDialogVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const scrollRef = useRef<ScreenWrapperRef>(null);

  const loadTransactions = async (showLoading = true) => {
    try {
      if (showLoading && !hasLoadedRef.current) {
        setLoading(true);
      }
      await waitForFirebase();
      const [trans, settings] = await Promise.all([
        getTransactions(),
        getSettings(),
      ]);
      setTransactions(trans);
      setCurrencyCode(settings.defaultCurrency);
      setSwipeDirection(settings.swipeDirection);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('[IncomeExpenseScreen] Error loading transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const rafId = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      loadTransactions(!hasLoadedRef.current);
      return () => cancelAnimationFrame(rafId);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions(false);
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
              await loadTransactions(false);
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
      await loadTransactions(false);
    } catch (error) {
      dialog.alert('Error', `Failed to untag ${type}`);
    }
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
              await loadTransactions(false);
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
      await loadTransactions(false);
    } catch (error) {
      dialog.alert('Error', `Failed to untag ${type}s`);
    }
  };

  const proceedWithCategoryUpdate = useCallback(
    async (category: string) => {
      if (!selectedTransaction) return;
      try {
        const updateData: Partial<Transaction> = { type: selectedType, category };
        const suggestion = await suggestCategory(selectedTransaction.description || '', selectedType, selectedTransaction.amount);
        if (suggestion.debtId) updateData.debtId = suggestion.debtId;
        await updateTransaction(selectedTransaction.id, updateData);
        await learnFromCategorization(selectedTransaction.description || '', category, selectedType);
        await loadTransactions(false);
      } catch (error) {
        console.error('[IncomeExpenseScreen] Error updating transaction', error);
        dialog.alert('Error', 'Failed to update transaction');
      } finally {
        setSelectedTransaction(null);
        setPendingCategory(null);
        setSuggestedCategory(undefined);
      }
    },
    [selectedTransaction, selectedType, dialog]
  );

  const handleCategorySelect = useCallback(
    async (category: string) => {
      if (!selectedTransaction) return;
      setCategoryPickerVisible(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      setPendingCategory(category);

      try {
        if (category === 'Subscription') {
          setSubscriptionDialogVisible(true);
          return;
        }
        if (selectedType === 'expense' && category !== 'Income') {
          const budgetList = await getBudgets();
          const budgetExists = budgetList.some((b) => b.category === category);
          if (!budgetExists) {
            setBudgetDialogVisible(true);
            return;
          }
        }
        const debtCategories = ['Debt', 'Loan', 'Credit Card'];
        if (debtCategories.includes(category) || category.toLowerCase().includes('debt')) {
          setDebtDialogVisible(true);
          return;
        }
        await proceedWithCategoryUpdate(category);
      } catch (error) {
        console.error('[IncomeExpenseScreen] Error in category selection', error);
        setPendingCategory(null);
        setSelectedTransaction(null);
      }
    },
    [selectedTransaction, selectedType, proceedWithCategoryUpdate]
  );

  const handleSubscriptionDialogComplete = useCallback(async () => {
    setSubscriptionDialogVisible(false);
    if (pendingCategory) await proceedWithCategoryUpdate(pendingCategory);
  }, [pendingCategory, proceedWithCategoryUpdate]);

  const handleBudgetDialogComplete = useCallback(async () => {
    setBudgetDialogVisible(false);
    if (pendingCategory) await proceedWithCategoryUpdate(pendingCategory);
  }, [pendingCategory, proceedWithCategoryUpdate]);

  const handleDebtDialogComplete = useCallback(async () => {
    setDebtDialogVisible(false);
    await loadTransactions(false);
    setSelectedTransaction(null);
    setPendingCategory(null);
  }, []);

  const handleSwipeRight = useCallback(
    async (item: Transaction) => {
      const rightSwipeType: TransactionType = swipeDirection === 'right-income-left-expense' ? 'income' : 'expense';
      const suggestion = await suggestCategory(item.description || '', rightSwipeType, item.amount);
      setSelectedTransaction(item);
      setSelectedType(rightSwipeType);
      setSuggestedCategory(suggestion.category);
      setCategoryPickerVisible(true);
    },
    [swipeDirection]
  );

  const handleSwipeLeft = useCallback(
    async (item: Transaction) => {
      const leftSwipeType: TransactionType = swipeDirection === 'right-income-left-expense' ? 'expense' : 'income';
      const suggestion = await suggestCategory(item.description || '', leftSwipeType, item.amount);
      setSelectedTransaction(item);
      setSelectedType(leftSwipeType);
      setSuggestedCategory(suggestion.category);
      setCategoryPickerVisible(true);
    },
    [swipeDirection]
  );

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

  const loadingComponent = (
    <>
      <SkeletonStatStrip />
      <View style={styles.skeletonContainer}>
        <SkeletonList count={5} />
      </View>
    </>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        <ScreenWrapper
          ref={scrollRef}
          onRefresh={onRefresh}
          refreshing={refreshing}
          loading={loading && !refreshing}
          loadingComponent={loadingComponent}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: 24 + insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats strip (same layout as Debts) */}
          <View style={styles.statsStrip}>
            <View style={styles.statsSegment}>
              <Text style={styles.statsSegmentLabel}>Income</Text>
              <Text style={[styles.statsSegmentValue, styles.incomeValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatCurrencySync(income, currencyCode)}
              </Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsSegment}>
              <Text style={styles.statsSegmentLabel}>Expenses</Text>
              <Text style={[styles.statsSegmentValue, styles.expenseValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatCurrencySync(expenses, currencyCode)}
              </Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsSegment}>
              <Text style={styles.statsSegmentLabel}>Net</Text>
              <Text style={[styles.statsSegmentValue, net >= 0 ? styles.incomeValue : styles.expenseValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
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
                  onPress={() => setSelectedIds(new Set())}
                >
                  <Ionicons name="close-outline" size={18} color={colors.text} />
                  <Text style={styles.bulkButtonText}>Clear</Text>
                </TouchableOpacity>
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

          {/* Transaction list */}
          <View style={styles.listContent}>
            {filteredTransactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={64} color={colors.textLight} />
                <Text style={styles.emptyText}>No transactions found</Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery ? 'Try a different search term' : 'No transactions match your filters'}
                </Text>
              </View>
            ) : (
              filteredTransactions.map((item) => (
                <SwipeableTransactionCard
                  key={item.id}
                  transaction={item}
                  currencyCode={currencyCode}
                  onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: item.id } })}
                  onSwipeRight={() => handleSwipeRight(item)}
                  onSwipeLeft={() => handleSwipeLeft(item)}
                  onDelete={() => handleDelete(item.id)}
                  showTagBadges={true}
                  swipeDirection={swipeDirection}
                />
              ))
            )}
          </View>
        </ScreenWrapper>
      </View>

      <CategoryPickerDialog
        visible={categoryPickerVisible}
        type={selectedType}
        onSelect={handleCategorySelect}
        onClose={() => {
          if (!subscriptionDialogVisible && !budgetDialogVisible && !debtDialogVisible) {
            setCategoryPickerVisible(false);
            setSelectedTransaction(null);
            setSuggestedCategory(undefined);
            setPendingCategory(null);
          } else {
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
        onNavigateToDebts={() => router.push('/(tabs)/finance/debts' as any)}
      />
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingTop: 8,
  },
  skeletonContainer: {
    padding: 20,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsSegment: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  statsSegmentLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  statsSegmentValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  statsDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: 4,
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

