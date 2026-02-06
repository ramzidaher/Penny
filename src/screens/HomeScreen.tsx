import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { format } from 'date-fns';
import SwipeableTransactionCard from '../components/SwipeableTransactionCard';
import CompanyLogo from '../components/CompanyLogo';
import { SkeletonLoader, SkeletonCard, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import AIInsightCard from '../components/AIInsightCard';
import { useFinanceOverviewData } from '../hooks/useFinanceOverviewData';
import { updateTransaction, getBudgets } from '../database/db';
import { Transaction } from '../database/schema';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import SubscriptionCreationDialog from '../components/SubscriptionCreationDialog';
import BudgetCreationDialog from '../components/BudgetCreationDialog';
import DebtCreationDialog from '../components/DebtCreationDialog';
import { suggestCategory, learnFromCategorization } from '../services/categoryService';
import type { TransactionType } from '../utils/categories';
import { formatCurrencySync } from '../utils/currency';
import SlotMachineBalance from '../components/SlotMachineBalance';
import { filterTransactionsByPeriod, getPeriodLabel, FilterPeriod } from '../utils/transactionFilters';
import { convertAmountsToCurrency } from '../services/currencyConversionService';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScreenWrapperRef>(null);
  const hasFocusedRef = useRef(false);

  const {
    accounts,
    transactions,
    budgets,
    subscriptions,
    currencyCode,
    swipeDirection,
    loading,
    refreshing,
    loadData,
    onRefresh,
  } = useFinanceOverviewData({ enrichBalances: true });

  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [debtDialogVisible, setDebtDialogVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [convertedTotalBalance, setConvertedTotalBalance] = useState<number | null>(null);
  const [convertedPeriodIncome, setConvertedPeriodIncome] = useState<number | null>(null);
  const [convertedPeriodExpenses, setConvertedPeriodExpenses] = useState<number | null>(null);
  // Keep last displayed converted values to avoid balance/income/expense flicker when
  // switching to Home or when conversion runs async (show previous value until new one is ready).
  const lastStableBalanceRef = useRef<number | null>(null);
  const lastStableIncomeRef = useRef<number | null>(null);
  const lastStableExpensesRef = useRef<number | null>(null);
  const [balanceAnimationTrigger, setBalanceAnimationTrigger] = useState(0);
  const prevRefreshingRef = useRef(refreshing);

  // When pull-to-refresh completes, re-run the slot animation and vibration
  React.useEffect(() => {
    if (prevRefreshingRef.current && !refreshing) {
      setBalanceAnimationTrigger((t) => t + 1);
    }
    prevRefreshingRef.current = refreshing;
  }, [refreshing]);

  useFocusEffect(
    useCallback(() => {
      // Scroll to top when Home gains focus (fixes Android opening scrolled down)
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const rafId = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      const isFirstFocus = !hasFocusedRef.current;
      loadData(isFirstFocus);
      hasFocusedRef.current = true;
      return () => cancelAnimationFrame(rafId);
    }, [loadData])
  );

  const handleSwipeRight = useCallback(
    async (transaction: Transaction) => {
      const rightSwipeType: TransactionType = swipeDirection === 'right-income-left-expense' ? 'income' : 'expense';
      const suggestion = await suggestCategory(transaction.description || '', rightSwipeType, transaction.amount);
      setSelectedTransaction(transaction);
      setSelectedType(rightSwipeType);
      setSuggestedCategory(suggestion.category);
      setCategoryPickerVisible(true);
    },
    [swipeDirection]
  );

  const handleSwipeLeft = useCallback(
    async (transaction: Transaction) => {
      const leftSwipeType: TransactionType = swipeDirection === 'right-income-left-expense' ? 'expense' : 'income';
      const suggestion = await suggestCategory(transaction.description || '', leftSwipeType, transaction.amount);
      setSelectedTransaction(transaction);
      setSelectedType(leftSwipeType);
      setSuggestedCategory(suggestion.category);
      setCategoryPickerVisible(true);
    },
    [swipeDirection]
  );

  const proceedWithCategoryUpdate = useCallback(
    async (category: string) => {
      if (!selectedTransaction) return;
      try {
        const suggestion = await suggestCategory(selectedTransaction.description || '', selectedType, selectedTransaction.amount);
        const updateData: Partial<Transaction> = { type: selectedType, category };
        if (suggestion.debtId) updateData.debtId = suggestion.debtId;
        await updateTransaction(selectedTransaction.id, updateData);
        await learnFromCategorization(selectedTransaction.description || '', category, selectedType);
        await loadData();
      } catch (error) {
        console.error('[HomeScreen] Error updating transaction', error);
      } finally {
        setSelectedTransaction(null);
        setPendingCategory(null);
        setSuggestedCategory(undefined);
      }
    },
    [selectedTransaction, selectedType, loadData]
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
        console.error('[HomeScreen] Error in category selection', error);
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
    await loadData();
    setSelectedTransaction(null);
    setPendingCategory(null);
  }, [loadData]);

  // Calculate totals with currency conversion
  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);
  
  // Filter transactions by selected period
  const filteredData = filterTransactionsByPeriod(transactions, filterPeriod);
  const periodIncome = filteredData.income;
  const periodExpenses = filteredData.expenses;

  // When all accounts use the same currency as default, no conversion needed — use raw totals
  // so the balance doesn't flicker (async conversion would show totalBalance then convertedTotalBalance).
  const balanceNeedsConversion = accounts.some(
    (acc) => (acc.currency || currencyCode || 'USD') !== (currencyCode || 'USD')
  );
  const incomeTransactions = filteredData.transactions.filter((t) => t.type === 'income');
  const expenseTransactions = filteredData.transactions.filter((t) => t.type === 'expense');
  const incomeNeedsConversion = incomeTransactions.some((t) => {
    const account = accounts.find((a) => a.id === t.accountId);
    return (account?.currency || currencyCode || 'USD') !== (currencyCode || 'USD');
  });
  const expenseNeedsConversion = expenseTransactions.some((t) => {
    const account = accounts.find((a) => a.id === t.accountId);
    return (account?.currency || currencyCode || 'USD') !== (currencyCode || 'USD');
  });

  // Stable display values: avoid flicker by using previous converted value until new one is ready.
  const displayBalance =
    !balanceNeedsConversion
      ? totalBalance
      : (convertedTotalBalance ?? lastStableBalanceRef.current ?? totalBalance);
  const displayIncome =
    !incomeNeedsConversion
      ? periodIncome
      : (convertedPeriodIncome ?? lastStableIncomeRef.current ?? periodIncome);
  const displayExpenses =
    !expenseNeedsConversion
      ? periodExpenses
      : (convertedPeriodExpenses ?? lastStableExpensesRef.current ?? periodExpenses);

  // Convert balances and transactions to default currency (only when needed)
  React.useEffect(() => {
    if (!currencyCode) {
      console.warn('[HomeScreen] Currency code not set, skipping conversion');
      return;
    }

    const targetCurrency = currencyCode || 'USD';

    // No conversion needed: set state and refs so next time we have stable values.
    if (!balanceNeedsConversion && !incomeNeedsConversion && !expenseNeedsConversion) {
      setConvertedTotalBalance(totalBalance);
      setConvertedPeriodIncome(periodIncome);
      setConvertedPeriodExpenses(periodExpenses);
      lastStableBalanceRef.current = totalBalance;
      lastStableIncomeRef.current = periodIncome;
      lastStableExpensesRef.current = periodExpenses;
      return;
    }

    const convertTotals = async () => {
      try {
        if (balanceNeedsConversion) {
          const accountAmounts = accounts.map((acc) => ({
            amount: acc.balance ?? 0,
            currency: acc.currency || targetCurrency,
          }));
          const convertedBalance = await convertAmountsToCurrency(accountAmounts, targetCurrency);
          setConvertedTotalBalance(convertedBalance);
          lastStableBalanceRef.current = convertedBalance;
        } else {
          setConvertedTotalBalance(totalBalance);
          lastStableBalanceRef.current = totalBalance;
        }

        if (incomeNeedsConversion || expenseNeedsConversion) {
          const incomeAmounts = incomeTransactions.map((t) => {
            const account = accounts.find((a) => a.id === t.accountId);
            return {
              amount: t.amount,
              currency: account?.currency || targetCurrency,
            };
          });
          const expenseAmounts = expenseTransactions.map((t) => {
            const account = accounts.find((a) => a.id === t.accountId);
            return {
              amount: t.amount,
              currency: account?.currency || targetCurrency,
            };
          });

          if (incomeNeedsConversion) {
            const convertedIncome = await convertAmountsToCurrency(incomeAmounts, targetCurrency);
            setConvertedPeriodIncome(convertedIncome);
            lastStableIncomeRef.current = convertedIncome;
          } else {
            setConvertedPeriodIncome(periodIncome);
            lastStableIncomeRef.current = periodIncome;
          }
          if (expenseNeedsConversion) {
            const convertedExpenses = await convertAmountsToCurrency(expenseAmounts, targetCurrency);
            setConvertedPeriodExpenses(convertedExpenses);
            lastStableExpensesRef.current = convertedExpenses;
          } else {
            setConvertedPeriodExpenses(periodExpenses);
            lastStableExpensesRef.current = periodExpenses;
          }
        } else {
          setConvertedPeriodIncome(periodIncome);
          setConvertedPeriodExpenses(periodExpenses);
          lastStableIncomeRef.current = periodIncome;
          lastStableExpensesRef.current = periodExpenses;
        }
      } catch (error) {
        console.error('[HomeScreen] Error converting currencies:', error);
        setConvertedTotalBalance(null);
        setConvertedPeriodIncome(null);
        setConvertedPeriodExpenses(null);
        // Refs keep previous values so we don't flash wrong numbers
      }
    };

    if (accounts.length > 0 || filteredData.transactions.length > 0) {
      convertTotals();
    }
  }, [accounts, transactions, filterPeriod, currencyCode]);
  
  const recentTransactions = filteredData.transactions.slice(0, 4);
  const now = new Date();
  const upcomingSubscriptions = subscriptions
    .filter(s => new Date(s.nextBillingDate) >= now)
    .slice(0, 3);
  
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
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshing={refreshing}
        loading={loading && !refreshing}
        loadingComponent={loadingComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom + 80 }}
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
        <SlotMachineBalance
          value={displayBalance}
          currencyCode={currencyCode}
          style={styles.balanceAmount}
          animate={true}
          animationTrigger={balanceAnimationTrigger}
        />
        <View style={styles.balanceFooter}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>{getPeriodLabel(filterPeriod)} Income</Text>
            <Text style={styles.balanceStatValue}>
              {formatCurrencySync(displayIncome, currencyCode)}
            </Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>{getPeriodLabel(filterPeriod)} Expenses</Text>
            <Text style={styles.balanceStatValue}>
              {formatCurrencySync(displayExpenses, currencyCode)}
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
            <Text
              style={styles.viewAllText}
              onPress={() => router.push('/(tabs)/finance/transactions')}
            >
              Click here to view all
            </Text>
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

      </ScreenWrapper>

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
  viewAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
    paddingTop: 10,
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
