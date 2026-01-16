import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Modal, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { askAI } from '../services/aiService';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getChatThreads, getChatThread, addChatThread, updateChatThread, deleteChatThread } from '../database/db';
import { ChatThread, ChatMessage } from '../database/schema';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [showThreadsModal, setShowThreadsModal] = useState(false);
  const [showQuickQuestions, setShowQuickQuestions] = useState(true);
  const screenWrapperRef = useRef<ScreenWrapperRef>(null);

  // Load threads on mount - no delay for faster loading
  useEffect(() => {
    loadThreads();
  }, []);

  // Load messages when thread changes
  useEffect(() => {
    if (currentThreadId) {
      loadThread(currentThreadId);
    } else {
      setMessages([]);
      setShowQuickQuestions(true);
    }
  }, [currentThreadId]);

  const loadThreads = async () => {
    try {
      const allThreads = await getChatThreads();
      setThreads(allThreads);
    } catch (error) {
      console.error('Error loading threads:', error);
    }
  };

  const loadThread = async (threadId: string) => {
    try {
      const thread = await getChatThread(threadId);
      if (thread) {
        setMessages(thread.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })));
        setShowQuickQuestions(false);
      }
    } catch (error) {
      console.error('Error loading thread:', error);
    }
  };

  const saveThread = async (threadMessages: Message[], title?: string) => {
    try {
      const threadTitle = title || threadMessages[0]?.content?.slice(0, 50) || 'New Chat';
      const now = new Date().toISOString();
      
      const chatMessages: ChatMessage[] = threadMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: now,
      }));

      if (currentThreadId) {
        // Update existing thread
        await updateChatThread(currentThreadId, {
          messages: chatMessages,
          title: threadTitle,
        });
      } else {
        // Create new thread
        const newThreadId = await addChatThread({
          title: threadTitle,
          messages: chatMessages,
        });
        setCurrentThreadId(newThreadId);
        await loadThreads();
      }
    } catch (error) {
      console.error('Error saving thread:', error);
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return;

    const userQuestion = question.trim();
    setQuestion('');
    setLoading(true);
    setShowQuickQuestions(false);
    
    // Add user message to conversation
    const userMessage: Message = { role: 'user', content: userQuestion };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    try {
      const answer = await askAI(userQuestion, updatedMessages);
      const assistantMessage: Message = { role: 'assistant', content: answer };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      
      // Save thread after getting response
      await saveThread(finalMessages);
    } catch (error) {
      const errorMessage: Message = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      await saveThread(finalMessages);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = async (quickQuestion: string) => {
    setQuestion('');
    setLoading(true);
    setShowQuickQuestions(false);
    
    // Add user message to conversation
    const userMessage: Message = { role: 'user', content: quickQuestion };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    try {
      const answer = await askAI(quickQuestion, updatedMessages);
      const assistantMessage: Message = { role: 'assistant', content: answer };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      
      // Save thread after getting response
      await saveThread(finalMessages);
    } catch (error) {
      const errorMessage: Message = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      await saveThread(finalMessages);
    } finally {
      setLoading(false);
    }
  };

  const handleNewThread = () => {
    setCurrentThreadId(null);
    setMessages([]);
    setShowQuickQuestions(true);
    setShowThreadsModal(false);
  };

  const handleSelectThread = (threadId: string) => {
    setCurrentThreadId(threadId);
    setShowThreadsModal(false);
  };

  const handleDeleteThread = async (threadId: string) => {
    Alert.alert(
      'Delete Thread',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChatThread(threadId);
              if (currentThreadId === threadId) {
                setCurrentThreadId(null);
                setMessages([]);
                setShowQuickQuestions(true);
              }
              await loadThreads();
            } catch (error) {
              console.error('Error deleting thread:', error);
              Alert.alert('Error', 'Failed to delete thread');
            }
          },
        },
      ]
    );
  };

  const quickQuestions = [
    'How am I doing financially?',
    'What are my biggest expenses?',
    'Can I afford a $500 purchase?',
    'How much can I spend this month?',
  ];

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
      return <Text style={styles.messageText}>{text}</Text>;
    }

    return (
      <Text style={styles.messageText}>
        {parts.map((part, index) => (
          <Text
            key={index}
            style={part.bold ? styles.messageTextBold : undefined}
          >
            {part.text}
          </Text>
        ))}
      </Text>
    );
  };

  useEffect(() => {
    if (messages.length > 0) {
      screenWrapperRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const currentThread = threads.find(t => t.id === currentThreadId);

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
          subtitle={currentThread?.title || "Ask me anything about your finances"}
          titleFontFamily="GulfsDisplay-Normal"
          titleLetterSpacing={0.5}
          rightAction={{
            icon: 'chatbubbles',
            onPress: () => setShowThreadsModal(true),
          }}
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
                {message.role === 'assistant' ? renderTextWithBold(message.content) : <Text style={styles.messageText}>{message.content}</Text>}
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

        {showQuickQuestions && messages.length === 0 && (
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
        )}
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

      {/* Threads Modal */}
      <Modal
        visible={showThreadsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowThreadsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conversations</Text>
              <TouchableOpacity
                onPress={() => setShowThreadsModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.threadsList}>
              <TouchableOpacity
                style={[styles.threadItem, !currentThreadId && styles.threadItemActive]}
                onPress={handleNewThread}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle" size={22} color={colors.primary} />
                <Text style={styles.threadItemText}>New Conversation</Text>
              </TouchableOpacity>
              
              {threads.map((thread) => (
                <View key={thread.id} style={styles.threadItemContainer}>
                  <TouchableOpacity
                    style={[styles.threadItem, currentThreadId === thread.id && styles.threadItemActive]}
                    onPress={() => handleSelectThread(thread.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons 
                      name="chatbubble" 
                      size={22} 
                      color={currentThreadId === thread.id ? colors.primary : colors.text} 
                    />
                    <Text style={styles.threadItemText} numberOfLines={1}>
                      {thread.title}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteThreadButton}
                    onPress={() => handleDeleteThread(thread.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textLight} />
                  </TouchableOpacity>
                </View>
              ))}
              
              {threads.length === 0 && (
                <Text style={styles.emptyThreadsText}>No conversations yet</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  messageTextBold: {
    fontWeight: '700',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  threadsList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  threadItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    minHeight: 52,
  },
  threadItemActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary + '50',
    borderWidth: 1.5,
  },
  threadItemText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  deleteThreadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyThreadsText: {
    ...typography.body,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
