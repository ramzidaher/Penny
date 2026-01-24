import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { askAI } from '../services/aiService';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Account, Transaction, Budget, Subscription } from '../database/schema';
import { filterTransactionsByPeriod, FilterPeriod } from '../utils/transactionFilters';

interface AIInsightCardProps {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  filterPeriod: FilterPeriod;
  currencyCode: string;
}

const insightTopics = [
  'How am I doing financially this period? Give me a brief overview.',
  'What is my savings rate this period? Am I saving enough?',
  'Are there any concerning spending patterns I should be aware of?',
  'How healthy are my budgets? Am I staying within limits?',
  'What percentage of my income goes to subscriptions? Is it reasonable?',
  'What is my biggest expense category this period?',
  'Am I spending more or less than usual? What does this mean?',
  'What financial habit should I focus on improving?',
];

export default function AIInsightCard({
  accounts,
  transactions,
  budgets,
  subscriptions,
  filterPeriod,
  currencyCode,
}: AIInsightCardProps) {
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const topicIndexRef = useRef<number>(0);

  useEffect(() => {
    // Intentionally do NOT auto-generate insights.
    // Auto-calling the AI endpoint causes noisy "Network Error" logs (and unnecessary cost)
    // during app startup / bank OAuth / background transitions.
    setInsight('');
    setError(false);
    setLoading(false);
  }, [accounts, transactions, budgets, subscriptions, filterPeriod]);

  const generateInsight = async () => {
    try {
      if (loading) return; // prevent double-taps
      setLoading(true);
      setError(false);
      
      // Rotate through topics - use a combination of time and data to determine index
      const dataHash = accounts.length + transactions.length + budgets.length + subscriptions.length;
      const timeBased = Math.floor(Date.now() / (1000 * 60)); // Changes every minute
      const topicIndex = (dataHash + timeBased) % insightTopics.length;
      topicIndexRef.current = topicIndex;
      
      const question = insightTopics[topicIndex];
      const response = await askAI(question, [], filterPeriod);
      
      // Limit insight length for compact display
      const maxLength = 150;
      const truncatedInsight = response.length > maxLength 
        ? response.substring(0, maxLength).trim() + '...'
        : response;
      
      setInsight(truncatedInsight);
    } catch (err) {
      // Avoid noisy red-screen style logs for expected network/API failures.
      setError(true);
      setInsight('Unable to generate insight at this time.');
    } finally {
      setLoading(false);
    }
  };

  // Function to render text with markdown bold (**text**)
  const renderTextWithBold = (text: string) => {
    const parts: Array<{ text: string; bold: boolean }> = [];
    let currentIndex = 0;
    const regex = /\*\*(.*?)\*\*/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the bold
      if (match.index > currentIndex) {
        parts.push({
          text: text.substring(currentIndex, match.index),
          bold: false,
        });
      }
      // Add bold text
      parts.push({
        text: match[1],
        bold: true,
      });
      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push({
        text: text.substring(currentIndex),
        bold: false,
      });
    }

    // If no bold markers found, return original text
    if (parts.length === 0) {
      return (
        <Text style={styles.insightText} numberOfLines={3}>
          {text}
        </Text>
      );
    }

    return (
      <Text style={styles.insightText} numberOfLines={3}>
        {parts.map((part, index) => (
          <Text
            key={index}
            style={part.bold ? styles.insightTextBold : undefined}
          >
            {part.text}
          </Text>
        ))}
      </Text>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={styles.title}>AI Insight</Text>
        </View>
        <View style={styles.content}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={generateInsight}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
        </View>
        <Text style={styles.title}>AI Insight</Text>
        <TouchableOpacity 
          onPress={(e) => {
            e.stopPropagation();
            generateInsight();
          }}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {insight ? renderTextWithBold(insight) : (
          <Text style={styles.insightText} numberOfLines={3}>
            Tap to generate an insight
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  refreshButton: {
    padding: 4,
  },
  content: {
    minHeight: 48,
    justifyContent: 'center',
  },
  insightText: {
    ...typography.bodySmall,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  insightTextBold: {
    fontWeight: '700',
  },
});

