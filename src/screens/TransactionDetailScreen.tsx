import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTransactions, getAccounts, getSubscriptions, getDebts, getBudgets, untagTransaction, updateTransaction } from '../database/db';
import { Transaction, Account, Subscription, Debt, Budget } from '../database/schema';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { format } from 'date-fns';
import { getTransactionIcon } from '../utils/icons';
import CompanyLogo from '../components/CompanyLogo';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper from '../components/ScreenWrapper';
import DebtCreationDialog from '../components/DebtCreationDialog';
import SubscriptionCreationDialog from '../components/SubscriptionCreationDialog';
import BudgetCreationDialog from '../components/BudgetCreationDialog';
import { formatCurrencySync } from '../utils/currency';
import { getSettings } from '../services/settingsService';
import { useDialog } from '../contexts/DialogContext';
import {
  findMatchesForTransaction,
  applyMatch,
  dismissMatch,
} from '../services/debtReconciliationService';

export default function TransactionDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const dialog = useDialog();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [debt, setDebt] = useState<Debt | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [showDebtDialog, setShowDebtDialog] = useState(false);
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [suggestedDebtMatch, setSuggestedDebtMatch] = useState<{
    transactionId: string;
    debtId: string;
    transaction: Transaction;
    debt: Debt;
  } | null>(null);

  const loadTransaction = useCallback(async () => {
    try {
      setLoading(true);
      const [transactions, accounts, subscriptions, debts, budgets, settings] = await Promise.all([
        getTransactions(),
        getAccounts(),
        getSubscriptions(),
        getDebts(),
        getBudgets(),
        getSettings(),
      ]);
      
      const foundTransaction = transactions.find(t => t.id === params.id);
      if (foundTransaction) {
        setTransaction(foundTransaction);
        const foundAccount = accounts.find(a => a.id === foundTransaction.accountId);
        setAccount(foundAccount || null);
        
        // Load linked subscription, debt, budget (refetched so remainingAmount/currentSpent are up to date)
        if (foundTransaction.subscriptionId) {
          const foundSubscription = subscriptions.find(s => s.id === foundTransaction.subscriptionId);
          setSubscription(foundSubscription || null);
        } else {
          setSubscription(null);
        }
        if (foundTransaction.debtId) {
          const foundDebt = debts.find(d => d.id === foundTransaction.debtId);
          setDebt(foundDebt || null);
        } else {
          setDebt(null);
        }
        if (foundTransaction.budgetId) {
          const foundBudget = budgets.find(b => b.id === foundTransaction.budgetId);
          setBudget(foundBudget || null);
        } else {
          setBudget(null);
        }
        if (
          foundTransaction.type === 'expense' &&
          !foundTransaction.debtId &&
          !foundTransaction.subscriptionId
        ) {
          const matches = await findMatchesForTransaction(foundTransaction, debts);
          setSuggestedDebtMatch(matches.length === 1 ? matches[0] : null);
        } else {
          setSuggestedDebtMatch(null);
        }
      } else {
        setTransaction(null);
        setAccount(null);
        setSubscription(null);
        setDebt(null);
        setBudget(null);
        setSuggestedDebtMatch(null);
      }
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading transaction:', error);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadTransaction();
  }, [loadTransaction]);

  // Refetch when screen gains focus so debt remainingAmount / budget currentSpent stay in sync after backend updates
  useFocusEffect(
    useCallback(() => {
      if (params.id) {
        loadTransaction();
      }
    }, [params.id, loadTransaction])
  );

  const handleUntagSubscription = async () => {
    if (!transaction) return;
    
    await dialog.showDialog(
      'Untag Subscription',
      'Are you sure you want to remove the subscription link from this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Untag',
          style: 'destructive',
          onPress: async () => {
            try {
              await untagTransaction(transaction.id, 'subscription');
              await loadTransaction();
            } catch (error) {
              dialog.alert('Error', 'Failed to untag subscription');
            }
          },
        },
      ]
    );
  };

  const handleUntagDebt = async () => {
    if (!transaction) return;
    const debtIdToDismiss = transaction.debtId;
    await dialog.showDialog(
      'Untag Debt',
      'Are you sure you want to remove the debt link from this transaction? This payment will no longer count toward the debt.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Untag',
          style: 'destructive',
          onPress: async () => {
            try {
              await untagTransaction(transaction.id, 'debt');
              if (debtIdToDismiss) {
                await dismissMatch(transaction.id, debtIdToDismiss);
              }
              await loadTransaction();
            } catch (error) {
              dialog.alert('Error', 'Failed to untag debt');
            }
          },
        },
      ]
    );
  };

  const handleApplyToDebt = useCallback(async () => {
    if (!suggestedDebtMatch) return;
    try {
      await applyMatch(suggestedDebtMatch.transactionId, suggestedDebtMatch.debtId);
      setSuggestedDebtMatch(null);
      await loadTransaction();
    } catch (error) {
      dialog.alert('Error', 'Failed to apply payment to debt');
    }
  }, [suggestedDebtMatch, loadTransaction, dialog]);

  const handleDismissDebtSuggestion = useCallback(async () => {
    if (!suggestedDebtMatch) return;
    try {
      await dismissMatch(suggestedDebtMatch.transactionId, suggestedDebtMatch.debtId);
      setSuggestedDebtMatch(null);
      await loadTransaction();
    } catch (error) {
      dialog.alert('Error', 'Failed to dismiss suggestion');
    }
  }, [suggestedDebtMatch, loadTransaction, dialog]);

  const handleUntagBudget = async () => {
    if (!transaction) return;
    
    await dialog.showDialog(
      'Untag Budget',
      'Are you sure you want to remove the budget link from this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Untag',
          style: 'destructive',
          onPress: async () => {
            try {
              await untagTransaction(transaction.id, 'budget');
              await loadTransaction();
            } catch (error) {
              dialog.alert('Error', 'Failed to untag budget');
            }
          },
        },
      ]
    );
  };

  const handleUncategorize = async () => {
    if (!transaction) return;
    
    const hasTags = transaction.subscriptionId || transaction.debtId || transaction.budgetId;
    if (!hasTags) {
      dialog.alert('Info', 'This transaction is already uncategorized');
      return;
    }
    
    await dialog.showDialog(
      'Uncategorize Transaction',
      'This will remove all tags (subscription, debt, etc.) from this transaction. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Uncategorize',
          style: 'destructive',
          onPress: async () => {
            try {
              await untagTransaction(transaction.id, 'all');
              await loadTransaction();
            } catch (error) {
              dialog.alert('Error', 'Failed to uncategorize transaction');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Transaction Details" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Transaction Details" />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.textLight} />
          <Text style={styles.errorText}>Transaction not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const iconInfo = getTransactionIcon(transaction.category, transaction.description);
  let companyName: string | null = null;
  if (transaction.category === 'Subscription') {
    companyName = transaction.description || null;
  } else if (transaction.description) {
    const cleanDesc = transaction.description.replace(/^Subscription:\s*/i, '');
    companyName = cleanDesc.split(/[,\s-]/)[0].trim();
  }

  const transactionDate = new Date(transaction.date);
  const createdDate = new Date(transaction.createdAt);

  return (
    <ScreenWrapper>
      <ScreenHeader 
        title="Transaction Details"
        rightAction={{
          icon: 'close-outline',
          onPress: () => router.back(),
        }}
      />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Amount Card */}
        <View style={styles.amountCard}>
          <View style={styles.amountHeader}>
            {companyName && companyName.length > 2 ? (
              <CompanyLogo
                name={companyName}
                type="transaction"
                category={transaction.category}
                description={transaction.description}
                logoUrl={transaction.merchantLogoUrl}
                size={80}
              />
            ) : (
              <View style={[
                styles.iconContainer,
                transaction.type === 'income' ? styles.incomeIconBg : styles.expenseIconBg
              ]}>
                <Ionicons
                  name={iconInfo.name}
                  size={40}
                  color={iconInfo.color}
                />
              </View>
            )}
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={[
              styles.amountValue,
              transaction.type === 'income' ? styles.incomeAmount : styles.expenseAmount
            ]}>
              {transaction.type === 'income' ? '+' : '-'}{formatCurrencySync(transaction.amount, currencyCode)}
            </Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Details</Text>
          
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{transaction.category}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.detailValue}>{transaction.description || 'No description'}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Type</Text>
              <View style={styles.typeBadge}>
                <Ionicons 
                  name={transaction.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'} 
                  size={16} 
                  color={transaction.type === 'income' ? colors.primary : colors.text} 
                />
                <Text style={[
                  styles.typeText,
                  transaction.type === 'income' ? styles.incomeType : styles.expenseType
                ]}>
                  {transaction.type === 'income' ? 'Income' : 'Expense'}
                </Text>
              </View>
            </View>
          </View>

          {account && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Account</Text>
                <View style={styles.accountInfo}>
                  <Ionicons name="wallet-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.detailValue}>{account.name}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>
                {format(transactionDate, 'EEEE, MMMM dd, yyyy')}
              </Text>
              <Text style={styles.detailSubtext}>
                {format(transactionDate, 'h:mm a')}
              </Text>
            </View>
          </View>

          {transaction.truelayerTransactionId && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Transaction ID</Text>
                <Text style={styles.detailValueSmall}>{transaction.truelayerTransactionId}</Text>
              </View>
            </View>
          )}

          {/* Apply to debt suggestion - unlinked expense with one matching debt */}
          {suggestedDebtMatch && (
            <View style={styles.debtSuggestionBanner}>
              <Text style={styles.debtSuggestionText}>
                Apply this {formatCurrencySync(transaction.amount, currencyCode)} to your {suggestedDebtMatch.debt.name} debt?
              </Text>
              <View style={styles.debtSuggestionButtons}>
                <TouchableOpacity
                  style={styles.debtSuggestionApplyButton}
                  onPress={handleApplyToDebt}
                  activeOpacity={0.8}
                >
                  <Text style={styles.debtSuggestionApplyText}>Apply</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.debtSuggestionDismissButton}
                  onPress={handleDismissDebtSuggestion}
                  activeOpacity={0.8}
                >
                  <Text style={styles.debtSuggestionDismissText}>No, don't count toward debt</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Linked Subscription */}
          {subscription && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <View style={styles.linkedItemHeader}>
                  <View>
                    <Text style={styles.detailLabel}>Linked Subscription</Text>
                    <Text style={styles.detailValue}>{subscription.name}</Text>
                    <Text style={styles.detailValueSmall}>
                      {formatCurrencySync(subscription.amount, currencyCode)} / {subscription.frequency}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.untagButton}
                    onPress={handleUntagSubscription}
                  >
                    <Text style={styles.untagButtonText}>Untag</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Linked Debt */}
          {debt && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <View style={styles.linkedItemHeader}>
                  <View>
                    <Text style={styles.detailLabel}>Linked Debt</Text>
                    <Text style={styles.detailValue}>{debt.name}</Text>
                    <Text style={styles.detailValueSmall}>
                      Remaining: {formatCurrencySync(debt.remainingAmount, currencyCode)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.untagButton}
                    onPress={handleUntagDebt}
                  >
                    <Text style={styles.untagButtonText}>Untag</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Linked Budget */}
          {budget && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <View style={styles.linkedItemHeader}>
                  <View>
                    <Text style={styles.detailLabel}>Linked Budget</Text>
                    <Text style={styles.detailValue}>{budget.category}</Text>
                    <Text style={styles.detailValueSmall}>
                      {formatCurrencySync(budget.currentSpent, currencyCode)} / {formatCurrencySync(budget.limit, currencyCode)} ({budget.period})
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.untagButton}
                    onPress={handleUntagBudget}
                  >
                    <Text style={styles.untagButtonText}>Untag</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Uncategorize Button - Show if transaction has any tags */}
          {(subscription || debt || budget) && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <TouchableOpacity
                  style={styles.uncategorizeButton}
                  onPress={handleUncategorize}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                  <Text style={styles.uncategorizeButtonText}>Uncategorize Transaction</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Link to subscription / debt / budget - only for expenses when at least one link is missing */}
          {transaction.type === 'expense' && (!subscription || !debt || !budget) && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Link to</Text>
                <View style={styles.linkButtonsRow}>
                  {!subscription && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => setShowSubscriptionDialog(true)}
                    >
                      <Ionicons name="repeat-outline" size={18} color={colors.primary} />
                      <Text style={styles.linkButtonText}>Subscription</Text>
                    </TouchableOpacity>
                  )}
                  {!debt && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => setShowDebtDialog(true)}
                    >
                      <Ionicons name="card-outline" size={18} color={colors.primary} />
                      <Text style={styles.linkButtonText}>Debt</Text>
                    </TouchableOpacity>
                  )}
                  {!budget && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => setShowBudgetDialog(true)}
                    >
                      <Ionicons name="pie-chart-outline" size={18} color={colors.primary} />
                      <Text style={styles.linkButtonText}>Budget</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Created</Text>
              <Text style={styles.detailValueSmall}>
                {format(createdDate, 'MMM dd, yyyy • h:mm a')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <SubscriptionCreationDialog
        visible={showSubscriptionDialog}
        transaction={transaction}
        onClose={() => setShowSubscriptionDialog(false)}
        onComplete={() => {
          setShowSubscriptionDialog(false);
          loadTransaction();
        }}
      />
      <DebtCreationDialog
        visible={showDebtDialog}
        transaction={transaction}
        category={transaction?.category || 'Debt'}
        onClose={() => setShowDebtDialog(false)}
        onComplete={() => {
          setShowDebtDialog(false);
          loadTransaction();
        }}
        onNavigateToDebts={() => {
          setShowDebtDialog(false);
          loadTransaction();
          router.push('/(tabs)/finance/debts' as any);
        }}
      />
      <BudgetCreationDialog
        visible={showBudgetDialog}
        transaction={transaction}
        category={transaction?.category || 'Other'}
        onClose={() => setShowBudgetDialog(false)}
        onComplete={async (budgetId) => {
          setShowBudgetDialog(false);
          if (transaction && budgetId) {
            try {
              await updateTransaction(transaction.id, {
                budgetId,
                type: 'expense',
                category: transaction.category || 'Other',
              });
            } catch (e) {
              dialog.alert('Error', e instanceof Error ? e.message : 'Failed to link budget');
            }
          }
          loadTransaction();
        }}
      />
    </ScreenWrapper>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 32,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  amountHeader: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  incomeIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  expenseIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  amountLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  incomeAmount: {
    color: colors.primary,
  },
  expenseAmount: {
    color: colors.text,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  detailRow: {
    marginBottom: 20,
  },
  detailItem: {
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  detailValueSmall: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailSubtext: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  incomeType: {
    color: colors.primary,
  },
  expenseType: {
    color: colors.text,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  debtSuggestionBanner: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debtSuggestionText: {
    ...typography.body,
    color: colors.text,
    marginBottom: 12,
  },
  debtSuggestionButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  debtSuggestionApplyButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  debtSuggestionApplyText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.background,
  },
  debtSuggestionDismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  debtSuggestionDismissText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  linkedItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  untagButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  untagButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  uncategorizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.surface,
    gap: 8,
  },
  uncategorizeButtonText: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '600',
  },
  linkButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linkButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});


