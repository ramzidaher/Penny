import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';

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
  const { colors } = useTheme();
  const c = colors;
  const styles = React.useMemo(() => createStyles(c), [c]);

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
            <Ionicons name={a.icon} size={16} color={c.primary} />
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

const createStyles = (c: {
  surface: string;
  border: string;
  primary: string;
  text: string;
  textSecondary: string;
}) =>
  StyleSheet.create({
    grid: {
      paddingHorizontal: 20,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    card: {
      width: '48%',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 10,
      minHeight: 0,
    },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.primary + '10',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
    },
    title: {
      ...typography.body,
      color: c.text,
      fontWeight: '800',
      fontSize: 14,
      marginBottom: 2,
    },
    subtitle: {
      ...typography.bodySmall,
      color: c.textSecondary,
      lineHeight: 16,
      fontSize: 12,
    },
  });

