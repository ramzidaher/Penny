import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { AdvisorMission } from '../utils/advisorMissions';

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
                color={completed ? colors.primary : colors.textLight}
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
    fontWeight: '900',
    fontSize: 14,
    marginBottom: 2,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  desc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  right: {
    alignItems: 'flex-end',
    gap: 8,
  },
  xp: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '900',
  },
  askButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  askButtonDisabled: {
    opacity: 0.5,
  },
  askText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '900',
  },
});

