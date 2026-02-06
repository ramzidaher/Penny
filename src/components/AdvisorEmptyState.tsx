import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';

interface AdvisorEmptyStateProps {
  title?: string;
}

export default function AdvisorEmptyState({ title = 'Ask me anything about your finances' }: AdvisorEmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={64} color={colors.textLight} />
      <Text style={styles.emptyText}>{title}</Text>
    </View>
  );
}

const createStyles = (colors: { textLight: string }) =>
  StyleSheet.create({
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

