import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenHeader from '../../../src/components/ScreenHeader';
import ScreenWrapper from '../../../src/components/ScreenWrapper';
import AdvisorLanding from '../../../src/components/AdvisorLanding';
import { colors } from '../../../src/theme/colors';
import { AdvisorMission } from '../../../src/utils/advisorMissions';
import {
  getAdvisorProgress,
  refreshDailyMissionsIfNeeded,
  checkInToday,
  completeMission,
  AdvisorProgress,
} from '../../../src/services/advisorProgressService';

export default function AdvisorIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [advisorProgress, setAdvisorProgress] = useState<AdvisorProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchFocusRequestId, setSearchFocusRequestId] = useState(0);

  // On iOS, NativeTabs can overlay content; safe-area doesn't include tab bar height.
  const tabBarOverlayOffset = Platform.OS === 'ios' ? 58 : Platform.OS === 'web' ? 70 : 0;

  useEffect(() => {
    (async () => {
      try {
        const p = await getAdvisorProgress();
        const refreshed = await refreshDailyMissionsIfNeeded();
        setAdvisorProgress(refreshed || p);
      } catch {
        // ignore
      }
    })();
  }, []);

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

  const goToChat = (prompt?: string) => {
    router.push({
      pathname: '/(tabs)/ai/chat' as any,
      params: prompt ? { prompt } : undefined,
    });
  };

  const handleSearchSubmit = () => {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    setSearchText('');
    goToChat(trimmed);
  };

  const handleStartCheckIn = async () => {
    setLoading(true);
    try {
      const p1 = await checkInToday();
      let pNext = p1;
      const today = new Date().toISOString().slice(0, 10);
      const checkinMission = p1.missions.find(
        (m) => m.kind === 'daily_checkin' && m.expiresOn === today && !m.completedAt
      );
      if (checkinMission) {
        pNext = await completeMission(checkinMission.id);
      }
      setAdvisorProgress(pNext);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }

    goToChat(
      'Give me a quick daily check-in on my finances. Summarize where I stand, and give me 3 next steps.'
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

  // Keep these aligned with the chat screen.
  const quickQuestions = [
    'How am I doing financially?',
    'What are my biggest expenses?',
    'Can I afford a $500 purchase?',
    'How much can I spend this month?',
  ];

  const quickActions = [
    {
      id: 'spending',
      title: 'Spending',
      subtitle: 'What’s driving it?',
      icon: 'stats-chart' as const,
      prompt: 'Analyze my spending. What categories are driving my expenses and what should I do next?',
    },
    {
      id: 'budget',
      title: 'Budget',
      subtitle: 'Set guardrails',
      icon: 'calculator' as const,
      prompt: 'Help me set up a simple budget based on my recent transactions and income.',
    },
    {
      id: 'save',
      title: 'Save',
      subtitle: 'Move faster',
      icon: 'trending-up' as const,
      prompt: 'Give me 3 ways to save money this week based on my recent spending.',
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

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        <ScreenWrapper
          enableKeyboardAvoiding={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + tabBarOverlayOffset + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title="Penny Advisor"
            subtitle="Ask me anything about your finances"
            titleFontFamily="GulfsDisplay-Normal"
            titleLetterSpacing={0.5}
          />

          <AdvisorLanding
            disabled={loading}
            onAsk={(prompt) => goToChat(prompt)}
            onStartCheckIn={handleStartCheckIn}
            searchValue={searchText}
            onSearchChange={setSearchText}
            onSearchSubmit={handleSearchSubmit}
            searchFocusRequestId={searchFocusRequestId}
            onFocusSearch={() => setSearchFocusRequestId((v) => v + 1)}
            quickActions={quickActions}
            promptChips={quickQuestions}
            progress={
              advisorProgress
                ? { xp: advisorProgress.xp, level: advisorProgress.level, streakCount: advisorProgress.streakCount }
                : null
            }
            missions={advisorProgress?.missions?.slice(0, 3) || []}
            onAskForMission={(m) => goToChat(promptForMission(m))}
            onCompleteMission={handleCompleteMission}
          />
        </ScreenWrapper>
      </View>
    </View>
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
});

