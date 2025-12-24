import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import AccountsScreen from './AccountsScreen';
import TransactionsScreen from './TransactionsScreen';
import BudgetsScreen from './BudgetsScreen';
import DebtsScreen from './DebtsScreen';
import AddAccountScreen from './AddAccountScreen';
import AddTransactionScreen from './AddTransactionScreen';
import AddBudgetScreen from './AddBudgetScreen';
import AddDebtScreen from './AddDebtScreen';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, getTransactions, getBudgets } from '../database/db';
import { Account, Transaction, Budget } from '../database/schema';
import { startOfMonth, endOfMonth } from 'date-fns';
import { SkeletonList, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import SettingsScreen from './SettingsScreen';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync } from '../utils/currency';

const Stack = createStackNavigator();

function FinanceHomeScreen({ navigation }: any) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadData = async () => {
    try {
      setLoading(true);
      await waitForFirebase();
      const [accs, trans, buds, settings] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getBudgets(),
        getSettings(),
      ]);
      setAccounts(accs);
      setTransactions(trans);
      setBudgets(buds);
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 100);
    const unsubscribe = navigation.addListener('focus', loadData);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation]);

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
      <View style={styles.header}>
        <Text style={styles.title}>Finance</Text>
        <Text style={styles.subtitle}>Manage your money</Text>
      </View>

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
            <View style={styles.overviewDivider} />
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
      <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
      <Stack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ title: 'Add Transaction' }} />
      <Stack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Budgets' }} />
      <Stack.Screen name="AddBudget" component={AddBudgetScreen} options={{ title: 'Add Budget' }} />
      <Stack.Screen name="Debts" component={DebtsScreen} options={{ title: 'Debts' }} />
      <Stack.Screen name="AddDebt" component={AddDebtScreen} options={{ title: 'Add Debt' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
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
    marginBottom: 12,
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
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  overviewItem: {
    alignItems: 'center',
    flex: 1,
  },
  overviewLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
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
  overviewDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  budgetOverview: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
});
