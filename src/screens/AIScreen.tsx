import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { askAI, canAffordPurchase } from '../services/aiService';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const screenWrapperRef = useRef<ScreenWrapperRef>(null);

  const handleAsk = async () => {
    if (!question.trim()) return;

    const userQuestion = question.trim();
    setQuestion('');
    setLoading(true);
    
    // Add user message to conversation
    const userMessage: Message = { role: 'user', content: userQuestion };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    try {
      const answer = await askAI(userQuestion, messages);
      const assistantMessage: Message = { role: 'assistant', content: answer };
      setMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = async (quickQuestion: string) => {
    setQuestion('');
    setLoading(true);
    
    // Add user message to conversation
    const userMessage: Message = { role: 'user', content: quickQuestion };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    try {
      const answer = await askAI(quickQuestion, messages);
      const assistantMessage: Message = { role: 'assistant', content: answer };
      setMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      setMessages([...updatedMessages, errorMessage]);
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
    if (messages.length > 0) {
      screenWrapperRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  return (
    <View style={styles.container}>
      <ScreenWrapper
        ref={screenWrapperRef}
        enableKeyboardAvoiding={true}
        keyboardVerticalOffset={90}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Penny Advisor"
          subtitle="Ask me anything about your finances"
          titleFontFamily="GulfsDisplay-Normal"
          titleLetterSpacing={0.5}
        />

        {messages.length > 0 ? (
          <View style={styles.messagesContainer}>
            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.messageContainer,
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage,
                ]}
              >
                <View style={styles.messageHeader}>
                  <Ionicons
                    name={message.role === 'user' ? 'person' : 'chatbubble'}
                    size={16}
                    color={message.role === 'user' ? colors.primary : colors.text}
                  />
                  <Text style={styles.messageLabel}>
                    {message.role === 'user' ? 'You' : 'Penny'}
                  </Text>
                </View>
                <Text style={styles.messageText}>{message.content}</Text>
              </View>
            ))}
            {loading && (
              <View style={[styles.messageContainer, styles.assistantMessage]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
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
      </ScreenWrapper>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  messagesContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  messageContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userMessage: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary + '40',
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  assistantMessage: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  messageLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  messageText: {
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

