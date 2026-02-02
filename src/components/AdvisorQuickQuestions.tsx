import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { typography } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';

interface AdvisorQuickQuestionsProps {
  title?: string;
  questions: string[];
  disabled?: boolean;
  visible?: boolean;
  onSelect: (question: string) => void;
}

export default function AdvisorQuickQuestions({
  title = 'Quick Questions',
  questions,
  disabled,
  visible = true,
  onSelect,
}: AdvisorQuickQuestionsProps) {
  if (!visible) return null;
  const { colors } = useTheme();
  const c = colors;
  const styles = React.useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.quickQuestionsContainer}>
      <Text style={styles.quickQuestionsTitle}>{title}</Text>
      {questions.map((q, index) => (
        <TouchableOpacity
          key={index}
          style={styles.quickQuestionButton}
          onPress={() => onSelect(q)}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={styles.quickQuestionText}>{q}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (c: { surface: string; border: string; text: string }) =>
  StyleSheet.create({
    quickQuestionsContainer: {
      marginTop: 8,
      paddingHorizontal: 20,
    },
    quickQuestionsTitle: {
      ...typography.body,
      color: c.text,
      fontWeight: '600',
      marginBottom: 12,
    },
    quickQuestionButton: {
      backgroundColor: c.surface,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    quickQuestionText: {
      ...typography.bodySmall,
      color: c.text,
    },
  });

