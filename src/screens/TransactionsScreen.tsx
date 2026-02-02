import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform, TextInput, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { useNavigation } from '../utils/navigation';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { getTransactionsPage, deleteTransaction, updateTransaction, untagTransaction } from '../database/db';
import { refreshTransactions } from '../services/transactionService';
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
import { suggestCategory, learnFromCategorization } from '../services/categoryService';
import { filterTransactionsByPeriod, getPeriodLabel, FilterPeriod } from '../utils/transactionFilters';
import { getBudgets } from '../database/db';
import { useToast } from '../contexts/ToastContext';

export default function TransactionsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const PAGE_SIZE = 50;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [tagFilter, setTagFilter] = useState<'all' | 'subscriptions' | 'debts' | 'untagged'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [debtDialogVisible, setDebtDialogVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'right-income-left-expense' | 'right-expense-left-income'>(
    'right-income-left-expense'
  );
  const { showSuccess, showError } = useToast();

  const loadTransactions = async () => {
    try {
      setLoading(true);
      console.log('[TransactionsScreen] Loading transactions...');
      const [page, settings] = await Promise.all([
        getTransactionsPage({ limit: PAGE_SIZE }),
        getSettings(),
      ]);
      console.log(`[TransactionsScreen] Loaded ${page.transactions.length} transactions`);
      setTransactions(page.transactions);
      setCursor(page.nextCursor);
      setHasMore(page.transactions.length === PAGE_SIZE && !!page.nextCursor);
      setCurrencyCode(settings.defaultCurrency);
      setSwipeDirection(settings.swipeDirection);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TransactionsScreen] Error loading transactions:', errorMessage);
      setTransactions([]);
      setCursor(undefined);
      setHasMore(false);
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

  const loadMoreTransactions = async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await getTransactionsPage({ limit: PAGE_SIZE, startAfter: cursor });
      if (page.transactions.length === 0) {
        setHasMore(false);
        return;
      }
      setTransactions(prev => [...prev, ...page.transactions]);
      setCursor(page.nextCursor);
      setHasMore(page.transactions.length === PAGE_SIZE && !!page.nextCursor);
    } catch (error) {
      console.error('[TransactionsScreen] Error loading more transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    await loadTransactions();
  };

  const handleUncategorize = async (transaction: Transaction) => {
    console.log('[TransactionsScreen] handleUncategorize called for transaction:', transaction.id, 'type:', transaction.type, 'hasTags:', !!(transaction.subscriptionId || transaction.debtId));
    try {
      // Always call untagTransaction to ensure Firestore has null values
      // This handles cases where tags exist in cache but aren't detected, or were set long ago
      console.log('[TransactionsScreen] Removing tags from transaction:', transaction.id, 'subscriptionId:', transaction.subscriptionId, 'debtId:', transaction.debtId);
      await untagTransaction(transaction.id, 'all');
      console.log('[TransactionsScreen] Tags removed successfully');
      
      // For income transactions, reset to default category
      if (transaction.type === 'income') {
        console.log('[TransactionsScreen] Updating income transaction category to Other Income:', transaction.id, 'current category:', transaction.category);
        await updateTransaction(transaction.id, {
          category: 'Other Income',
        });
        console.log('[TransactionsScreen] Successfully updated income transaction category');
      }
      
      console.log('[TransactionsScreen] Reloading transactions after uncategorize');
      // Force refresh to get latest data
      await onRefresh();
      console.log('[TransactionsScreen] Transactions reloaded after uncategorize');
    } catch (error) {
      console.error('[TransactionsScreen] Error uncategorizing transaction:', error);
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
      let matchingBudgetId: string | undefined;
      // If category is Subscription, show subscription creation dialog
      if (category === 'Subscription') {
        setSubscriptionDialogVisible(true);
        return;
      }
      
      // If it's an expense category, check if budget exists
      if (selectedType === 'expense' && category !== 'Income') {
        const budgets = await getBudgets();
        const matchingBudget = budgets.find(b => b.category === category);
        const budgetExists = !!matchingBudget;
        matchingBudgetId = matchingBudget?.id;
        
        console.log('[TransactionsScreen] Checking budget for category:', category, 'Budget exists:', budgetExists);
        
        if (!budgetExists) {
          // Show budget creation dialog
          console.log('[TransactionsScreen] Showing budget creation dialog for category:', category);
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
      await proceedWithCategoryUpdate(category, matchingBudgetId ? { budgetId: matchingBudgetId } : undefined);
    } catch (error) {
      console.error('[TransactionsScreen] Error in category selection:', error);
      setPendingCategory(null);
      setSelectedTransaction(null);
    }
  };

  const proceedWithCategoryUpdate = async (
    category: string,
    tagOverrides?: Partial<Pick<Transaction, 'subscriptionId' | 'debtId' | 'budgetId'>>
  ) => {
    if (!selectedTransaction) return;
    
    try {
      // Get suggestion again to check for subscription and debt links
      const suggestion = await suggestCategory(selectedTransaction.description || '', selectedType, selectedTransaction.amount);
      
      // Update transaction type, category, and links if applicable
      const updateData: Partial<Transaction> = {
        type: selectedType,
        category,
      };
      
      // Only link debt if it's an expense (income shouldn't have debt tags)
      if (selectedType === 'expense') {
        const resolvedDebtId = tagOverrides?.debtId ?? suggestion.debtId;
        if (resolvedDebtId) {
          updateData.debtId = resolvedDebtId;
        }
      } else if (selectedType === 'income') {
        // For income, make sure to remove any existing tags
        if (selectedTransaction.debtId || selectedTransaction.subscriptionId || selectedTransaction.budgetId) {
          await untagTransaction(selectedTransaction.id, 'all');
        }
      }

      if (tagOverrides?.subscriptionId) {
        updateData.subscriptionId = tagOverrides.subscriptionId;
      }

      if (tagOverrides?.budgetId) {
        updateData.budgetId = tagOverrides.budgetId;
      }
      
      await updateTransaction(selectedTransaction.id, updateData);
      
      // Learn from user's categorization
      await learnFromCategorization(
        selectedTransaction.description || '',
        category,
        selectedType
      );
      
      const clearTagsForIncome =
        selectedType === 'income'
          ? { subscriptionId: undefined, debtId: undefined, budgetId: undefined }
          : {};

      setTransactions((prev) =>
        prev.map((transaction) =>
          transaction.id === selectedTransaction.id
            ? { ...transaction, ...updateData, ...clearTagsForIncome }
            : transaction
        )
      );

      if (tagOverrides?.subscriptionId) {
        showSuccess('Subscription linked');
      } else if (tagOverrides?.budgetId) {
        showSuccess(`Budget linked · ${category}`);
      } else if (updateData.debtId) {
        showSuccess('Debt linked');
      } else {
        showSuccess(`Tagged as ${category}`);
      }
    } catch (error) {
      console.error('[TransactionsScreen] Error updating transaction');
      showError('Tagging failed. Please try again.');
    } finally {
      setSelectedTransaction(null);
      setPendingCategory(null);
      setSuggestedCategory(undefined);
    }
  };

  const handleSubscriptionDialogComplete = async (subscriptionId?: string) => {
    setSubscriptionDialogVisible(false);
    if (pendingCategory) {
      await proceedWithCategoryUpdate(
        pendingCategory,
        subscriptionId ? { subscriptionId } : undefined
      );
    }
  };

  const handleBudgetDialogComplete = async (budgetId?: string) => {
    setBudgetDialogVisible(false);
    if (pendingCategory) {
      await proceedWithCategoryUpdate(
        pendingCategory,
        budgetId ? { budgetId } : undefined
      );
    }
  };

  const handleDebtDialogComplete = async (debtId?: string) => {
    setDebtDialogVisible(false);
    // Debt dialog already updates the transaction with type='expense' and debtId
    // Just reload transactions to reflect changes
    await loadTransactions();
    setSelectedTransaction(null);
    setPendingCategory(null);
    if (debtId) {
      showSuccess('Debt linked');
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = filterTransactionsByPeriod(transactions, filterPeriod).transactions;
    
    if (typeFilter === 'income') {
      filtered = filtered.filter(t => t.type === 'income');
    } else if (typeFilter === 'expense') {
      filtered = filtered.filter(t => t.type === 'expense');
    }
    
    if (tagFilter === 'subscriptions') {
      filtered = filtered.filter(t => t.subscriptionId);
    } else if (tagFilter === 'debts') {
      filtered = filtered.filter(t => t.debtId);
    } else if (tagFilter === 'untagged') {
      filtered = filtered.filter(t => !t.subscriptionId && !t.debtId && !t.budgetId);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(t => {
        const description = (t.description || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        const amount = formatCurrencySync(t.amount, currencyCode).toLowerCase();
        return description.includes(query) || category.includes(query) || amount.includes(query);
      });
    }
    
    return filtered;
  }, [transactions, filterPeriod, typeFilter, tagFilter, searchQuery, currencyCode]);

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
        {/* Compact Search and Filter Container */}
        <View style={styles.filterContainer}>
          {/* Search Bar with Filter Icon */}
          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.filterButton,
                (filterPeriod !== 'month' || typeFilter !== 'all' || tagFilter !== 'all') && styles.filterButtonActive
              ]}
              onPress={() => setFilterModalVisible(true)}
            >
              <Ionicons 
                name="filter" 
                size={18} 
                color={(filterPeriod !== 'month' || typeFilter !== 'all' || tagFilter !== 'all') ? colors.background : colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Modal */}
        <Modal
          visible={filterModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setFilterModalVisible(false)}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Filters</Text>
                    <TouchableOpacity
                      onPress={() => setFilterModalVisible(false)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Period Filter */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Period</Text>
                    <View style={styles.modalFilterRow}>
                      {(['week', 'month', 'year', 'all'] as FilterPeriod[]).map((period) => (
                        <TouchableOpacity
                          key={period}
                          style={[
                            styles.modalFilterChip,
                            filterPeriod === period && styles.modalFilterChipActive,
                          ]}
                          onPress={() => setFilterPeriod(period)}
                        >
                          <Text
                            style={[
                              styles.modalFilterChipText,
                              filterPeriod === period && styles.modalFilterChipTextActive,
                            ]}
                          >
                            {getPeriodLabel(period)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Type Filter */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Type</Text>
                    <View style={styles.modalFilterRow}>
                      {(['all', 'income', 'expense'] as const).map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.modalFilterChip,
                            typeFilter === type && styles.modalFilterChipActive,
                          ]}
                          onPress={() => setTypeFilter(type)}
                        >
                          <Text
                            style={[
                              styles.modalFilterChipText,
                              typeFilter === type && styles.modalFilterChipTextActive,
                            ]}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Tag Filter */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Tags</Text>
                    <View style={styles.modalFilterRow}>
                      {(['all', 'subscriptions', 'debts', 'untagged'] as const).map((tag) => (
                        <TouchableOpacity
                          key={tag}
                          style={[
                            styles.modalFilterChip,
                            tagFilter === tag && styles.modalFilterChipActive,
                          ]}
                          onPress={() => setTagFilter(tag)}
                        >
                          {tag !== 'all' && (
                            <Ionicons
                              name={
                                tag === 'subscriptions' ? 'repeat' :
                                tag === 'debts' ? 'card' :
                                'close-circle-outline'
                              }
                              size={14}
                              color={tagFilter === tag ? colors.background : colors.textSecondary}
                              style={styles.modalFilterIcon}
                            />
                          )}
                          <Text
                            style={[
                              styles.modalFilterChipText,
                              tagFilter === tag && styles.modalFilterChipTextActive,
                            ]}
                          >
                            {tag === 'all' ? 'All' : tag === 'subscriptions' ? 'Subs' : tag === 'debts' ? 'Debts' : 'Uncategorized'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
        
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={loadMoreTransactions}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={64} color={colors.textLight} />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Add your first transaction to get started</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <SwipeableTransactionCard
              transaction={item}
              currencyCode={currencyCode}
              onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: item.id } })}
              onSwipeRight={() => handleSwipeRight(item)}
              onSwipeLeft={() => handleSwipeLeft(item)}
              onDelete={() => handleDelete(item.id)}
              onUncategorize={(item.subscriptionId || item.debtId) ? () => handleUncategorize(item) : undefined}
              showTagBadges={true}
              swipeDirection={swipeDirection}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
        <TouchableOpacity
          style={[styles.fab, { bottom: 20 + insets.bottom + 80 }]}
          onPress={() => navigation.navigate('AddTransaction' as never)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={colors.background} />
        </TouchableOpacity>
        
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
  filterContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 8,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 2,
  },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  modalFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  modalFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalFilterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  modalFilterChipTextActive: {
    color: colors.background,
  },
  modalFilterIcon: {
    marginRight: -2,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
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
