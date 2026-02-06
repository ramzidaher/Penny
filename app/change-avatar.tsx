import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/contexts/ThemeContext';
import { getCurrentUserProfile, updateUserProfile } from '../src/services/firebase';
import Avatar from '../src/components/Avatar';
import { AVATAR_SEEDS } from '../src/utils/avatarUtils';
import ProfileSettingsHeader from '../src/components/ProfileSettingsHeader';
import { useDialog } from '../src/contexts/DialogContext';

export default function ChangeAvatarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dialog = useDialog();
  const [profile, setProfile] = useState<{ avatarSeed?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSelectAvatar = async (seed: string) => {
    try {
      setSaving(true);
      await updateUserProfile({ avatarSeed: seed });
      setProfile({ avatarSeed: seed });
      router.back();
    } catch (e: any) {
      dialog.alert('Error', e?.message ?? 'Failed to update avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ProfileSettingsHeader
        title="Change avatar"
        leftButton={{ type: 'text', label: 'Cancel', onPress: () => router.back() }}
      />
      {saving ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.gridWrap, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>Tap an avatar to use it</Text>
          <View style={styles.grid}>
            {AVATAR_SEEDS.map((seed) => (
              <TouchableOpacity
                key={seed}
                style={[
                  styles.gridItem,
                  { borderColor: colors.border },
                  profile?.avatarSeed === seed && { borderColor: colors.primary, borderWidth: 2 },
                ]}
                onPress={() => handleSelectAvatar(seed)}
                activeOpacity={0.7}
                disabled={saving}
              >
                <Avatar seed={seed} size={56} />
                {profile?.avatarSeed === seed && (
                  <View style={[styles.check, { backgroundColor: colors.background }]}>
                    <Text style={[styles.checkText, { color: colors.primary }]}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    gridWrap: {
      padding: 16,
    },
    hint: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
      textAlign: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 16,
    },
    gridItem: {
      width: 72,
      height: 72,
      minWidth: 72,
      minHeight: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      overflow: 'hidden',
    },
    check: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkText: {
      fontSize: 12,
      fontWeight: '700',
    },
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
