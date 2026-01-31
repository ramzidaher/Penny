import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdvisorEmptyStateProps {
  title?: string;
}

export default function AdvisorEmptyState({ title = 'Ask me anything about your finances' }: AdvisorEmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={64} color={colors.textLight} />
      <Text style={styles.emptyText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    ...typography.body,
    color: colors.textLight,
    marginTop: 16,
    textAlign: 'center',
  },
});

