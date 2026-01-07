import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { askAI, canAffordPurchase } from '../services/aiService';
import ScreenHeader from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleAsk = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setResponse('');
    
    try {
      const answer = await askAI(question.trim());
      setResponse(answer);
      setQuestion('');
    } catch (error) {
      setResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = async (quickQuestion: string) => {
    setQuestion(quickQuestion);
    setLoading(true);
    setResponse('');
    
    try {
      const answer = await askAI(quickQuestion);
      setResponse(answer);
    } catch (error) {
      setResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    'How am I doing financially?',
    'What are my biggest expenses?',
    'Can I afford a $500 purchase?',
    'How much can I spend this month?',
  ];

  useEffect(() => {
    if (response) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [response]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="AI Financial Advisor"
          subtitle="Ask me anything about your finances"
        />

        {response ? (
          <View style={styles.responseContainer}>
            <View style={styles.responseHeader}>
              <Ionicons name="chatbubble" size={20} color={colors.text} />
              <Text style={styles.responseLabel}>Response</Text>
            </View>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.textLight} />
            <Text style={styles.emptyText}>Ask me anything about your finances</Text>
          </View>
        )}

        <View style={styles.quickQuestionsContainer}>
          <Text style={styles.quickQuestionsTitle}>Quick Questions</Text>
          {quickQuestions.map((q, index) => (
            <TouchableOpacity
              key={index}
              style={styles.quickQuestionButton}
              onPress={() => handleQuickQuestion(q)}
              disabled={loading}
            >
              <Text style={styles.quickQuestionText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 80 }]}>
        <TextInput
          style={styles.input}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question..."
          placeholderTextColor={colors.textLight}
          multiline
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!question.trim() || loading) && styles.sendButtonDisabled]}
          onPress={handleAsk}
          disabled={!question.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Ionicons name="send" size={20} color={colors.background} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
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
  responseContainer: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  responseLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  responseText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  quickQuestionsContainer: {
    marginTop: 8,
    paddingHorizontal: 20,
  },
  quickQuestionsTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickQuestionButton: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  quickQuestionText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

