import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View, useColorScheme } from 'react-native';
import { typography } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';

interface AdvisorPromptChipsRowProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
}

export default function AdvisorPromptChipsRow({ prompts, disabled, onSelect }: AdvisorPromptChipsRowProps) {
  if (!prompts.length) return null;
  const { colors } = useTheme();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? colors.dark : colors;
  const styles = React.useMemo(() => createStyles(c), [c]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {prompts.map((p) => (
        <TouchableOpacity
          key={p}
          style={styles.chip}
          onPress={() => onSelect(p)}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {p}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={styles.trailingSpacer} />
    </ScrollView>
  );
}

const createStyles = (c: { surface: string; border: string; text: string }) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 4,
      gap: 10,
      alignItems: 'center',
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      maxWidth: 260,
    },
    chipText: {
      ...typography.bodySmall,
      color: c.text,
      fontWeight: '600',
    },
    trailingSpacer: {
      width: 10,
    },
  });

