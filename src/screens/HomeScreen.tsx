import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, getTransactions, getBudgets, getSubscriptions, updateTransaction } from '../database/db';
import { Account, Transaction, Budget, Subscription } from '../database/schema';
import { TransactionType } from '../utils/categories';
import { useTheme } from '../contexts/ThemeContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import SwipeableTransactionCard from '../components/SwipeableTransactionCard';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import SubscriptionCreationDialog from '../components/SubscriptionCreationDialog';
import BudgetCreationDialog from '../components/BudgetCreationDialog';
import DebtCreationDialog from '../components/DebtCreationDialog';
import CompanyLogo from '../components/CompanyLogo';
import { SkeletonLoader, SkeletonCard, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper from '../components/ScreenWrapper';
import AIInsightCard from '../components/AIInsightCard';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync, getCurrencySymbol } from '../utils/currency';
import { suggestCategory, learnFromCategorization } from '../services/categoryService';
import { filterTransactionsByPeriod, getPeriodLabel, FilterPeriod } from '../utils/transactionFilters';
import { convertAmountsToCurrency } from '../services/currencyConversionService';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [debtDialogVisible, setDebtDialogVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [convertedTotalBalance, setConvertedTotalBalance] = useState<number | null>(null);
  const [convertedPeriodIncome, setConvertedPeriodIncome] = useState<number | null>(null);
  const [convertedPeriodExpenses, setConvertedPeriodExpenses] = useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'right-income-left-expense' | 'right-expense-left-income'>(
    'right-income-left-expense'
  );
  const hasLoadedRef = useRef(false);

  const loadData = async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      // Don't wait for Firebase on every load - it's usually already ready
      // Only wait if it's the first load
      if (!hasLoadedRef.current) {
        await waitForFirebase();
      }
      const [accs, trans, buds, subs, settings] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getBudgets(),
        getSubscriptions(),
        getSettings(),
      ]);
      setAccounts(accs);
      setTransactions(trans);
      setBudgets(buds);
      setSubscriptions(subs);
      setCurrencyCode(settings.defaultCurrency);
      setSwipeDirection(settings.swipeDirection);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Only show loading on initial load, refresh silently on subsequent focuses
      const isInitialLoad = !hasLoadedRef.current;
      // Remove delay for faster loading - load immediately
      loadData(isInitialLoad);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Calculate totals with currency conversion
  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);
  
  // Filter transactions by selected period
  const filteredData = filterTransactionsByPeriod(transactions, filterPeriod);
  const periodIncome = filteredData.income;
  const periodExpenses = filteredData.expenses;

  // Convert balances and transactions to default currency
  React.useEffect(() => {
    const convertTotals = async () => {
      // Don't convert if currencyCode is not set
      if (!currencyCode) {
        console.warn('[HomeScreen] Currency code not set, skipping conversion');
        return;
      }
      
      try {
        // Convert account balances
        const accountAmounts = accounts.map(acc => ({
          amount: acc.balance ?? 0,
          currency: acc.currency || currencyCode || 'USD',
        }));
        const convertedBalance = await convertAmountsToCurrency(accountAmounts, currencyCode);
        setConvertedTotalBalance(convertedBalance);

        // Convert transaction amounts
        const incomeTransactions = filteredData.transactions.filter(t => t.type === 'income');
        const expenseTransactions = filteredData.transactions.filter(t => t.type === 'expense');
        
        const incomeAmounts = incomeTransactions.map(t => {
          const account = accounts.find(a => a.id === t.accountId);
          return {
            amount: t.amount,
            currency: account?.currency || currencyCode || 'USD',
          };
        });
        const expenseAmounts = expenseTransactions.map(t => {
          const account = accounts.find(a => a.id === t.accountId);
          return {
            amount: t.amount,
            currency: account?.currency || currencyCode || 'USD',
          };
        });

        const convertedIncome = await convertAmountsToCurrency(incomeAmounts, currencyCode);
        const convertedExpenses = await convertAmountsToCurrency(expenseAmounts, currencyCode);
        
        setConvertedPeriodIncome(convertedIncome);
        setConvertedPeriodExpenses(convertedExpenses);
      } catch (error) {
        console.error('[HomeScreen] Error converting currencies:', error);
        // Fallback to original values if conversion fails
        setConvertedTotalBalance(null);
        setConvertedPeriodIncome(null);
        setConvertedPeriodExpenses(null);
      }
    };

    if ((accounts.length > 0 || filteredData.transactions.length > 0) && currencyCode) {
      convertTotals();
    }
  }, [accounts, transactions, filterPeriod, currencyCode]);
  
  const recentTransactions = filteredData.transactions.slice(0, 5);
  const now = new Date();
  const upcomingSubscriptions = subscriptions
    .filter(s => new Date(s.nextBillingDate) >= now)
    .slice(0, 3);
  
  const handleSwipeRight = async (transaction: Transaction) => {
    const rightSwipeType = swipeDirection === 'right-income-left-expense' ? 'income' : 'expense';
    const suggestion = await suggestCategory(transaction.description || '', rightSwipeType, transaction.amount);
    setSelectedTransaction(transaction);
    setSelectedType(rightSwipeType);
    setSuggestedCategory(suggestion.category);
    setCategoryPickerVisible(true);
  };
  
  const handleSwipeLeft = async (transaction: Transaction) => {
    const leftSwipeType = swipeDirection === 'right-income-left-expense' ? 'expense' : 'income';
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
        
        console.log('[HomeScreen] Checking budget for category:', category, 'Budget exists:', budgetExists);
        
        if (!budgetExists) {
          // Show budget creation dialog
          console.log('[HomeScreen] Showing budget creation dialog for category:', category);
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
      console.error('[HomeScreen] Error in category selection:', error);
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
      
      await learnFromCategorization(
        selectedTransaction.description || '',
        category,
        selectedType
      );
      
      await loadData();
    } catch (error) {
      console.error('[HomeScreen] Error updating transaction');
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
    // Just reload data to reflect changes
    await loadData();
    setSelectedTransaction(null);
    setPendingCategory(null);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const loadingComponent = (
    <>
      <SkeletonHeader />
      <View style={styles.skeletonContainer}>
        <View style={styles.skeletonBalanceCard}>
          <SkeletonLoader width={200} height={40} style={styles.marginBottom} />
          <SkeletonLoader width={150} height={24} style={styles.marginBottom} />
          <View style={styles.skeletonRow}>
            <SkeletonLoader width={100} height={16} />
            <SkeletonLoader width={100} height={16} />
          </View>
        </View>
        <View style={styles.skeletonStatsRow}>
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </View>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    </>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScreenWrapper
        onRefresh={onRefresh}
        refreshing={refreshing}
        loading={loading && !refreshing}
        loadingComponent={loadingComponent}
        showsVerticalScrollIndicator={false}
      >
      {/* Header Section */}
      <ScreenHeader
        subtitle={getGreeting()}
        title="Welcome back"
        titleFontFamily="GulfsDisplay-Normal"
        titleLetterSpacing={0.5}
        rightAction={{
          icon: "person-outline",
          onPress: () => router.push('/profile' as any)
        }}
      />

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <View style={styles.filterContainer}>
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
                  {period === 'week' ? 'W' : period === 'month' ? 'M' : period === 'year' ? 'Y' : 'All'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.balanceAmount}>
          {formatCurrencySync(convertedTotalBalance ?? totalBalance, currencyCode)}
        </Text>
        <View style={styles.balanceFooter}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>{getPeriodLabel(filterPeriod)} Income</Text>
            <Text style={styles.balanceStatValue}>
              {formatCurrencySync(convertedPeriodIncome ?? periodIncome, currencyCode)}
            </Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>{getPeriodLabel(filterPeriod)} Expenses</Text>
            <Text style={styles.balanceStatValue}>
              {formatCurrencySync(convertedPeriodExpenses ?? periodExpenses, currencyCode)}
            </Text>
          </View>
        </View>
      </View>

      {/* AI Insight Card */}
      <AIInsightCard
        accounts={accounts}
        transactions={transactions}
        budgets={budgets}
        subscriptions={subscriptions}
        filterPeriod={filterPeriod}
        currencyCode={currencyCode}
      />

      {/* Recent Transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/finance/transactions')}>
            <Text style={styles.seeAll}>View All</Text>
          </TouchableOpacity>
        </View>
        {recentTransactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Start tracking your finances</Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {recentTransactions.map((transaction, index) => {
              const uniqueKey = transaction.truelayerTransactionId || `${transaction.id}_${index}`;
              return (
                <SwipeableTransactionCard
                  key={uniqueKey}
                  transaction={transaction}
                  currencyCode={currencyCode}
                  onPress={() => router.push({ pathname: '/(tabs)/finance/transaction-detail' as any, params: { id: transaction.id } })}
                  onSwipeRight={() => handleSwipeRight(transaction)}
                  onSwipeLeft={() => handleSwipeLeft(transaction)}
                  swipeDirection={swipeDirection}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Upcoming Subscriptions */}
      {upcomingSubscriptions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Subscriptions</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/finance/subscriptions')}>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.subscriptionsList}>
            {upcomingSubscriptions.map((subscription, index) => {
              return (
              <View 
                key={subscription.id} 
                style={[
                  styles.subscriptionCard,
                  index === upcomingSubscriptions.length - 1 && styles.subscriptionCardLast
                ]}
              >
                <View style={styles.subscriptionLeft}>
                  <CompanyLogo
                    name={subscription.name}
                    type="subscription"
                    size={48}
                  />
                  <View>
                    <Text style={styles.subscriptionName}>{subscription.name}</Text>
                    <Text style={styles.subscriptionDate}>
                      {format(new Date(subscription.nextBillingDate), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.subscriptionAmount}>{formatCurrencySync(subscription.amount, currencyCode)}</Text>
              </View>
            );
            })}
          </View>
        </View>
      )}

      <View style={styles.bottomPadding} />
      </ScreenWrapper>
      
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
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  balanceCard: {
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 24,
    borderRadius: 24,
    minHeight: 200,
    justifyContent: 'space-between',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.background,
    opacity: 0.8,
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.background,
    opacity: 0.7,
  },
  filterButtonTextActive: {
    opacity: 1,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: -1,
    marginBottom: 24,
  },
  balanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  balanceStat: {
    flex: 1,
  },
  balanceStatLabel: {
    fontSize: 12,
    color: colors.background,
    opacity: 0.7,
    marginBottom: 4,
  },
  balanceStatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
  balanceDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  transactionsList: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transactionCardLast: {
    borderBottomWidth: 0,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  transactionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  incomeIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  expenseIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  transactionCategory: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  incomeAmount: {
    color: colors.primary,
  },
  expenseAmount: {
    color: colors.primary,
  },
  subscriptionsList: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subscriptionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subscriptionCardLast: {
    borderBottomWidth: 0,
  },
  subscriptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  subscriptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subscriptionDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  subscriptionAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 40,
  },
  skeletonContainer: {
    padding: 20,
  },
  skeletonBalanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  skeletonStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  marginBottom: {
    marginBottom: 8,
  },
});
