import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AccountsScreen from '../../../src/screens/AccountsScreen';
import TransactionsScreen from '../../../src/screens/TransactionsScreen';
import BudgetsScreen from '../../../src/screens/BudgetsScreen';
import DebtsScreen from '../../../src/screens/DebtsScreen';
import AddAccountScreen from '../../../src/screens/AddAccountScreen';
import AddTransactionScreen from '../../../src/screens/AddTransactionScreen';
import AddBudgetScreen from '../../../src/screens/AddBudgetScreen';
import AddDebtScreen from '../../../src/screens/AddDebtScreen';
import ConnectBankScreen from '../../../src/screens/ConnectBankScreen';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, getTransactions, getBudgets } from '../../../src/database/db';
import { Account, Transaction, Budget } from '../../../src/database/schema';
import { startOfMonth, endOfMonth } from 'date-fns';
import { SkeletonList, SkeletonStatCard, SkeletonHeader } from '../../../src/components/SkeletonLoader';
import ScreenHeader from '../../../src/components/ScreenHeader';
import { waitForFirebase } from '../../../src/services/firebase';
import SettingsScreen from '../../../src/screens/SettingsScreen';
import { getSettings } from '../../../src/services/settingsService';
import { formatCurrencySync } from '../../../src/utils/currency';

type ViewStyle = 'cards' | 'bars' | 'compact';

