import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, getTransactions, getBudgets, getSubscriptions } from '../database/db';
import { Account, Transaction, Budget, Subscription } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getTransactionIcon } from '../utils/icons';
import { getSubscriptionIcon } from '../utils/icons';
import CompanyLogo from '../components/CompanyLogo';
import { SkeletonLoader, SkeletonCard, SkeletonStatCard, SkeletonHeader } from '../components/SkeletonLoader';
import { waitForFirebase } from '../services/firebase';
import { getSettings } from '../services/settingsService';
import { formatCurrencySync, getCurrencySymbol } from '../utils/currency';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');

  const loadData = async () => {
    try {
      setLoading(true);
      // Wait for Firebase to be ready before loading data
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
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure Firebase is initialized
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

  const recentTransactions = transactions.slice(0, 5);
  const upcomingSubscriptions = subscriptions
    .filter(s => new Date(s.nextBillingDate) >= now)
    .slice(0, 3);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading && !refreshing) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header Section */}
      <View style={[styles.header, { paddingTop: Math.min(insets.top + 4, 16) }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>Welcome back</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => router.push('/(tabs)/finance/settings')}
          >
            <Ionicons name="settings-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceAmount}>{formatCurrencySync(totalBalance, currencyCode)}</Text>
        <View style={styles.balanceFooter}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Income</Text>
            <Text style={styles.balanceStatValue}>{formatCurrencySync(monthlyIncome, currencyCode)}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Expenses</Text>
            <Text style={styles.balanceStatValue}>{formatCurrencySync(monthlyExpenses, currencyCode)}</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Add Transaction</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="wallet-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Accounts</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/finance')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="pie-chart-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Budgets</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/(tabs)/ai')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="chatbubbles-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>AI Advisor</Text>
        </TouchableOpacity>
      </View>

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
              const iconInfo = getTransactionIcon(transaction.category, transaction.description);
              // For subscriptions, use the description directly (it's the subscription name)
              // For other transactions, extract from description
              let companyName: string | null = null;
              if (transaction.category === 'Subscription') {
                companyName = transaction.description || null;
              } else if (transaction.description) {
                // Remove "Subscription: " prefix if present
                const cleanDesc = transaction.description.replace(/^Subscription:\s*/i, '');
                companyName = cleanDesc.split(/[,\s-]/)[0].trim();
              }
              
              return (
                <TouchableOpacity 
                  key={transaction.id} 
                  style={[
                    styles.transactionCard,
                    index === recentTransactions.length - 1 && styles.transactionCardLast
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.transactionLeft}>
                    {companyName && companyName.length > 2 ? (
                      <CompanyLogo
                        name={companyName}
                        type="transaction"
                        category={transaction.category}
                        description={transaction.description}
                        size={48}
                      />
                    ) : (
                      <View style={[
                        styles.transactionIconContainer,
                        transaction.type === 'income' ? styles.incomeIconBg : styles.expenseIconBg
                      ]}>
                        <Ionicons
                          name={iconInfo.name}
                          size={24}
                          color={iconInfo.color}
                        />
                      </View>
                    )}
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionCategory}>{transaction.category}</Text>
                      <Text style={styles.transactionDescription}>
                        {transaction.description || format(new Date(transaction.date), 'MMM dd, yyyy')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.transactionRight}>
                    <Text style={[
                      styles.transactionAmount,
                      transaction.type === 'income' ? styles.incomeAmount : styles.expenseAmount
                    ]}>
                      {transaction.type === 'income' ? '+' : '-'}{formatCurrencySync(transaction.amount, currencyCode)}
                    </Text>
                  </View>
                </TouchableOpacity>
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
            <TouchableOpacity onPress={() => router.push('/(tabs)/subscriptions')}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 24,
    borderRadius: 24,
    minHeight: 200,
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.background,
    opacity: 0.8,
    marginBottom: 8,
    fontWeight: '500',
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
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
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
  transactionCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  transactionDescription: {
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
