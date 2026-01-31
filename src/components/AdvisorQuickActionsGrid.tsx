import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface AdvisorQuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  prompt: string;
}

interface AdvisorQuickActionsGridProps {
  actions: AdvisorQuickAction[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
}

export default function AdvisorQuickActionsGrid({ actions, disabled, onSelect }: AdvisorQuickActionsGridProps) {
  return (
    <View style={styles.grid}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.id}
          style={styles.card}
          activeOpacity={0.85}
          disabled={disabled}
          onPress={() => onSelect(a.prompt)}
        >
          <View style={styles.iconCircle}>
            <Ionicons name={a.icon} size={18} color={colors.primary} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {a.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {a.subtitle}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    minHeight: 112,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});

