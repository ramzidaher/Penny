import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Dimensions } from 'react-native';
import { useRouter, useFocusEffect, usePathname } from 'expo-router';
import AccountsScreen from '../../../src/screens/AccountsScreen';
import TransactionsScreen from '../../../src/screens/TransactionsScreen';
import BudgetsScreen from '../../../src/screens/BudgetsScreen';
import DebtsScreen from '../../../src/screens/DebtsScreen';
import AddAccountScreen from '../../../src/screens/AddAccountScreen';
import AddTransactionScreen from '../../../src/screens/AddTransactionScreen';
import AddBudgetScreen from '../../../src/screens/AddBudgetScreen';
import AddDebtScreen from '../../../src/screens/AddDebtScreen';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getAccounts, getTransactions, getBudgets } from '../../../src/database/db';
import { Account, Transaction, Budget } from '../../../src/database/schema';
import { startOfMonth, endOfMonth } from 'date-fns';
import { SkeletonList, SkeletonStatCard, SkeletonHeader } from '../../../src/components/SkeletonLoader';
import ScreenHeader from '../../../src/components/ScreenHeader';
import ScreenWrapper from '../../../src/components/ScreenWrapper';
import { waitForFirebase } from '../../../src/services/firebase';
import SettingsScreen from '../../../src/screens/SettingsScreen';
import { getSettings } from '../../../src/services/settingsService';
import { formatCurrencySync } from '../../../src/utils/currency';
import { filterTransactionsByPeriod, getPeriodLabel, type FilterPeriod } from '../../../src/utils/transactionFilters';
import { convertAmountsToCurrency } from '../../../src/services/currencyConversionService';

type ViewStyle = 'cards' | 'bars' | 'compact';

