import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, Platform, Animated, Dimensions, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Transaction } from '../database/schema';
import { getTransactions, addBudget } from '../database/db';
import { startOfMonth, endOfMonth } from 'date-fns';
import { formatCurrencySync } from '../utils/currency';
import { getSettings } from '../services/settingsService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const periods = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

interface BudgetCreationDialogProps {
  visible: boolean;
  transaction: Transaction | null;
  category: string;
  onClose: () => void;
  onComplete: (budgetId?: string) => void;
}

export default function BudgetCreationDialog({
  visible,
  transaction,
  category,
  onClose,
  onComplete,
}: BudgetCreationDialogProps) {
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [suggestedLimit, setSuggestedLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      loadCurrency();
      if (category) {
        calculateSuggestedLimit();
      }
      // Animate in - scale and fade
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, category, transaction]);

  const loadCurrency = async () => {
    try {
      const settings = await getSettings();
      setCurrencyCode(settings.defaultCurrency);
    } catch (error) {
      console.error('Error loading currency:', error);
    }
  };

  const calculateSuggestedLimit = async () => {
    try {
      const allTransactions = await getTransactions();
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now);
      const endOfCurrentMonth = endOfMonth(now);

      // Calculate current month's spending in this category
      const monthlySpending = allTransactions
        .filter(t => {
          const date = new Date(t.date);
          return (
            t.category === category &&
            t.type === 'expense' &&
            date >= startOfCurrentMonth &&
            date <= endOfCurrentMonth
          );
        })
        .reduce((sum, t) => sum + t.amount, 0);

      // Suggest 20% more than current spending, or transaction amount * 4 if no history
      if (monthlySpending > 0) {
        setSuggestedLimit(monthlySpending * 1.2);
        setLimit((monthlySpending * 1.2).toFixed(2));
      } else if (transaction) {
        // If no history, suggest 4x the transaction amount for monthly
        const suggested = transaction.amount * 4;
        setSuggestedLimit(suggested);
        setLimit(suggested.toFixed(2));
      }
    } catch (error) {
      console.error('Error calculating suggested limit:', error);
    }
  };

  const handleCreate = async () => {
    if (!category || !category.trim()) {
      console.warn('[BudgetCreationDialog] Cannot create budget without category');
      return;
    }

    // Clean limit input (remove currency symbols, commas, etc.)
    const cleanLimit = limit.replace(/[^0-9.]/g, '');
    const limitNum = parseFloat(cleanLimit);
    if (isNaN(limitNum) || limitNum <= 0) {
      return;
    }

    setLoading(true);
    try {
      const budgetId = await addBudget({
        category,
        limit: limitNum,
        period,
      });

      // Don't update transaction here - let the parent handle it through proceedWithCategoryUpdate
      // This ensures the budget exists before the transaction is updated, and the amount
      // will be properly added to the budget's currentSpent in cloudUpdateTransaction

      onComplete(budgetId);
    } catch (error) {
      console.error('Error creating budget:', error);
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const handleSkip = () => {
    // Don't update transaction here - let the parent handle it
    // This allows the parent to properly update the transaction with all necessary fields
    onComplete();
    handleClose();
  };

  const handleUseSuggestion = () => {
    if (suggestedLimit !== null) {
      setLimit(suggestedLimit.toFixed(2));
    }
  };

  const handleClose = () => {
    setLimit('');
    setPeriod('monthly');
    setSuggestedLimit(null);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: opacityAnim,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>
        
        <View style={styles.centerContainer}>
          <Animated.View
            style={[
              styles.container,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{category}</Text>
                </View>
              )}
              <Text style={styles.title}>Create Budget</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {suggestedLimit !== null && (
              <TouchableOpacity 
                style={styles.suggestionCard} 
                onPress={handleUseSuggestion}
                activeOpacity={0.7}
              >
                <Ionicons name="bulb" size={18} color={colors.primary} />
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionLabel}>Suggested</Text>
                  <Text style={styles.suggestionAmount}>
                    {formatCurrencySync(suggestedLimit, currencyCode)}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            <View style={styles.inputRow}>
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>
                  {currencyCode === 'USD' ? '$' : currencyCode}
                </Text>
                <TextInput
                  style={styles.input}
                  value={limit}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/[^0-9.]/g, '');
                    const parts = cleaned.split('.');
                    if (parts.length > 2) {
                      setLimit(parts[0] + '.' + parts.slice(1).join(''));
                    } else {
                      setLimit(cleaned);
                    }
                  }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textLight}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={styles.periodContainer}>
                {periods.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.periodButton,
                      period === p.value && styles.periodButtonActive,
                    ]}
                    onPress={() => setPeriod(p.value as 'weekly' | 'monthly' | 'yearly')}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.periodButtonText,
                      period === p.value && styles.periodButtonTextActive,
                    ]}>
                      {p.label.charAt(0)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.skipButton} 
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.skipButtonText}>Skip for Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, loading && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.createButtonText}>Creating...</Text>
                </View>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                  <Text style={styles.createButtonText}>Create Budget</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  centerContainer: {
    width: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.background,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  categoryBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    color: colors.background,
    fontWeight: '600',
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
    fontWeight: '500',
  },
  suggestionAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  periodContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  periodButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  periodButtonTextActive: {
    color: colors.background,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  createButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    gap: 6,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createButtonText: {
    fontSize: 15,
    color: colors.background,
    fontWeight: '700',
  },
});

