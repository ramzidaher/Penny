import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '../theme/typography';
import { AdvisorMission } from '../utils/advisorMissions';
import { useTheme } from '../contexts/ThemeContext';

interface AdvisorMissionsListProps {
  missions: AdvisorMission[];
  disabled?: boolean;
  onAskForMission: (mission: AdvisorMission) => void;
  onCompleteMission: (mission: AdvisorMission) => void;
}

export default function AdvisorMissionsList({
  missions,
  disabled,
  onAskForMission,
  onCompleteMission,
}: AdvisorMissionsListProps) {
  if (!missions.length) return null;
  const { colors } = useTheme();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? colors.dark : colors;
  const styles = React.useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.container}>
      {missions.map((m) => {
        const completed = !!m.completedAt;
        return (
          <View key={m.id} style={[styles.card, completed && styles.cardCompleted]}>
            <TouchableOpacity
              style={styles.left}
              onPress={() => !completed && onCompleteMission(m)}
              disabled={disabled || completed}
              activeOpacity={0.8}
            >
              <Ionicons
                name={completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={completed ? c.primary : c.textLight}
              />
              <View style={styles.textCol}>
                <Text style={[styles.title, completed && styles.titleCompleted]} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={styles.desc} numberOfLines={2}>
                  {m.description}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.right}>
              <Text style={styles.xp}>+{m.rewardXp} XP</Text>
              <TouchableOpacity
                style={[styles.askButton, (disabled || completed) && styles.askButtonDisabled]}
                onPress={() => onAskForMission(m)}
                disabled={disabled || completed}
                activeOpacity={0.85}
              >
                <Text style={styles.askText}>Ask</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (c: {
  surface: string;
  border: string;
  primary: string;
  text: string;
  textSecondary: string;
  textLight: string;
}) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      gap: 10,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    cardCompleted: {
      opacity: 0.7,
    },
    left: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    textCol: {
      flex: 1,
    },
    title: {
      ...typography.body,
      color: c.text,
      fontWeight: '900',
      fontSize: 14,
      marginBottom: 2,
    },
    titleCompleted: {
      textDecorationLine: 'line-through',
      color: c.textSecondary,
    },
    desc: {
      ...typography.bodySmall,
      color: c.textSecondary,
      lineHeight: 18,
    },
    right: {
      alignItems: 'flex-end',
      gap: 8,
    },
    xp: {
      ...typography.bodySmall,
      color: c.primary,
      fontWeight: '900',
    },
    askButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primary + '10',
      borderWidth: 1,
      borderColor: c.primary + '20',
    },
    askButtonDisabled: {
      opacity: 0.5,
    },
    askText: {
      ...typography.bodySmall,
      color: c.primary,
      fontWeight: '900',
    },
  });