export default function FinanceHomeScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [viewStyle, setViewStyle] = useState<ViewStyle>('cards');

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

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => {
        loadData();
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

  if (loading && !refreshing) {
    return (
      <ScrollView 
        style={styles.container} 
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
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
      contentInsetAdjustmentBehavior="never"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* #region agent log */}
      {(() => {
        fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/(tabs)/finance/index.tsx:113',message:'FinanceScreen container structure',data:{hasViewWrapper:false,hasScrollView:true,directScrollView:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
        return null;
      })()}
      {/* #endregion */}
      {/* Header */}
      <ScreenHeader
        subtitle="Manage your money"
        title="Finance"
      />

      {/* Combined Overview Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderWithToggle}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleButton, viewStyle === 'cards' && styles.toggleButtonActive]}
              onPress={() => setViewStyle('cards')}
            >
              <Ionicons 
                name="grid-outline" 
                size={18} 
                color={viewStyle === 'cards' ? colors.background : colors.textSecondary} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, viewStyle === 'bars' && styles.toggleButtonActive]}
              onPress={() => setViewStyle('bars')}
            >
              <Ionicons 
                name="bar-chart-outline" 
                size={18} 
                color={viewStyle === 'bars' ? colors.background : colors.textSecondary} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, viewStyle === 'compact' && styles.toggleButtonActive]}
              onPress={() => setViewStyle('compact')}
            >
              <Ionicons 
                name="list-outline" 
                size={18} 
                color={viewStyle === 'compact' ? colors.background : colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {viewStyle === 'cards' && (
          <View style={styles.combinedCard}>
            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={styles.statIconSmall}>
                  <Ionicons name="wallet" size={20} color={colors.primary} />
                </View>
                <Text style={styles.statValueSmall}>{accounts.length}</Text>
                <Text style={styles.statLabelSmall}>Accounts</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.statIconSmall}>
                  <Ionicons name="receipt" size={20} color={colors.primary} />
                </View>
                <Text style={styles.statValueSmall}>{transactions.length}</Text>
                <Text style={styles.statLabelSmall}>Transactions</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.statIconSmall}>
                  <Ionicons name="pie-chart" size={20} color={colors.primary} />
                </View>
                <Text style={styles.statValueSmall}>{activeBudgets}</Text>
                <Text style={styles.statLabelSmall}>Budgets</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.cardDivider} />

            {/* Income/Expenses Row */}
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

            {/* Budget Usage */}
            {totalBudgetLimit > 0 && (
              <>
                <View style={styles.cardDivider} />
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
              </>
            )}
          </View>
        )}

        {viewStyle === 'bars' && (
          <View style={styles.combinedCard}>
            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={styles.statIconSmall}>
                  <Ionicons name="wallet" size={20} color={colors.primary} />
                </View>
                <Text style={styles.statValueSmall}>{accounts.length}</Text>
                <Text style={styles.statLabelSmall}>Accounts</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.statIconSmall}>
                  <Ionicons name="receipt" size={20} color={colors.primary} />
                </View>
                <Text style={styles.statValueSmall}>{transactions.length}</Text>
                <Text style={styles.statLabelSmall}>Transactions</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.statIconSmall}>
                  <Ionicons name="pie-chart" size={20} color={colors.primary} />
                </View>
                <Text style={styles.statValueSmall}>{activeBudgets}</Text>
                <Text style={styles.statLabelSmall}>Budgets</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.cardDivider} />

            {/* Bar Chart View */}
            <View style={styles.barChartContainer}>
              <View style={styles.barChartItem}>
                <View style={styles.barChartHeader}>
                  <Text style={styles.barChartLabel}>Income</Text>
                  <Text style={[styles.barChartValue, styles.incomeText]}>
                    {formatCurrencySync(monthlyIncome, currencyCode)}
                  </Text>
                </View>
                <View style={styles.barChartBarContainer}>
                  <View 
                    style={[
                      styles.barChartBar, 
                      styles.barChartBarIncome,
                      { 
                        width: `${Math.min((monthlyIncome / Math.max(monthlyIncome + monthlyExpenses, 1)) * 100, 100)}%` 
                      }
                    ]} 
                  />
                </View>
              </View>
              <View style={styles.barChartItem}>
                <View style={styles.barChartHeader}>
                  <Text style={styles.barChartLabel}>Expenses</Text>
                  <Text style={[styles.barChartValue, styles.expenseText]}>
                    {formatCurrencySync(monthlyExpenses, currencyCode)}
                  </Text>
                </View>
                <View style={styles.barChartBarContainer}>
                  <View 
                    style={[
                      styles.barChartBar, 
                      styles.barChartBarExpense,
                      { 
                        width: `${Math.min((monthlyExpenses / Math.max(monthlyIncome + monthlyExpenses, 1)) * 100, 100)}%` 
                      }
                    ]} 
                  />
                </View>
              </View>
            </View>

            {/* Budget Usage */}
            {totalBudgetLimit > 0 && (
              <>
                <View style={styles.cardDivider} />
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
              </>
            )}
          </View>
        )}

        {viewStyle === 'compact' && (
          <View style={styles.combinedCard}>
            {/* Compact List View */}
            <View style={styles.compactRow}>
              <View style={styles.compactItem}>
                <Ionicons name="wallet" size={20} color={colors.primary} />
                <View style={styles.compactTextContainer}>
                  <Text style={styles.compactLabel}>Accounts</Text>
                  <Text style={styles.compactValue}>{accounts.length}</Text>
                </View>
              </View>
              <View style={styles.compactItem}>
                <Ionicons name="receipt" size={20} color={colors.primary} />
                <View style={styles.compactTextContainer}>
                  <Text style={styles.compactLabel}>Transactions</Text>
                  <Text style={styles.compactValue}>{transactions.length}</Text>
                </View>
              </View>
              <View style={styles.compactItem}>
                <Ionicons name="pie-chart" size={20} color={colors.primary} />
                <View style={styles.compactTextContainer}>
                  <Text style={styles.compactLabel}>Budgets</Text>
                  <Text style={styles.compactValue}>{activeBudgets}</Text>
                </View>
              </View>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.compactRow}>
              <View style={styles.compactItem}>
                <Ionicons name="arrow-up-circle" size={20} color={colors.primary} />
                <View style={styles.compactTextContainer}>
                  <Text style={styles.compactLabel}>Income</Text>
                  <Text style={[styles.compactValue, styles.incomeText]}>
                    {formatCurrencySync(monthlyIncome, currencyCode)}
                  </Text>
                </View>
              </View>
              <View style={styles.compactItem}>
                <Ionicons name="arrow-down-circle" size={20} color={colors.text} />
                <View style={styles.compactTextContainer}>
                  <Text style={styles.compactLabel}>Expenses</Text>
                  <Text style={[styles.compactValue, styles.expenseText]}>
                    {formatCurrencySync(monthlyExpenses, currencyCode)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Budget Usage */}
            {totalBudgetLimit > 0 && (
              <>
                <View style={styles.cardDivider} />
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
              </>
            )}
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance/accounts')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="wallet-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Accounts</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance/transactions')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="receipt-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Transactions</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance/budgets')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="pie-chart-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Budgets</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance/debts')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="card-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Debts</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeaderWithToggle: {
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  toggleButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
  combinedCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValueSmall: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statLabelSmall: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
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
  barChartContainer: {
    gap: 16,
  },
  barChartItem: {
    marginBottom: 4,
  },
  barChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  barChartLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  barChartValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  barChartBarContainer: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barChartBar: {
    height: '100%',
    borderRadius: 4,
  },
  barChartBarIncome: {
    backgroundColor: colors.primary,
  },
  barChartBarExpense: {
    backgroundColor: colors.text,
  },
  compactRow: {
    gap: 12,
  },
  compactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  compactValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 32,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionLabel: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
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

