import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { addDays } from 'date-fns';
import SwipeableTransactionCard from '../components/SwipeableTransactionCard';
import { SkeletonLoader, SkeletonCard, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import FinancialHealthAlert from '../components/FinancialHealthAlert';
import AIInsightCard from '../components/AIInsightCard';
import { getInsights, computeDataHash } from '../services/aiInsightService';
import type { Insight } from '../types/insight';
import { useFinanceOverviewData } from '../hooks/useFinanceOverviewData';
import { useFinancialSummary } from '../hooks/useFinancialSummary';
import { getCurrentUser, getCurrentUserProfile, getUserEmail } from '../services/firebase';
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
  const [userFirstName, setUserFirstName] = useState('Home');

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

  const displayCurrency = currencyCode || 'USD';

  const {
    displayNetWorth,
    accountCount,
    currencyCode: summaryCurrencyCode,
    loading: summaryLoading,
    loadData: loadSummary,
  } = useFinancialSummary({ enrichBalances: true });

  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [balanceExpanded, setBalanceExpanded] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [debtDialogVisible, setDebtDialogVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [convertedPeriodIncome, setConvertedPeriodIncome] = useState<number | null>(null);
  const [convertedPeriodExpenses, setConvertedPeriodExpenses] = useState<number | null>(null);
  const lastStableIncomeRef = useRef<number | null>(null);
  const lastStableExpensesRef = useRef<number | null>(null);
  const [balanceAnimationTrigger, setBalanceAnimationTrigger] = useState(0);
  const prevRefreshingRef = useRef(refreshing);
  const [profile, setProfile] = useState<{ avatarSeed?: string } | null>(null);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightAccessDenied, setInsightAccessDenied] = useState(false);
  const [insightAccessDeniedReason, setInsightAccessDeniedReason] = useState<'upgrade' | 'limit' | 'demo_paywall' | undefined>();

  const loadInsights = useCallback(
    async (forceRefresh = false) => {
      setInsightLoading(true);
      try {
        const filtered = filterTransactionsByPeriod(transactions, filterPeriod);
        const dataHash = computeDataHash(filtered.transactions, budgets);
        const result = await getInsights({
          period: filterPeriod,
          forceRefresh,
          dataHash,
        });
        setInsights(result.insights ?? []);
        setInsightAccessDenied(result.accessDenied ?? false);
        setInsightAccessDeniedReason(result.accessDeniedReason);
      } finally {
        setInsightLoading(false);
      }
    },
    [filterPeriod, transactions, budgets]
  );

  const refreshInsights = useCallback(() => {
    loadInsights(true);
  }, [loadInsights]);

  const refreshProfile = useCallback(() => {
    getCurrentUserProfile().then(setProfile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

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
      return () => cancelAnimationFrame(rafId);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const isFirstFocus = !hasFocusedRef.current;
      loadData(isFirstFocus);
      loadSummary(isFirstFocus);
      loadInsights(false);
      hasFocusedRef.current = true;
    }, [loadData, loadSummary, loadInsights])
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
        await loadSummary();
      } catch (error) {
        console.error('[HomeScreen] Error updating transaction', error);
      } finally {
        setSelectedTransaction(null);
        setPendingCategory(null);
        setSuggestedCategory(undefined);
      }
    },
    [selectedTransaction, selectedType, loadData, loadSummary]
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
    await loadSummary();
    setSelectedTransaction(null);
    setPendingCategory(null);
  }, [loadData, loadSummary]);

  // Filter transactions by selected period
  const filteredData = filterTransactionsByPeriod(transactions, filterPeriod);
  const periodIncome = filteredData.income;
  const periodExpenses = filteredData.expenses;

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

  const displayIncome =
    !incomeNeedsConversion
      ? periodIncome
      : (convertedPeriodIncome ?? lastStableIncomeRef.current ?? periodIncome);
  const displayExpenses =
    !expenseNeedsConversion
      ? periodExpenses
      : (convertedPeriodExpenses ?? lastStableExpensesRef.current ?? periodExpenses);

  // Convert income/expense to default currency when needed (balance/net worth from useFinancialSummary)
  React.useEffect(() => {
    if (!currencyCode) {
      console.warn('[HomeScreen] Currency code not set, skipping conversion');
      return;
    }

    const targetCurrency = currencyCode || 'USD';

    if (!incomeNeedsConversion && !expenseNeedsConversion) {
      setConvertedPeriodIncome(periodIncome);
      setConvertedPeriodExpenses(periodExpenses);
      lastStableIncomeRef.current = periodIncome;
      lastStableExpensesRef.current = periodExpenses;
      return;
    }

    const convertTotals = async () => {
      try {
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
        setConvertedPeriodIncome(null);
        setConvertedPeriodExpenses(null);
      }
    };

    if (accounts.length > 0 || filteredData.transactions.length > 0) {
      convertTotals();
    }
  }, [accounts, transactions, filterPeriod, currencyCode]);
  
  const recentTransactions = filteredData.transactions.slice(0, 4);
  const now = new Date();
  const endOfWeek = addDays(now, 7);
  const upcomingSubscriptionsThisWeek = subscriptions.filter((s) => {
    const nextBillingDate = new Date(s.nextBillingDate);
    return nextBillingDate >= now && nextBillingDate <= endOfWeek;
  });

  const [convertedWeeklyBillsTotal, setConvertedWeeklyBillsTotal] = useState<number | null>(null);
  const lastStableWeeklyBillsTotalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currencyCode) return;
    const targetCurrency = currencyCode || 'USD';
    const needsConversion = upcomingSubscriptionsThisWeek.some(
      (subscription) => (subscription.currency || targetCurrency) !== targetCurrency
    );
    const rawTotal = upcomingSubscriptionsThisWeek.reduce((sum, s) => sum + s.amount, 0);

    if (!needsConversion) {
      setConvertedWeeklyBillsTotal(rawTotal);
      lastStableWeeklyBillsTotalRef.current = rawTotal;
      return;
    }

    const convertTotals = async () => {
      try {
        const amounts = upcomingSubscriptionsThisWeek.map((s) => ({
          amount: s.amount,
          currency: s.currency || targetCurrency,
        }));
        const converted = await convertAmountsToCurrency(amounts, targetCurrency);
        setConvertedWeeklyBillsTotal(converted);
        lastStableWeeklyBillsTotalRef.current = converted;
      } catch (error) {
        console.error('[HomeScreen] Error converting weekly bills:', error);
        setConvertedWeeklyBillsTotal(null);
      }
    };

    if (upcomingSubscriptionsThisWeek.length > 0) {
      convertTotals();
    } else {
      setConvertedWeeklyBillsTotal(0);
      lastStableWeeklyBillsTotalRef.current = 0;
    }
  }, [currencyCode, upcomingSubscriptionsThisWeek]);

  const weeklyBillsTotal =
    convertedWeeklyBillsTotal ?? lastStableWeeklyBillsTotalRef.current ?? upcomingSubscriptionsThisWeek.reduce((sum, s) => sum + s.amount, 0);

  const budgetAlertsCount = useMemo(
    () => budgets.filter((b) => b.currentSpent >= b.limit).length,
    [budgets]
  );
  const budgetRemaining = useMemo(
    () => budgets.reduce((sum, b) => sum + Math.max(0, b.limit - b.currentSpent), 0),
    [budgets]
  );

  const monthlyData = useMemo(
    () => filterTransactionsByPeriod(transactions, 'month'),
    [transactions]
  );
  const [convertedMonthlyIncome, setConvertedMonthlyIncome] = useState<number | null>(null);
  const [convertedMonthlyExpenses, setConvertedMonthlyExpenses] = useState<number | null>(null);
  const lastStableMonthlyIncomeRef = useRef<number | null>(null);
  const lastStableMonthlyExpensesRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currencyCode) return;
    const targetCurrency = currencyCode || 'USD';
    const monthIncomeTransactions = monthlyData.transactions.filter((t) => t.type === 'income');
    const monthExpenseTransactions = monthlyData.transactions.filter((t) => t.type === 'expense');
    const incomeNeedsConversion = monthIncomeTransactions.some((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      return (account?.currency || targetCurrency) !== targetCurrency;
    });
    const expenseNeedsConversion = monthExpenseTransactions.some((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      return (account?.currency || targetCurrency) !== targetCurrency;
    });

    const convertTotals = async () => {
      try {
        if (!incomeNeedsConversion && !expenseNeedsConversion) {
          setConvertedMonthlyIncome(monthlyData.income);
          setConvertedMonthlyExpenses(monthlyData.expenses);
          lastStableMonthlyIncomeRef.current = monthlyData.income;
          lastStableMonthlyExpensesRef.current = monthlyData.expenses;
          return;
        }

        if (incomeNeedsConversion) {
          const incomeAmounts = monthIncomeTransactions.map((t) => {
            const account = accounts.find((a) => a.id === t.accountId);
            return {
              amount: t.amount,
              currency: account?.currency || targetCurrency,
            };
          });
          const convertedIncome = await convertAmountsToCurrency(incomeAmounts, targetCurrency);
          setConvertedMonthlyIncome(convertedIncome);
          lastStableMonthlyIncomeRef.current = convertedIncome;
        } else {
          setConvertedMonthlyIncome(monthlyData.income);
          lastStableMonthlyIncomeRef.current = monthlyData.income;
        }

        if (expenseNeedsConversion) {
          const expenseAmounts = monthExpenseTransactions.map((t) => {
            const account = accounts.find((a) => a.id === t.accountId);
            return {
              amount: t.amount,
              currency: account?.currency || targetCurrency,
            };
          });
          const convertedExpenses = await convertAmountsToCurrency(expenseAmounts, targetCurrency);
          setConvertedMonthlyExpenses(convertedExpenses);
          lastStableMonthlyExpensesRef.current = convertedExpenses;
        } else {
          setConvertedMonthlyExpenses(monthlyData.expenses);
          lastStableMonthlyExpensesRef.current = monthlyData.expenses;
        }
      } catch (error) {
        console.error('[HomeScreen] Error converting monthly totals:', error);
        setConvertedMonthlyIncome(null);
        setConvertedMonthlyExpenses(null);
      }
    };

    if (accounts.length > 0 || monthlyData.transactions.length > 0) {
      convertTotals();
    }
  }, [accounts, currencyCode, monthlyData]);

  const fallbackMonthlyIncome =
    convertedMonthlyIncome ?? lastStableMonthlyIncomeRef.current ?? monthlyData.income;
  const fallbackMonthlyExpenses =
    convertedMonthlyExpenses ?? lastStableMonthlyExpensesRef.current ?? monthlyData.expenses;

  const safeToSpend =
    budgets.length > 0 ? budgetRemaining : Math.max(0, fallbackMonthlyIncome - fallbackMonthlyExpenses);

  const getDaysUntilNextPayday = useCallback(() => {
    const incomeTransactions = [...transactions]
      .filter((t) => t.type === 'income')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (incomeTransactions.length < 2) return null;

    const recent = incomeTransactions.slice(0, 4);
    const intervals: number[] = [];
    for (let i = 0; i < recent.length - 1; i += 1) {
      const current = new Date(recent[i].date);
      const prev = new Date(recent[i + 1].date);
      const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) intervals.push(diffDays);
    }
    if (intervals.length === 0) return null;

    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
    const commonIntervals = [7, 14, 15, 30];
    const normalizedInterval = commonIntervals.reduce((closest, value) =>
      Math.abs(value - medianInterval) < Math.abs(closest - medianInterval) ? value : closest
    , commonIntervals[0]);

    const lastIncomeDate = new Date(recent[0].date);
    let nextPayday = new Date(lastIncomeDate);
    nextPayday.setDate(nextPayday.getDate() + normalizedInterval);
    let guard = 0;
    while (nextPayday < new Date() && guard < 4) {
      nextPayday = new Date(nextPayday);
      nextPayday.setDate(nextPayday.getDate() + normalizedInterval);
      guard += 1;
    }
    const daysUntil = Math.ceil((nextPayday.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return null;
    return daysUntil;
  }, [transactions]);

  const daysUntilPayday = getDaysUntilNextPayday();
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const displayName = (() => {
    const user = getCurrentUser();
    const email = getUserEmail();
    return user?.displayName || (email ? email.split('@')[0] : '');
  })();

  useEffect(() => {
    const name = displayName.trim().split(' ')[0] || 'Home';
    setUserFirstName(name);
  }, [displayName]);

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
        onRefresh={async () => {
          await onRefresh();
          await loadSummary();
        }}
        refreshing={refreshing}
        loading={(loading || summaryLoading) && !refreshing}
        loadingComponent={loadingComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom + 80 }}
      >
      {/* Header Section */}
      <ScreenHeader
        title={userFirstName}
        subtitle={getGreeting()}
        titleFontFamily="GulfsDisplay-Normal"
        titleLetterSpacing={0.5}
        rightAvatarSeed={profile?.avatarSeed}
        rightAction={{
          icon: "person-outline",
          onPress: () => router.push('/profile' as any)
        }}
      />

      {/* Financial Health Alert */}
      <FinancialHealthAlert
        income={displayIncome}
        expenses={displayExpenses}
        currencyCode={displayCurrency}
        onReviewSpending={() => router.push('/(tabs)/finance/income-expense' as any)}
      />

      {/* AI Insights */}
      <AIInsightCard
        insights={insights}
        loading={insightLoading}
        accessDenied={insightAccessDenied}
        accessDeniedReason={insightAccessDeniedReason}
        onRefresh={refreshInsights}
      />

      {/* Quick Stats */}
      <View style={styles.quickStatsCard}>
        <View style={styles.quickStat}>
          <View style={styles.quickStatIcon}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          </View>
          <Text style={styles.quickStatLabel}>Next payday</Text>
          <Text style={styles.quickStatValue}>
            {daysUntilPayday === null ? '0' : `${daysUntilPayday}`}
          </Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStat}>
          <View style={styles.quickStatIcon}>
            <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} />
          </View>
          <Text style={styles.quickStatLabel}>Safe to spend</Text>
          <Text style={styles.quickStatValue}>
            {formatCurrencySync(safeToSpend, displayCurrency)}
          </Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStat}>
          <View style={styles.quickStatIcon}>
            <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
          </View>
          <Text style={styles.quickStatLabel}>Bills this week</Text>
          <Text style={styles.quickStatValue}>
            {formatCurrencySync(weeklyBillsTotal, displayCurrency)}
          </Text>
        </View>
      </View>

      {/* Balance Card */}
      <View style={[styles.balanceCard, balanceExpanded ? styles.balanceCardExpanded : styles.balanceCardCompact]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setBalanceExpanded((prev) => !prev)}
          style={styles.balanceTouchable}
        >
          <Text style={styles.balanceLabel}>Net Worth</Text>
          <View style={styles.balanceAmountRow}>
            <View style={styles.balanceAmountLeft}>
              <SlotMachineBalance
                value={displayNetWorth}
                currencyCode={summaryCurrencyCode}
                style={balanceExpanded ? styles.balanceAmount : styles.balanceAmountCompact}
                animate={true}
                animationTrigger={balanceAnimationTrigger}
              />
            </View>
            <View style={styles.balanceHeaderRight}>
              {!balanceExpanded && (displayIncome === 0 && displayExpenses === 0 ? (
                <Text style={styles.balanceHeaderDash}>—</Text>
              ) : !balanceExpanded ? (
                <Ionicons
                  name={displayIncome - displayExpenses >= 0 ? 'trending-up' : 'trending-down'}
                  size={18}
                  color={colors.background}
                />
              ) : null)}
              <Ionicons
                name={balanceExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.background}
              />
            </View>
          </View>
        </TouchableOpacity>
        {balanceExpanded && (
          <>
            <Text style={styles.balanceAcrossAccounts}>
              Across {accountCount} account{accountCount !== 1 ? 's' : ''}
            </Text>
            <View style={styles.filterContainer}>
              {(['week', 'month', 'year'] as FilterPeriod[]).map((period) => (
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
                    {period === 'week' ? 'W' : period === 'month' ? 'M' : 'Y'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.balanceFooter}>
              <View style={styles.balanceStat}>
                <Text style={styles.balanceStatLabel}>{getPeriodLabel(filterPeriod)} Income</Text>
                <Text style={styles.balanceStatValue}>
                  {formatCurrencySync(displayIncome, displayCurrency)}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceStat}>
                <Text style={styles.balanceStatLabel}>{getPeriodLabel(filterPeriod)} Expenses</Text>
                <Text style={styles.balanceStatValue}>
                  {formatCurrencySync(displayExpenses, displayCurrency)}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

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
                  currencyCode={displayCurrency}
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
    padding: 16,
    borderRadius: 20,
    borderWidth: 0,
  },
  balanceCardCompact: {
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  balanceCardExpanded: {
    minHeight: 200,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  balanceTouchable: {},
  balanceLabel: {
    fontSize: 13,
    color: colors.background,
    fontWeight: '500',
    opacity: 0.8,
    marginBottom: 2,
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceAmountLeft: {
    flex: 1,
    marginRight: 12,
  },
  balanceHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceHeaderDash: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
    opacity: 0.8,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
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
    color: colors.background,
    opacity: 1,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  balanceAmountCompact: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: -0.3,
    marginBottom: 0,
  },
  balanceAcrossAccounts: {
    fontSize: 13,
    color: colors.background,
    marginBottom: 20,
    opacity: 0.7,
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
    marginBottom: 4,
    opacity: 0.7,
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
  actionableCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  actionableCta: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  actionableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  actionableText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  quickStatsCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  quickStatLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  quickStatIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: colors.border,
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
