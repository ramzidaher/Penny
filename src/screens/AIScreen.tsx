import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, Keyboard, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { askAI } from '../services/aiService';
import { parseReceiptFromImage, isReceiptParsingConfigured, expandItemsByQuantity } from '../services/receiptParseService';
import { setTransientUIActive } from '../services/transientUIActiveService';
import type { ParsedReceipt } from '../types/receipt';
import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper, { ScreenWrapperRef } from '../components/ScreenWrapper';
import { useTheme } from '../contexts/ThemeContext';
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
import { useAuthAndLock } from '../hooks/useAuthAndLock';
import ReceiptSplitFlow from '../components/ReceiptSplitFlow';
import { TEST_RECEIPT_ITEMS, TEST_RECEIPT_CURRENCY } from '../data/testReceipt';
import { getCurrencySymbol } from '../utils/currency';

export default function AIScreen() {
  const { user } = useAuthAndLock();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string; openThreads?: string; mode?: string }>();
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const screenWrapperRef = useRef<ScreenWrapperRef>(null);
  const requestGenerationRef = useRef(0);
  const lastAutoPromptRef = useRef<string | null>(null);
  const openThreadsHandledRef = useRef(false);
  const receiptSplitInitializedRef = useRef(false);
  const [splitMode, setSplitMode] = useState<'off' | 'active'>('off');
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);
  const [receiptParseLoading, setReceiptParseLoading] = useState(false);

  const receiptSplitIntent = params.mode === 'receipt_split';

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

  // If navigated to /(tabs)/ai/chat with a prompt param, auto-send once (skip when in receipt-split mode).
  useEffect(() => {
    if (params.mode === 'receipt_split') return;
    const p = typeof params.prompt === 'string' ? params.prompt : '';
    if (!p) return;
    if (lastAutoPromptRef.current === p) return;
    lastAutoPromptRef.current = p;
    // Fire and forget; sendQuestion manages UI state.
    sendQuestion(p, { clearComposer: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prompt, params.mode]);

  // When navigated with mode=receipt_split, show chat with upload prompt (no askAI call).
  useEffect(() => {
    if (!receiptSplitIntent || receiptSplitInitializedRef.current) return;
    receiptSplitInitializedRef.current = true;
    setHasStartedChat(true);
    setMessages([
      {
        role: 'assistant',
        content: "I heard you're splitting the bill hopefully you aren't splitting with a girl! But fine, show me the receipt.",
      },
    ]);
  }, [receiptSplitIntent]);

  // Load threads only when user is logged in (avoids Firebase errors after sign out)
  useEffect(() => {
    if (!user) {
      setThreads([]);
      return;
    }
    loadThreads();
  }, [user]);

  // When navigated from main advisor with openThreads=1, open the conversations modal.
  useEffect(() => {
    if (params.openThreads === '1' && !openThreadsHandledRef.current) {
      openThreadsHandledRef.current = true;
      setShowThreadsModal(true);
    }
  }, [params.openThreads]);

  // Load AI memory settings only when user is logged in (avoids Firebase errors after sign out)
  useEffect(() => {
    if (!user) {
      setMemories([]);
      return;
    }
    loadMemorySettings();
  }, [user]);

  // Load progress only when user is logged in
  useEffect(() => {
    if (!user) {
      setAdvisorProgress(null);
      return;
    }
    (async () => {
      try {
        const p = await getAdvisorProgress();
        const refreshed = await refreshDailyMissionsIfNeeded();
        setAdvisorProgress(refreshed || p);
      } catch {
        // If Firebase isn't ready yet, we'll just skip progress for now.
      }
    })();
  }, [user]);

  // Load messages when thread changes (don't clear when in receipt-split intent — that flow sets its own initial message)
  useEffect(() => {
    if (currentThreadId) {
      setHasStartedChat(true);
      loadThread(currentThreadId);
    } else if (!receiptSplitIntent) {
      setMessages([]);
    }
  }, [currentThreadId, receiptSplitIntent]);

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

  const formatReceiptSummary = useCallback((receipt: ParsedReceipt): string => {
    const sym = getCurrencySymbol(receipt.currency);
    const parts: string[] = [];
    if (receipt.merchant) parts.push(`**${receipt.merchant}**`);
    parts.push(`Total: ${sym}${receipt.total.toFixed(2)} (${receipt.currency})`);
    parts.push('');
    receipt.items.forEach((item) => {
      const qty = item.quantity ?? 1;
      const qtyLabel = qty > 1 ? ` x${qty}` : '';
      parts.push(`• ${item.description}${qtyLabel} – ${sym}${item.amount.toFixed(2)}`);
    });
    return parts.join('\n');
  }, []);

  const pickReceiptImage = useCallback(async (useCamera: boolean) => {
    let ImagePicker: typeof import('expo-image-picker');
    try {
      ImagePicker = await import('expo-image-picker');
    } catch (e) {
      console.warn('[AIScreen] expo-image-picker not available:', e);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Photo picker isn't available on this device. Try rebuilding the app (e.g. npx expo run:android)." },
      ]);
      return;
    }
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access', 'Please allow camera access to take a photo of your receipt.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo library access', 'Please allow photo library access to choose a receipt image.');
        return;
      }
    }
    setTransientUIActive(true);
    try {
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8, base64: true });
      if (result.canceled || !result.assets?.[0]) {
        setTransientUIActive(false);
        return;
      }
      const asset = result.assets[0];
      const base64 = asset.base64;
      if (!base64) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "Could not read image. Try another photo." },
        ]);
        setTransientUIActive(false);
        return;
      }
      setReceiptParseLoading(true);
      const mimeType = asset.uri?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      let parsed;
      try {
        parsed = await parseReceiptFromImage(base64, mimeType);
      } catch (parseErr: unknown) {
        const code = (parseErr as { code?: string })?.code;
        if (code === 'RATE_LIMIT') {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: "Too many requests right now. Please wait a minute and try again.",
            },
          ]);
          return;
        }
        throw parseErr;
      }
      if (!parsed) {
        const noKey = !isReceiptParsingConfigured();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: noKey
              ? "Receipt parsing isn't configured. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart the app. You can get a free API key from Google AI Studio (https://aistudio.google.com/app/apikey)."
              : "Could not read the receipt from this image. Try a clearer photo with the full receipt visible.",
          },
        ]);
        return;
      }
      setParsedReceipt(parsed);
      const summary = formatReceiptSummary(parsed);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Here’s what I found:\n\n${summary}\n\nTap **Start splitting** below to split this bill.` },
      ]);
    } catch (err) {
      console.warn('[AIScreen] Receipt upload error:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setReceiptParseLoading(false);
      setTransientUIActive(false);
    }
  }, [formatReceiptSummary]);

  const handleStartSplitting = useCallback(() => {
    setSplitMode('active');
  }, []);

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
    'Where am I trending this month?',
    'What are my biggest expense drivers?',
    'Can I safely spend $500 this month?',
    "What's my remaining spend this month?",
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

  // Production-style keyboard handling: composer above keyboard + list padding + scroll to end.
  const composerReserve = 260; // Space reserved for composer bar (matches layout)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      const height = e.endCoordinates.height;
      setKeyboardHeight(height);
      // Scroll to end when keyboard opens so user sees latest messages above the input (like iMessage/WhatsApp).
      if (showChatUI) {
        const delay = Platform.OS === 'ios' ? 100 : 150;
        setTimeout(() => screenWrapperRef.current?.scrollToEnd({ animated: true }), delay);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [showChatUI]);

  const showSplitFlow = splitMode === 'active';

  return (
    <View style={styles.container}>
        <ScreenHeader
          title={showSplitFlow ? '' : 'Penny Advisor'}
          subtitle={
            showSplitFlow ? undefined : (currentThread?.title || 'Your money plan at a glance')
          }
          size={showSplitFlow ? 'compact' : 'default'}
          titleFontFamily="GulfsDisplay-Normal"
          titleLetterSpacing={0.5}
          rightAction={{
            icon: showSplitFlow ? 'close' : 'chatbubbles',
            onPress: showSplitFlow ? () => setSplitMode('off') : () => setShowThreadsModal(true),
          }}
        />
        <View style={[styles.scrollArea, showSplitFlow && { paddingBottom: insets.bottom + tabBarOverlayOffset }]}>
          {showSplitFlow ? (
            <ReceiptSplitFlow
              items={parsedReceipt ? expandItemsByQuantity(parsedReceipt.items) : TEST_RECEIPT_ITEMS}
              currency={parsedReceipt?.currency ?? TEST_RECEIPT_CURRENCY}
              onClose={() => setSplitMode('off')}
            />
          ) : (
          <ScreenWrapper
            ref={screenWrapperRef}
            enableKeyboardAvoiding={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              ...styles.scrollContent,
              paddingBottom: insets.bottom + tabBarOverlayOffset + composerReserve + keyboardHeight,
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
          <>
            <AdvisorMessageList
              messages={messages}
              loading={loading}
              onRetryLastError={
                lastFailedQuestion
                  ? () => sendQuestion(lastFailedQuestion, { isRetry: true })
                  : undefined
              }
            />
            {receiptSplitIntent && receiptParseLoading && (
              <View style={styles.receiptParseRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.receiptParseText}>Reading receipt…</Text>
              </View>
            )}
            {receiptSplitIntent && !parsedReceipt && !receiptParseLoading && (
              <TouchableOpacity
                style={styles.takePhotoButton}
                onPress={() => pickReceiptImage(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="images-outline" size={18} color={colors.background} />
                <Text style={styles.takePhotoButtonText}>Choose from library</Text>
              </TouchableOpacity>
            )}
            {receiptSplitIntent && parsedReceipt && (
              <TouchableOpacity
                style={styles.startSplittingButton}
                onPress={handleStartSplitting}
                activeOpacity={0.8}
              >
                <Text style={styles.startSplittingButtonText}>Start splitting</Text>
              </TouchableOpacity>
            )}
          </>
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
          </ScreenWrapper>
          )}
        </View>

        {!showSplitFlow && (
        <View pointerEvents="box-none" style={[styles.composerOverlay, { bottom: keyboardHeight }]}>
          {showChatUI && !loading && !receiptSplitIntent && (
            <TouchableOpacity
              style={styles.splitChip}
              onPress={() => setSplitMode('active')}
              activeOpacity={0.8}
            >
              <Text style={styles.splitChipText}>Split receipt</Text>
            </TouchableOpacity>
          )}
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
        )}

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
  );
}

const createStyles = (colors: any) => StyleSheet.create({
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
  splitChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  splitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  receiptParseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 8,
  },
  receiptParseText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    borderRadius: 9999,
  },
  takePhotoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.background,
  },
  startSplittingButton: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  startSplittingButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.background,
  },
});
