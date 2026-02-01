import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { askAI } from '../services/aiService';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import { colors } from '../theme/colors';
import {
  getChatThreads,
  getChatThread,
  addChatThread,
  updateChatThread,
  deleteChatThread,
  getMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  getTransactions,
} from '../database/db';
import { ChatThread, ChatMessage, UserMemory } from '../database/schema';
import AdvisorMessageList, { AdvisorChatMessage } from '../components/AdvisorMessageList';
import AdvisorLanding from '../components/AdvisorLanding';
import AdvisorChatComposer from '../components/AdvisorChatComposer';
import AdvisorThreadsModal from '../components/AdvisorThreadsModal';
import AdvisorProgressStrip from '../components/AdvisorProgressStrip';
import { AdvisorMission } from '../utils/advisorMissions';
import {
  getAdvisorProgress,
  refreshDailyMissionsIfNeeded,
  awardAdvisorXp,
  checkInToday,
  completeMission,
  AdvisorProgress,
} from '../services/advisorProgressService';
import { onTabReselect } from '../utils/tabReselect';
import {
  buildMemoryInput,
  getExpiredMemories,
  getMemoryUpserts,
  inferMemoriesFromMessage,
  inferMemoriesFromTransactions,
} from '../services/memoryService';
import { getSettings } from '../services/settingsService';

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [showThreadsModal, setShowThreadsModal] = useState(false);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [advisorProgress, setAdvisorProgress] = useState<AdvisorProgress | null>(null);
  const [composerFocusRequestId, setComposerFocusRequestId] = useState(0);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [memorySyncing, setMemorySyncing] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [autoMemoryEnabled, setAutoMemoryEnabled] = useState(true);
  const screenWrapperRef = useRef<ScreenWrapperRef>(null);
  const requestGenerationRef = useRef(0);
  const lastAutoPromptRef = useRef<string | null>(null);

  const resetToLanding = useCallback(() => {
    requestGenerationRef.current += 1;
    setShowThreadsModal(false);
    setCurrentThreadId(null);
    setMessages([]);
    setQuestion('');
    setLastFailedQuestion(null);
    setLoading(false);
    setHasStartedChat(false);
    // Ensure we actually return to the Advisor main page when requested.
    router.replace('/(tabs)/ai' as any);
  }, []);

  // If navigated to /(tabs)/ai/chat with a prompt param, auto-send once.
  useEffect(() => {
    const p = typeof params.prompt === 'string' ? params.prompt : '';
    if (!p) return;
    if (lastAutoPromptRef.current === p) return;
    lastAutoPromptRef.current = p;
    // Fire and forget; sendQuestion manages UI state.
    sendQuestion(p, { clearComposer: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prompt]);

  // Load threads on mount - no delay for faster loading
  useEffect(() => {
    loadThreads();
  }, []);

  // Load AI memory settings on mount
  useEffect(() => {
    loadMemorySettings();
  }, []);

  // Load progress on mount
  useEffect(() => {
    (async () => {
      try {
        const p = await getAdvisorProgress();
        const refreshed = await refreshDailyMissionsIfNeeded();
        setAdvisorProgress(refreshed || p);
      } catch {
        // If Firebase isn't ready yet, we'll just skip progress for now.
      }
    })();
  }, []);

  // Load messages when thread changes
  useEffect(() => {
    if (currentThreadId) {
      setHasStartedChat(true);
      loadThread(currentThreadId);
    } else {
      setMessages([]);
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
      }
    } catch (error) {
      console.error('Error loading thread:', error);
    }
  };

  const loadMemorySettings = async () => {
    try {
      const settings = await getSettings();
      const enabled = settings.enableAiMemory ?? true;
      const autoEnabled = settings.enableAutoMemories ?? true;
      setMemoryEnabled(enabled);
      setAutoMemoryEnabled(autoEnabled);
      if (enabled) {
        await loadMemories(enabled);
      } else {
        setMemories([]);
      }
    } catch (error) {
      console.error('Error loading memory settings:', error);
    }
  };

  const loadMemories = async (enabled: boolean = memoryEnabled) => {
    if (!enabled) return;
    try {
      const stored = await getMemories();
      setMemories(stored);
      await cleanupExpiredMemories(stored);
      if (autoMemoryEnabled) {
        await syncPatternMemories(stored);
      }
    } catch (error) {
      console.error('Error loading memories:', error);
    }
  };

  const cleanupExpiredMemories = async (stored: UserMemory[]) => {
    const expired = getExpiredMemories(stored);
    if (expired.length === 0) return;
    try {
      await Promise.all(expired.map((memory) => deleteMemory(memory.id)));
      setMemories((prev) => prev.filter((m) => !expired.find((e) => e.id === m.id)));
    } catch (error) {
      console.warn('Failed to remove expired memories:', error);
    }
  };

  const syncPatternMemories = async (stored: UserMemory[]) => {
    if (!autoMemoryEnabled) return;
    if (memorySyncing) return;
    setMemorySyncing(true);
    try {
      const transactions = await getTransactions();
      const candidates = inferMemoriesFromTransactions(transactions);
      await applyMemoryCandidates(candidates, stored);
    } catch (error) {
      console.warn('Error inferring memory patterns:', error);
    } finally {
      setMemorySyncing(false);
    }
  };

  const applyMemoryCandidates = async (
    candidates: ReturnType<typeof inferMemoriesFromMessage>,
    baseMemories: UserMemory[] = memories
  ) => {
    if (!memoryEnabled || !autoMemoryEnabled) return { created: [] as UserMemory[] };
    if (candidates.length === 0) return { created: [] as UserMemory[] };
    const { toCreate, toUpdate } = getMemoryUpserts(baseMemories, candidates);
    if (toCreate.length === 0 && toUpdate.length === 0) return { created: [] as UserMemory[] };

    const now = new Date().toISOString();
    const created: UserMemory[] = [];

    for (const candidate of toCreate) {
      try {
        const input = buildMemoryInput(candidate);
        const id = await addMemory(input);
        created.push({
          id,
          ...input,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        console.warn('Failed to add memory:', error);
      }
    }

    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map(({ id, updates }) =>
          updateMemory(id, {
            ...updates,
            updatedAt: now,
          })
        )
      );
    }

    if (created.length > 0 || toUpdate.length > 0) {
      setMemories((prev) => {
        const next = prev.map((memory) => {
          const update = toUpdate.find((u) => u.id === memory.id);
          if (!update) return memory;
          return { ...memory, ...update.updates, updatedAt: now };
        });
        return [...created, ...next];
      });
    }

    return { created };
  };


  const saveThread = async (threadMessages: AdvisorChatMessage[], title?: string) => {
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

  const isErrorAnswer = (text: string) =>
    text.startsWith('Error:') || text.includes('API key not configured');

  const sendQuestion = async (text: string, opts?: { clearComposer?: boolean; isRetry?: boolean }) => {
    const generationAtStart = requestGenerationRef.current;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (opts?.clearComposer) setQuestion('');
    // Immediately switch to chat view to avoid a confusing “greyed out landing” intermediate step.
    setHasStartedChat(true);
    setLoading(true);

    // IMPORTANT: `askAI()` already appends the current question to the prompt.
    // So conversationHistory must NOT include this question, otherwise the model sees it twice.
    const baseHistory = (() => {
      if (opts?.isRetry && messages.length > 0) {
        const last = messages[messages.length - 1];
        if (last.role === 'assistant' && isErrorAnswer(last.content)) {
          return messages.slice(0, -1);
        }
      }
      return messages;
    })();

    const userMessage: AdvisorChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...baseHistory, userMessage];
    setMessages(updatedMessages);
    // If we're starting from the landing screen, force the chat to start at the top.
    if (baseHistory.length === 0) {
      requestAnimationFrame(() => {
        screenWrapperRef.current?.scrollTo({ y: 0, animated: false });
      });
    }

    try {
      let memoryContext: UserMemory[] = memoryEnabled ? memories : [];
      if (memoryEnabled && autoMemoryEnabled) {
        const memoryCandidates = inferMemoriesFromMessage(trimmed);
        const { created } = await applyMemoryCandidates(memoryCandidates);
        if (created.length > 0) {
          memoryContext = [...memories, ...created];
        }
      }
      const answer = await askAI(trimmed, baseHistory, 'month', memoryContext);
      if (generationAtStart !== requestGenerationRef.current) return;
      const assistantMessage: AdvisorChatMessage = { role: 'assistant', content: answer };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveThread(finalMessages);
      if (generationAtStart !== requestGenerationRef.current) return;

      if (isErrorAnswer(answer)) {
        setLastFailedQuestion(trimmed);
      } else {
        setLastFailedQuestion(null);
        // Small engagement reward for successful questions (avoid rewarding retries).
        if (!opts?.isRetry) {
          try {
            const p = await awardAdvisorXp(5);
            setAdvisorProgress(p);
          } catch {
            // ignore
          }
        }
      }
    } catch (error) {
      if (generationAtStart !== requestGenerationRef.current) return;
      const errorMessage: AdvisorChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      await saveThread(finalMessages);
      setLastFailedQuestion(trimmed);
    } finally {
      if (generationAtStart === requestGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const handleAsk = async () => {
    await sendQuestion(question, { clearComposer: true });
  };

  const handleQuickQuestion = async (quickQuestion: string) => {
    await sendQuestion(quickQuestion, { clearComposer: true });
  };

  const handleNewThread = () => {
    resetToLanding();
  };


  const handleSelectThread = (threadId: string) => {
    setHasStartedChat(true);
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
                resetToLanding();
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

  const quickActions = [
    {
      id: 'daily_checkin',
      title: 'Daily check-in',
      subtitle: 'Quick snapshot + next steps',
      icon: 'sparkles' as const,
      prompt:
        'Give me a quick daily check-in on my finances based on my recent activity. Include 3 actionable next steps.',
    },
    {
      id: 'spending_audit',
      title: 'Spending audit',
      subtitle: 'Find the biggest leaks',
      icon: 'trending-down' as const,
      prompt:
        'Audit my spending. What are my biggest expense categories and what’s one specific change I can make this week to reduce spending?',
    },
    {
      id: 'budget_health',
      title: 'Budget health',
      subtitle: 'What’s at risk right now?',
      icon: 'speedometer' as const,
      prompt:
        'Review my budget health. Flag any categories that are over 80% and give me a clear plan to stay on track.',
    },
    {
      id: 'subscriptions',
      title: 'Subscriptions',
      subtitle: 'Trim recurring costs',
      icon: 'repeat' as const,
      prompt:
        'Review my subscriptions. Tell me which ones look high relative to my income and suggest what to cancel or downgrade.',
    },
  ];

  const promptForMission = (mission: AdvisorMission): string => {
    switch (mission.kind) {
      case 'daily_checkin':
        return 'Give me a quick daily check-in on my finances. Summarize where I stand and give me 3 next steps.';
      case 'budget_guardrail':
        return 'Help me with my budget guardrails. Which categories are at risk and what’s the best plan for the rest of this period?';
      case 'subscription_trim':
        return 'Help me trim subscriptions. Which ones should I cancel/downgrade and why?';
      case 'top_spend_review':
        return 'Review my top spending category and suggest 3 concrete ways to reduce it this week.';
      case 'log_transactions':
      default:
        return 'What missing info would make my finances more accurate, and what should I log next?';
    }
  };

  const handleStartCheckIn = async () => {
    try {
      const p1 = await checkInToday();
      let pNext = p1;
      const today = new Date().toISOString().slice(0, 10);
      const checkinMission = p1.missions.find(m => m.kind === 'daily_checkin' && m.expiresOn === today && !m.completedAt);
      if (checkinMission) {
        pNext = await completeMission(checkinMission.id);
      }
      setAdvisorProgress(pNext);
    } catch {
      // ignore
    }

    await sendQuestion(
      'Give me a quick daily check-in on my finances. Summarize where I stand, and give me 3 next steps.',
      { clearComposer: true }
    );
  };

  const handleCompleteMission = async (mission: AdvisorMission) => {
    try {
      const p = await completeMission(mission.id);
      setAdvisorProgress(p);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (messages.length === 0) return;
    const isFirstExchange = messages.length <= 2 && messages[0]?.role === 'user';

    // For the first interaction (landing → chat), start from the top so the response
    // doesn't look “cut off” and users see the beginning of the answer.
    if (isFirstExchange) {
      requestAnimationFrame(() => {
        screenWrapperRef.current?.scrollTo({ y: 0, animated: false });
      });
      return;
    }

    // After the first exchange, behave like a normal chat: keep the newest content visible.
    if (loading || messages[messages.length - 1]?.role === 'assistant') {
      requestAnimationFrame(() => {
        screenWrapperRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages, loading]);

  const currentThread = threads.find(t => t.id === currentThreadId);
  const showChatUI = hasStartedChat || !!currentThreadId || messages.length > 0;

  // On iOS, `NativeTabs` can overlay content (tab bar is “floating/glass”).
  // Safe-area bottom inset does NOT account for the tab bar height, so we add an offset.
  const tabBarOverlayOffset =
    Platform.OS === 'ios' ? 58 : Platform.OS === 'android' ? 72 : Platform.OS === 'web' ? 70 : 0;

  // Reset to landing on tab reselect:
  // - iOS NativeTabs: React Navigation emits `tabPress`. We only reset when already focused (reselect).
  // - Android/Web custom tab bar: `emitTabReselect('ai')` triggers this.
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    if (navigation?.addListener && navigation?.isFocused) {
      const unsubTabPress = navigation.addListener('tabPress', () => {
        if (navigation.isFocused()) {
          resetToLanding();
        }
      });
      if (typeof unsubTabPress === 'function') {
        unsubs.push(unsubTabPress);
      }
    }

    unsubs.push(onTabReselect('ai', resetToLanding));

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [navigation, resetToLanding]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.container}>
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

        <View style={styles.scrollArea}>
          <ScreenWrapper
            ref={screenWrapperRef}
            enableKeyboardAvoiding={false}
            contentContainerStyle={{
              ...styles.scrollContent,
              // Reserve space for the fixed composer + tab bar overlay.
              paddingBottom: insets.bottom + tabBarOverlayOffset + 260,
            }}
            showsVerticalScrollIndicator={false}
          >
        {!!advisorProgress && showChatUI && (
          <AdvisorProgressStrip
            xp={advisorProgress.xp}
            level={advisorProgress.level}
            streakCount={advisorProgress.streakCount}
            compact
          />
        )}

        {showChatUI ? (
          <AdvisorMessageList
            messages={messages}
            loading={loading}
            onRetryLastError={
              lastFailedQuestion
                ? () => sendQuestion(lastFailedQuestion, { isRetry: true })
                : undefined
            }
          />
        ) : (
          <AdvisorLanding
            disabled={loading}
            onAsk={(prompt) => sendQuestion(prompt, { clearComposer: true })}
            onStartCheckIn={handleStartCheckIn}
            onFocusSearch={() => setComposerFocusRequestId((v) => v + 1)}
            quickActions={quickActions}
            promptChips={quickQuestions}
            progress={
              advisorProgress
                ? { xp: advisorProgress.xp, level: advisorProgress.level, streakCount: advisorProgress.streakCount }
                : null
            }
            missions={advisorProgress?.missions?.slice(0, 3) || []}
            onAskForMission={(m) => sendQuestion(promptForMission(m), { clearComposer: true })}
            onCompleteMission={handleCompleteMission}
          />
        )}

        {/* Keep the legacy quick-questions state for now; landing content is shown when messages are empty */}
          </ScreenWrapper>
        </View>

        <View pointerEvents="box-none" style={styles.composerOverlay}>
          <AdvisorChatComposer
            value={question}
            onChangeText={setQuestion}
            onSend={handleAsk}
            onClear={() => setQuestion('')}
            onNewThread={handleNewThread}
            loading={loading}
            bottomInset={insets.bottom}
            tabBarOffset={tabBarOverlayOffset}
            focusRequestId={composerFocusRequestId}
          />
        </View>

        <AdvisorThreadsModal
          visible={showThreadsModal}
          threads={threads}
          currentThreadId={currentThreadId}
          bottomInset={insets.bottom}
          onClose={() => setShowThreadsModal(false)}
          onNewThread={handleNewThread}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  composerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  scrollContent: {
    paddingBottom: 100,
  },
});
