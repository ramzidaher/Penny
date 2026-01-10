import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '../utils/navigation';
import { useFocusEffect } from 'expo-router';
import AccountsScreen from './AccountsScreen';
import TransactionsScreen from './TransactionsScreen';
import BudgetsScreen from './BudgetsScreen';
import DebtsScreen from './DebtsScreen';
import AddAccountScreen from './AddAccountScreen';
import AddTransactionScreen from './AddTransactionScreen';
import AddBudgetScreen from './AddBudgetScreen';
import AddDebtScreen from './AddDebtScreen';
import ConnectBankScreen from './ConnectBankScreen';
import SubscriptionsScreen from './SubscriptionsScreen';
import AddSubscriptionScreen from './AddSubscriptionScreen';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, getTransactions, getBudgets, getSubscriptions } from '../database/db';
import { Account, Transaction, Budget, Subscription } from '../database/schema';
import { startOfMonth, endOfMonth } from 'date-fns';
import { SkeletonList, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import ScreenHeader from '../components/ScreenHeader';
import { waitForFirebase } from '../services/firebase';
import SettingsScreen from './SettingsScreen';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

const Stack = createStackNavigator();

function FinanceHomeScreen({ navigation }: any) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const hasLoadedRef = useRef(false);

  const loadData = async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      await waitForFirebase();
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
      const timer = setTimeout(() => {
        loadData(isInitialLoad);
      }, 100);
      return () => clearTimeout(timer);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const now = new Date();
  const startOfCurrentMonth = startOfMonth(now);
  const endOfCurrentMonth = endOfMonth(now);
  
  const monthlyTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date >= startOfCurrentMonth && date <= endOfCurrentMonth;
  });
  
  const monthlyIncome = monthlyTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const monthlyExpenses = monthlyTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const activeBudgets = budgets.length;
  const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalBudgetSpent = budgets.reduce((sum, b) => sum + b.currentSpent, 0);

  const totalMonthlySubscriptions = subscriptions
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);
  const totalYearlySubscriptions = subscriptions
    .filter(s => s.frequency === 'yearly')
    .reduce((sum, s) => sum + s.amount, 0);
  const monthlySubscriptionCost = totalMonthlySubscriptions + (totalYearlySubscriptions / 12);
  
  const upcomingSubscriptions = subscriptions
    .filter(s => new Date(s.nextBillingDate) >= now)
    .sort((a, b) => new Date(a.nextBillingDate).getTime() - new Date(b.nextBillingDate).getTime())
    .slice(0, 3);

  const getProgressPercentage = (budget: Budget) => {
    return Math.min((budget.currentSpent / budget.limit) * 100, 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return colors.error;
    if (percentage >= 80) return colors.textSecondary;
    return colors.primary;
  };

  if (loading && !refreshing) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <SkeletonHeader />
        <View style={styles.skeletonStatsContainer}>
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </View>
        <View style={styles.skeletonContainer}>
          <SkeletonList count={3} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <ScreenHeader
        title="Finance"
        subtitle="Manage your money"
      />

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="wallet" size={24} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{accounts.length}</Text>
          <Text style={styles.statLabel}>Accounts</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="receipt" size={24} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{transactions.length}</Text>
          <Text style={styles.statLabel}>Transactions</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="pie-chart" size={24} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{activeBudgets}</Text>
          <Text style={styles.statLabel}>Budgets</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="repeat" size={24} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{subscriptions.length}</Text>
          <Text style={styles.statLabel}>Subscriptions</Text>
        </View>
      </View>

      {/* Monthly Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Month</Text>
        <View style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Income</Text>
              <Text style={[styles.overviewAmount, styles.incomeText]}>
                {formatCurrencySync(monthlyIncome, currencyCode)}
              </Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Expenses</Text>
              <Text style={[styles.overviewAmount, styles.expenseText]}>
                {formatCurrencySync(monthlyExpenses, currencyCode)}
              </Text>
            </View>
          </View>
          {totalBudgetLimit > 0 && (
            <View style={styles.budgetOverview}>
              <View style={styles.budgetOverviewHeader}>
                <Text style={styles.budgetOverviewLabel}>Budget Usage</Text>
                <Text style={styles.budgetOverviewPercent}>
                  {((totalBudgetSpent / totalBudgetLimit) * 100).toFixed(0)}%
                </Text>
              </View>
              <View style={styles.budgetProgressBar}>
                <View 
                  style={[
                    styles.budgetProgressFill, 
                    { width: `${Math.min((totalBudgetSpent / totalBudgetLimit) * 100, 100)}%` }
                  ]} 
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Subscriptions Section */}
      {subscriptions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Subscriptions</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Subscriptions')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          {upcomingSubscriptions.length > 0 ? (
            <>
              {upcomingSubscriptions.map((subscription) => {
                const daysUntil = Math.ceil((new Date(subscription.nextBillingDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isDueToday = daysUntil === 0;
                
                return (
                  <View key={subscription.id} style={styles.subscriptionCard}>
                    <View style={styles.subscriptionHeader}>
                      <Text style={styles.subscriptionName}>{subscription.name}</Text>
                      <Text style={styles.subscriptionAmount}>
                        {formatCurrencySync(subscription.amount, currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.subscriptionFooter}>
                      <Text style={styles.subscriptionFrequency}>
                        {subscription.frequency.charAt(0).toUpperCase() + subscription.frequency.slice(1)}
                      </Text>
                      <Text style={[styles.subscriptionDate, isDueToday && styles.subscriptionDateDue]}>
                        {isDueToday ? 'Due today' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''} left`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {subscriptions.length > 3 && (
                <TouchableOpacity
                  style={styles.viewMoreButton}
                  onPress={() => navigation.navigate('Subscriptions')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewMoreText}>
                    View {subscriptions.length - 3} more subscription{subscriptions.length - 3 !== 1 ? 's' : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="repeat-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No upcoming subscriptions</Text>
            </View>
          )}
        </View>
      )}

      {/* Budgets List */}
      {budgets.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Budgets</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Budgets')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          {budgets.slice(0, 3).map((budget) => {
            const percentage = getProgressPercentage(budget);
            const progressColor = getProgressColor(percentage);
            
            return (
              <View key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetCategory}>{budget.category}</Text>
                  <Text style={styles.budgetPeriod}>{budget.period}</Text>
                </View>
                <View style={styles.budgetAmounts}>
                  <Text style={styles.budgetSpent}>
                    {formatCurrencySync(budget.currentSpent, currencyCode)}
                  </Text>
                  <Text style={styles.budgetLimit}>
                    / {formatCurrencySync(budget.limit, currencyCode)}
                  </Text>
                  <Text style={styles.budgetPercent}>
                    {percentage.toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.progressContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      { 
                        width: `${percentage}%`, 
                        backgroundColor: progressColor 
                      }
                    ]} 
                  />
                </View>
              </View>
            );
          })}
          {budgets.length > 3 && (
            <TouchableOpacity
              style={styles.viewMoreButton}
              onPress={() => navigation.navigate('Budgets')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewMoreText}>
                View {budgets.length - 3} more budget{budgets.length - 3 !== 1 ? 's' : ''}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Accounts')}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="wallet" size={28} color={colors.background} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Accounts</Text>
              <Text style={styles.actionSubtitle}>
                {accounts.length === 0 ? 'Add your first account' : `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Transactions')}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="receipt" size={28} color={colors.background} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Transactions</Text>
              <Text style={styles.actionSubtitle}>
                Start tracking expenses
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Budgets')}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="pie-chart" size={28} color={colors.background} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Budgets</Text>
              <Text style={styles.actionSubtitle}>
                Set spending limits
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Debts')}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="card-outline" size={28} color={colors.background} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Debts</Text>
              <Text style={styles.actionSubtitle}>
                Track loans & credit
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Subscriptions')}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="repeat" size={28} color={colors.background} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Subscriptions</Text>
              <Text style={styles.actionSubtitle}>
                {subscriptions.length === 0 ? 'Track recurring payments' : `${subscriptions.length} active subscription${subscriptions.length !== 1 ? 's' : ''}`}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

export default function FinanceStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen 
        name="FinanceHome" 
        component={FinanceHomeScreen} 
        options={{ title: 'Finance', headerShown: false }} 
      />
      <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'Accounts' }} />
      <Stack.Screen name="AddAccount" component={AddAccountScreen} options={{ title: 'Add Account' }} />
      <Stack.Screen name="ConnectBank" component={ConnectBankScreen} options={{ title: 'Connect Bank' }} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
      <Stack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ title: 'Add Transaction' }} />
      <Stack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Budgets' }} />
      <Stack.Screen name="AddBudget" component={AddBudgetScreen} options={{ title: 'Add Budget' }} />
      <Stack.Screen name="Debts" component={DebtsScreen} options={{ title: 'Debts' }} />
      <Stack.Screen name="AddDebt" component={AddDebtScreen} options={{ title: 'Add Debt' }} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ title: 'Subscriptions' }} />
      <Stack.Screen name="AddSubscription" component={AddSubscriptionScreen} options={{ title: 'Add Subscription' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
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
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  overviewItem: {
    alignItems: 'center',
    flex: 1,
  },
  overviewLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  overviewAmount: {
    fontSize: 24,
    fontWeight: '700',
  },
  incomeText: {
    color: colors.primary,
  },
  expenseText: {
    color: colors.text,
  },
  budgetOverview: {
    marginTop: 12,
  },
  budgetOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetOverviewLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  budgetOverviewPercent: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  budgetProgressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  budgetProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  actionsGrid: {
    gap: 0,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  bottomPadding: {
    height: 40,
  },
  skeletonStatsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  skeletonContainer: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  budgetCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetCategory: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  budgetPeriod: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  budgetAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  budgetSpent: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  budgetLimit: {
    fontSize: 16,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '500',
  },
  budgetPercent: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 'auto',
    fontWeight: '600',
  },
  progressContainer: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  viewMoreText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    marginRight: 4,
  },
  subscriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subscriptionName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  subscriptionAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subscriptionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subscriptionFrequency: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  subscriptionDate: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  subscriptionDateDue: {
    color: colors.primary,
    fontWeight: '700',
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
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
    fontWeight: '500',
  },
});
