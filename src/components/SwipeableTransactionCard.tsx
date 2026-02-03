import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Transaction } from '../database/schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { format } from 'date-fns';
import { getTransactionIcon } from '../utils/icons';
import CompanyLogo from './CompanyLogo';
import { formatCurrencySync } from '../utils/currency';
import { getSettings } from '../services/settingsService';

interface SwipeableTransactionCardProps {
  transaction: Transaction;
  currencyCode: string;
  onPress: () => void;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onDelete?: () => void;
  onUncategorize?: () => void;
  showTagBadges?: boolean;
  swipeDirection?: 'right-income-left-expense' | 'right-expense-left-income';
}

export default function SwipeableTransactionCard({
  transaction,
  currencyCode,
  onPress,
  onSwipeRight,
  onSwipeLeft,
  onDelete,
  onUncategorize,
  showTagBadges = false,
  swipeDirection: swipeDirectionProp,
}: SwipeableTransactionCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const [internalSwipeDirection, setInternalSwipeDirection] = useState<
    'right-income-left-expense' | 'right-expense-left-income'
  >('right-income-left-expense');
  
  useEffect(() => {
    const loadSwipeDirection = async () => {
      try {
        const settings = await getSettings();
        setInternalSwipeDirection(settings.swipeDirection);
      } catch (error) {
        console.error('Error loading swipe direction:', error);
      }
    };
    if (!swipeDirectionProp) {
      loadSwipeDirection();
    }
  }, [swipeDirectionProp]);
  
  const iconInfo = getTransactionIcon(transaction.category, transaction.description);
  
  // Extract company name from description
  let companyName: string | null = null;
  if (transaction.category === 'Subscription') {
    companyName = transaction.description || null;
  } else if (transaction.description) {
    const cleanDesc = transaction.description.replace(/^Subscription:\s*/i, '');
    companyName = cleanDesc.split(/[,\s-]/)[0].trim();
  }
  
  // Determine what right and left actions should show based on preference
  const effectiveSwipeDirection = swipeDirectionProp ?? internalSwipeDirection;
  const rightActionType = effectiveSwipeDirection === 'right-income-left-expense' ? 'income' : 'expense';
  const leftActionType = effectiveSwipeDirection === 'right-income-left-expense' ? 'expense' : 'income';
  
  // Render right action
  const renderRightAction = (progress: Animated.AnimatedInterpolation<number>) => {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    });
    
    return (
      <Animated.View style={[styles.rightAction, { transform: [{ scale }] }]}>
        <View style={styles.actionContent}>
          <Ionicons 
            name={rightActionType === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'} 
            size={32} 
            color={colors.background} 
          />
          <Text style={styles.actionText}>
            {rightActionType === 'income' ? 'Income' : 'Expense'}
          </Text>
        </View>
      </Animated.View>
    );
  };
  
  // Render left action
  const renderLeftAction = (progress: Animated.AnimatedInterpolation<number>) => {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    });
    
    return (
      <Animated.View style={[styles.leftAction, { transform: [{ scale }] }]}>
        <View style={styles.actionContent}>
          <Ionicons 
            name={leftActionType === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'} 
            size={32} 
            color={colors.background} 
          />
          <Text style={styles.actionText}>
            {leftActionType === 'income' ? 'Income' : 'Expense'}
          </Text>
        </View>
      </Animated.View>
    );
  };
  
  const handleSwipeRight = () => {
    swipeableRef.current?.close();
    onSwipeRight?.();
  };
  
  const handleSwipeLeft = () => {
    swipeableRef.current?.close();
    onSwipeLeft?.();
  };
  
  return (
    <GestureHandlerRootView>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={onSwipeRight ? renderRightAction : undefined}
        renderLeftActions={onSwipeLeft ? renderLeftAction : undefined}
        onSwipeableRightOpen={handleSwipeRight}
        onSwipeableLeftOpen={handleSwipeLeft}
        rightThreshold={100}
        leftThreshold={100}
        friction={2}
      >
        <TouchableOpacity 
          style={styles.transactionCard}
          activeOpacity={0.7}
          onPress={onPress}
        >
          <View style={styles.transactionLeft}>
            {companyName && companyName.length > 2 ? (
              <CompanyLogo
                name={companyName}
                type="transaction"
                category={transaction.category}
                description={transaction.description}
                logoUrl={transaction.merchantLogoUrl}
                size={56}
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
              <Text style={styles.transactionTitle} numberOfLines={1}>
                {transaction.description || format(new Date(transaction.date), 'MMM dd, yyyy') || 'Transaction'}
              </Text>
              <View style={styles.categoryRow}>
                <Text style={styles.transactionCategory}>{transaction.category}</Text>
                {showTagBadges && (
                  <View style={styles.tagBadges}>
                    {transaction.subscriptionId && (
                      <View style={styles.tagBadge}>
                        <Ionicons name="repeat" size={12} color={colors.primary} />
                        <Text style={styles.tagBadgeText}>Sub</Text>
                      </View>
                    )}
                    {transaction.debtId && (
                      <View style={styles.tagBadge}>
                        <Ionicons name="card" size={12} color={colors.textSecondary} />
                        <Text style={styles.tagBadgeText}>Debt</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              <Text style={styles.transactionDate}>
                {format(new Date(transaction.date), 'MMM dd, yyyy • h:mm a')}
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
            <View style={styles.actionButtons}>
              {onUncategorize && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    console.log('[SwipeableTransactionCard] Uncategorize button pressed for transaction:', transaction.id);
                    onUncategorize();
                  }}
                  style={styles.uncategorizeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity
                  onPress={onDelete}
                  style={styles.deleteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  transactionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  incomeIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  expenseIconBg: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
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
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  transactionCategory: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tagBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.textLight,
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  incomeAmount: {
    color: colors.primary,
  },
  expenseAmount: {
    color: colors.text,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  uncategorizeButton: {
    padding: 8,
    borderRadius: 8,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
  },
  rightAction: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    borderRadius: 20,
    marginBottom: 0,
  },
  leftAction: {
    flex: 1,
    backgroundColor: colors.text,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    borderRadius: 20,
    marginBottom: 0,
  },
  actionContent: {
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
});

