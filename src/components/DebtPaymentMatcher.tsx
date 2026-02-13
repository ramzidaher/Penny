import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrencySync } from '../utils/currency';
import { format } from 'date-fns';
import type { PendingDebtMatch } from '../services/debtReconciliationService';
import { typography } from '../theme/typography';

export interface DebtPaymentMatcherProps {
  pendingMatches: PendingDebtMatch[];
  currencyCode: string;
  onApply: (transactionId: string, debtId: string) => Promise<void>;
  onDismiss: (transactionId: string, debtId?: string) => Promise<void>;
  onNavigateToTransaction?: (transactionId: string) => void;
}

export default function DebtPaymentMatcher({
  pendingMatches,
  currencyCode,
  onApply,
  onDismiss,
  onNavigateToTransaction,
}: DebtPaymentMatcherProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const handleApply = useCallback(
    async (m: PendingDebtMatch) => {
      if (applyingId) return;
      setApplyingId(m.transactionId);
      try {
        await onApply(m.transactionId, m.debtId);
      } finally {
        setApplyingId(null);
      }
    },
    [onApply, applyingId]
  );

  const handleDismiss = useCallback(
    async (m: PendingDebtMatch) => {
      if (dismissingId) return;
      setDismissingId(m.transactionId);
      try {
        await onDismiss(m.transactionId, m.debtId);
      } finally {
        setDismissingId(null);
      }
    },
    [onDismiss, dismissingId]
  );

  const handleApplyAll = useCallback(async () => {
    for (const m of pendingMatches) {
      if (applyingId) break;
      setApplyingId(m.transactionId);
      try {
        await onApply(m.transactionId, m.debtId);
      } finally {
        setApplyingId(null);
      }
    }
  }, [pendingMatches, onApply, applyingId]);

  if (pendingMatches.length === 0) return null;

  const count = pendingMatches.length;
  const title =
    count === 1
      ? '1 payment detected that may reduce your debts'
      : `${count} payments detected that may reduce your debts`;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.list}>
          {pendingMatches.map((m) => {
            const isApplying = applyingId === m.transactionId;
            const isDismissing = dismissingId === m.transactionId;
            return (
              <View key={`${m.transactionId}|${m.debtId}`} style={styles.row}>
                <TouchableOpacity
                  style={styles.rowMain}
                  onPress={() =>
                    onNavigateToTransaction?.(m.transactionId)
                  }
                  activeOpacity={onNavigateToTransaction ? 0.7 : 1}
                  disabled={!onNavigateToTransaction}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowDescription} numberOfLines={1}>
                      {m.transaction.description || 'Payment'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatCurrencySync(m.transaction.amount, currencyCode)} ·{' '}
                      {format(new Date(m.transaction.date), 'MMM d')} →{' '}
                      {m.debt.name}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <TouchableOpacity
                      style={[styles.applyButton, isApplying && styles.buttonDisabled]}
                      onPress={() => handleApply(m)}
                      disabled={isApplying || isDismissing}
                      activeOpacity={0.8}
                    >
                      {isApplying ? (
                        <ActivityIndicator size="small" color={colors.background} />
                      ) : (
                        <Text style={styles.applyButtonText}>Apply</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dismissButton}
                      onPress={() => handleDismiss(m)}
                      disabled={isApplying || isDismissing}
                      activeOpacity={0.8}
                    >
                      {isDismissing ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : (
                        <Text style={styles.dismissButtonText}>Don't use</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
          {pendingMatches.length > 1 && (
            <TouchableOpacity
              style={styles.applyAllButton}
              onPress={handleApplyAll}
              disabled={!!applyingId}
              activeOpacity={0.8}
            >
              <Text style={styles.applyAllButtonText}>Apply all</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom: 20,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    title: {
      ...typography.body,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      marginRight: 8,
    },
    list: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    row: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowMain: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    rowLeft: {
      flex: 1,
      marginRight: 12,
    },
    rowDescription: {
      ...typography.body,
      color: colors.text,
      marginBottom: 2,
    },
    rowMeta: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    applyButton: {
      backgroundColor: colors.primary,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      minWidth: 56,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    applyButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.background,
    },
    dismissButton: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      minWidth: 56,
      alignItems: 'center',
    },
    dismissButtonText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    applyAllButton: {
      marginTop: 12,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: colors.primary + '20',
    },
    applyAllButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
  });