export default function FinanceHomeScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [viewStyle, setViewStyle] = useState<ViewStyle>('cards');
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [convertedPeriodIncome, setConvertedPeriodIncome] = useState<number | null>(null);
  const [convertedPeriodExpenses, setConvertedPeriodExpenses] = useState<number | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const moreButtonRef = useRef<View | null>(null);
  const hasLoadedRef = useRef(false);

  const openMoreActions = () => {
    // Anchor the popover to the "More" button location
    const node = moreButtonRef.current as any;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        setMoreAnchor({ x, y, width, height });
        setShowMoreActions(true);
      });
    } else {
      // Fallback: open centered if measurement isn't available
      setMoreAnchor(null);
      setShowMoreActions(true);
    }
  };

  const handleMoreNavigate = (route: string) => {
    setShowMoreActions(false);
    setMoreAnchor(null);
    requestAnimationFrame(() => {
      router.push(route as any);
    });
  };

  const morePopoverLayout = useMemo(() => {
    if (!moreAnchor) return null;
    const { width: screenW, height: screenH } = Dimensions.get('window');
    const POPOVER_W = 220;
    const ESTIMATED_H = 120;
    const PADDING = 12;
    const GAP = 4;

    const centerX = moreAnchor.x + moreAnchor.width / 2;
    const left = Math.min(Math.max(centerX - POPOVER_W / 2, PADDING), screenW - POPOVER_W - PADDING);

    const spaceAbove = moreAnchor.y;
    const spaceBelow = screenH - (moreAnchor.y + moreAnchor.height);
    // Prefer placing above the anchor (like a native popover)
    const placeAbove = spaceAbove >= ESTIMATED_H + GAP;

    const top = placeAbove
      ? Math.max(PADDING, moreAnchor.y - ESTIMATED_H - GAP)
      : Math.min(screenH - ESTIMATED_H - PADDING, moreAnchor.y + moreAnchor.height + GAP);

    const arrowLeftRaw = centerX - left - 7; // arrow is ~14px wide
    const arrowLeft = Math.min(Math.max(arrowLeftRaw, 16), POPOVER_W - 30);

    return { left, top, width: POPOVER_W, placeAbove, arrowLeft };
  }, [moreAnchor]);

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
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      // Only show loading on initial load, refresh silently on subsequent focuses
      const isInitialLoad = !hasLoadedRef.current;
      // Remove delay for faster loading
      loadData(isInitialLoad);
    }, [])
  );

  // Removed route checking logic - it was causing unnecessary re-renders and delays
  // Native tabs handle navigation correctly, no need for manual checks

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);
  const now = new Date();
  const startOfCurrentMonth = startOfMonth(now);
  const endOfCurrentMonth = endOfMonth(now);

  const filteredData = filterTransactionsByPeriod(transactions, filterPeriod);
  const periodIncomeRaw = filteredData.income;
  const periodExpensesRaw = filteredData.expenses;
  const periodNetRaw = filteredData.net;
  const periodTransactionsCount = filteredData.transactions.length;

  // Convert income/expenses to display currency (matches HomeScreen behaviour)
  useEffect(() => {
    const data = filterTransactionsByPeriod(transactions, filterPeriod);
    const convertTotals = async () => {
      if (!currencyCode || (accounts.length === 0 && data.transactions.length === 0)) {
        setConvertedPeriodIncome(data.income);
        setConvertedPeriodExpenses(data.expenses);
        return;
      }
      try {
        const incomeTransactions = data.transactions.filter(t => t.type === 'income');
        const expenseTransactions = data.transactions.filter(t => t.type === 'expense');
        const incomeAmounts = incomeTransactions.map(t => {
          const account = accounts.find(a => a.id === t.accountId);
          return { amount: t.amount, currency: account?.currency || currencyCode || 'USD' };
        });
        const expenseAmounts = expenseTransactions.map(t => {
          const account = accounts.find(a => a.id === t.accountId);
          return { amount: t.amount, currency: account?.currency || currencyCode || 'USD' };
        });
        const convertedIncome = await convertAmountsToCurrency(incomeAmounts, currencyCode);
        const convertedExpenses = await convertAmountsToCurrency(expenseAmounts, currencyCode);
        setConvertedPeriodIncome(convertedIncome);
        setConvertedPeriodExpenses(convertedExpenses);
      } catch (error) {
        console.error('[Finance Overview] Error converting currencies:', error);
        setConvertedPeriodIncome(data.income);
        setConvertedPeriodExpenses(data.expenses);
      }
    };
    convertTotals();
  }, [accounts, transactions, filterPeriod, currencyCode]);

  const displayIncome = convertedPeriodIncome ?? periodIncomeRaw;
  const displayExpenses = convertedPeriodExpenses ?? periodExpensesRaw;
  const displayNet = displayIncome - displayExpenses;
  const savingsRate = displayIncome > 0 ? ((displayIncome - displayExpenses) / displayIncome) * 100 : 0;

  const activeBudgets = budgets.length;

  const loadingComponent = (
    <>
      <SkeletonHeader />
      <View style={styles.skeletonStatsContainer}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </View>
      <View style={styles.skeletonContainer}>
        <SkeletonList count={3} />
      </View>
    </>
  );

  return (
    <ScreenWrapper
      onRefresh={onRefresh}
      refreshing={refreshing}
      loading={loading && !refreshing}
      loadingComponent={loadingComponent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <ScreenHeader
        subtitle="Manage your money"
        title="Finance"
        titleFontFamily="GulfsDisplay-Normal"
        titleLetterSpacing={0.5}
      />

      {/* Combined Overview Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionControls}>
            <View style={styles.periodChips}>
              {(['all', 'month', 'week', 'year'] as const).map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[styles.periodChip, filterPeriod === period && styles.periodChipActive]}
                  onPress={() => setFilterPeriod(period)}
                >
                  <Text style={[styles.periodChipText, filterPeriod === period && styles.periodChipTextActive]}>
                    {period === 'all' ? 'All' : period === 'month' ? 'Month' : period === 'week' ? 'Week' : 'Year'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
                <Text style={styles.statValueSmall}>{periodTransactionsCount}</Text>
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
                  {formatCurrencySync(displayIncome, currencyCode)}
                </Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>Expenses</Text>
                <Text
                  style={[
                    styles.overviewAmount,
                    styles.expenseText,
                    displayExpenses > displayIncome && { color: colors.warning },
                  ]}
                >
                  {formatCurrencySync(displayExpenses, currencyCode)}
                </Text>
              </View>
            </View>

            {/* Net & insight */}
            <View style={styles.insightRow}>
              <View style={styles.netRow}>
                <Text style={styles.netLabel}>Net ({getPeriodLabel(filterPeriod)})</Text>
                <Text
                  style={[
                    styles.netAmount,
                    { color: displayNet >= 0 ? colors.successGreen : colors.warning },
                  ]}
                >
                  {displayNet >= 0 ? '+' : ''}{formatCurrencySync(displayNet, currencyCode)}
                </Text>
              </View>
              {displayIncome > 0 && (
                <Text
                  style={[
                    styles.savingsRateText,
                    { color: savingsRate >= 0 ? colors.successGreen : colors.warning },
                  ]}
                  numberOfLines={1}
                >
                  {savingsRate >= 0
                    ? `${Math.min(savingsRate, 999).toFixed(0)}% saved`
                    : `${Math.min(Math.abs(savingsRate), 999).toFixed(0)}% over income${Math.abs(savingsRate) > 999 ? '+' : ''}`}
                </Text>
              )}
            </View>
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
                <Text style={styles.statValueSmall}>{periodTransactionsCount}</Text>
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
                    {formatCurrencySync(displayIncome, currencyCode)}
                  </Text>
                </View>
                <View style={styles.barChartBarContainer}>
                  <View 
                    style={[
                      styles.barChartBar, 
                      styles.barChartBarIncome,
                      { 
                        width: `${Math.min((displayIncome / Math.max(displayIncome + displayExpenses, 1)) * 100, 100)}%` 
                      }
                    ]} 
                  />
                </View>
              </View>
              <View style={styles.barChartItem}>
                <View style={styles.barChartHeader}>
                  <Text style={styles.barChartLabel}>Expenses</Text>
                  <Text
                    style={[
                      styles.barChartValue,
                      styles.expenseText,
                      displayExpenses > displayIncome && { color: colors.warning },
                    ]}
                  >
                    {formatCurrencySync(displayExpenses, currencyCode)}
                  </Text>
                </View>
                <View style={styles.barChartBarContainer}>
                  <View 
                    style={[
                      styles.barChartBar, 
                      styles.barChartBarExpense,
                      displayExpenses > displayIncome && { backgroundColor: colors.warning },
                      { 
                        width: `${Math.min((displayExpenses / Math.max(displayIncome + displayExpenses, 1)) * 100, 100)}%` 
                      }
                    ]} 
                  />
                </View>
              </View>
            </View>
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
                  <Text style={styles.compactValue}>{periodTransactionsCount}</Text>
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
                    {formatCurrencySync(displayIncome, currencyCode)}
                  </Text>
                </View>
              </View>
              <View style={styles.compactItem}>
                <Ionicons
                  name="arrow-down-circle"
                  size={20}
                  color={displayExpenses > displayIncome ? colors.warning : colors.text}
                />
                <View style={styles.compactTextContainer}>
                  <Text style={styles.compactLabel}>Expenses</Text>
                  <Text
                    style={[
                      styles.compactValue,
                      styles.expenseText,
                      displayExpenses > displayIncome && { color: colors.warning },
                    ]}
                  >
                    {formatCurrencySync(displayExpenses, currencyCode)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={[styles.quickActionButton, styles.quickActionButtonPressable]}
          onPress={() => router.push('/(tabs)/finance/accounts')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="wallet-outline" size={28} color={colors.primary} />
          </View>
          <Text
            style={styles.quickActionLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.9}
          >
            Accounts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.quickActionButton, styles.quickActionButtonPressable]}
          onPress={() => router.push('/(tabs)/finance/transactions')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="receipt-outline" size={28} color={colors.primary} />
          </View>
          <Text
            style={styles.quickActionLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.9}
          >
            Transactions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.quickActionButton, styles.quickActionButtonPressable]}
          onPress={() => router.push('/(tabs)/finance/budgets')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="pie-chart-outline" size={28} color={colors.primary} />
          </View>
          <Text
            style={styles.quickActionLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.9}
          >
            Budgets
          </Text>
        </TouchableOpacity>
        <View ref={moreButtonRef} collapsable={false} style={styles.quickActionButton}>
          <TouchableOpacity 
            style={styles.quickActionButtonPressable}
            onPress={openMoreActions}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name="ellipsis-horizontal" size={28} color={colors.primary} />
            </View>
            <Text
              style={styles.quickActionLabel}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              More
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showMoreActions}
        transparent
        animationType="none"
        onRequestClose={() => setShowMoreActions(false)}
      >
        <Pressable style={styles.moreOverlay} onPress={() => setShowMoreActions(false)}>
          {morePopoverLayout ? (
            <Pressable
              style={[
                styles.morePopover,
                { left: morePopoverLayout.left, top: morePopoverLayout.top, width: morePopoverLayout.width },
              ]}
              onPress={() => {}}
            >
              <View
                style={[
                  morePopoverLayout.placeAbove ? styles.moreArrowDown : styles.moreArrowUp,
                  { left: morePopoverLayout.arrowLeft },
                ]}
              />

              <View style={styles.moreContent}>
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => {
                    handleMoreNavigate('/(tabs)/finance/debts');
                  }}
                >
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                  <Text style={styles.moreItemText}>Debts</Text>
                </TouchableOpacity>

                <View style={styles.moreDivider} />

                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => {
                    handleMoreNavigate('/(tabs)/finance/subscriptions');
                  }}
                >
                  <Ionicons name="repeat-outline" size={20} color={colors.primary} />
                  <Text style={styles.moreItemText}>Subscriptions</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          ) : (
            // Fallback if we couldn't measure the button
            <Pressable style={[styles.morePopover, styles.morePopoverCentered]} onPress={() => {}}>
              <View style={styles.moreContent}>
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => {
                    handleMoreNavigate('/(tabs)/finance/debts');
                  }}
                >
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                  <Text style={styles.moreItemText}>Debts</Text>
                </TouchableOpacity>
                <View style={styles.moreDivider} />
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => {
                    handleMoreNavigate('/(tabs)/finance/subscriptions');
                  }}
                >
                  <Ionicons name="repeat-outline" size={20} color={colors.primary} />
                  <Text style={styles.moreItemText}>Subscriptions</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <View style={styles.bottomPadding} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  sectionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  periodChips: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  periodChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  periodChipActive: {
    backgroundColor: colors.primary,
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: colors.background,
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
    marginVertical: 14,
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
    alignItems: 'center',
    marginBottom: 0,
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
  insightRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  netLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  netAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  savingsRateText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
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
    marginBottom: 32,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  quickActionButton: {
    flex: 1,
    maxWidth: '25%',
    marginHorizontal: 2,
  },
  quickActionButtonPressable: {
    alignItems: 'center',
    paddingVertical: 12,
    width: '100%',
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
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
    flexShrink: 1,
  },
  moreOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    // Popover is positioned absolutely; overlay just catches outside taps
  },
  morePopover: {
    position: 'absolute',
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    // subtle depth
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  morePopoverCentered: {
    left: 20,
    right: 20,
    top: '45%',
    alignSelf: 'center',
    maxWidth: 320,
  },
  moreArrowUp: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.background,
  },
  moreArrowDown: {
    position: 'absolute',
    bottom: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.background,
  },
  moreContent: {
    paddingVertical: 8,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  moreItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  moreDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 14,
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

