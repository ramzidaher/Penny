import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Share, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDialog } from '../contexts/DialogContext';
import { useTheme } from '../contexts/ThemeContext';
import { getUserEmail, getCurrentUser, getCurrentUserProfile } from '../services/firebase';
import Avatar from '../components/Avatar';
import { exportDataAsJSON, exportDataAsCSV } from '../services/dataExportService';
import SettingsSection from '../components/SettingsSection';
import SettingsCard from '../components/SettingsCard';
import ProfileListItem from '../components/ProfileListItem';
import SettingsRow from '../components/SettingsRow';
import ProfileSettingsHeader from '../components/ProfileSettingsHeader';

export default function ProfileScreen() {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isNarrow = width < 375;
  const profileAvatarSize = isNarrow ? 56 : 64;
  const router = useRouter();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const userEmail = getUserEmail();
  const currentUser = getCurrentUser();
  const [exporting, setExporting] = useState(false);
  const [profile, setProfile] = useState<{ avatarSeed?: string } | null>(null);

  const refreshProfile = useCallback(() => {
    getCurrentUserProfile().then(setProfile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  // Get display name or email username
  const displayName = currentUser?.displayName || (userEmail ? userEmail.split('@')[0] : 'User');

  const handleDone = () => {
    router.back();
  };

  const handleSettings = () => {
    router.push('/settings' as any);
  };

  const handleHelp = () => {
    router.push('/help' as any);
  };

  const handleAbout = () => {
    router.push('/about' as any);
  };

  const handleExportData = async () => {
    try {
      setExporting(true);
      
      // Show format selection dialog
      const format = await new Promise<'json' | 'csv' | null>((resolve) => {
        if (Platform.OS === 'web') {
          const choice = window.confirm('Export as JSON (full data) or CSV (spreadsheet)?\n\nOK = JSON\nCancel = CSV');
          resolve(choice ? 'json' : 'csv');
        } else {
          dialog.showDialog(
            'Export Data',
            'Choose export format:',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
              { text: 'JSON (Full Data)', onPress: () => resolve('json') },
              { text: 'CSV (Spreadsheet)', onPress: () => resolve('csv') },
            ]
          ).then((buttonText) => {
            if (buttonText === 'JSON (Full Data)') resolve('json');
            else if (buttonText === 'CSV (Spreadsheet)') resolve('csv');
            else resolve(null);
          });
        }
      });

      if (!format) {
        setExporting(false);
        return;
      }

      if (format === 'json') {
        const jsonData = await exportDataAsJSON();
        const fileName = `penny-export-${new Date().toISOString().split('T')[0]}.json`;
        
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
          // Web: Download file
          const blob = new Blob([jsonData], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          dialog.alert('Success', 'Data exported successfully!');
        } else {
          // Mobile: Share
          await Share.share({
            message: jsonData,
            title: 'Penny Data Export',
          });
        }
      } else {
        const csvData = await exportDataAsCSV();
        const fileName = `penny-export-${new Date().toISOString().split('T')[0]}`;
        
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
          // Web: Download multiple CSV files
          for (const [key, value] of Object.entries(csvData)) {
            const blob = new Blob([value], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}-${key}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
          dialog.alert('Success', 'Data exported successfully!');
        } else {
          // Mobile: Combine all CSVs into one message
          const combinedCSV = Object.entries(csvData)
            .map(([key, value]) => `=== ${key.toUpperCase()} ===\n${value}`)
            .join('\n\n');
          
          await Share.share({
            message: combinedCSV,
            title: 'Penny Data Export',
          });
        }
      }
    } catch (error: any) {
      console.error('Error exporting data:', error);
      const errorMessage = error.message || 'Failed to export data. Please try again.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(errorMessage);
      } else {
        dialog.alert('Error', errorMessage);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ProfileSettingsHeader
        title="Profile"
        leftButton={{ type: 'text', label: 'Done', onPress: handleDone }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <SettingsSection title="Profile">
          <TouchableOpacity
            style={styles.userCard}
            onPress={() => router.push('/change-avatar' as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatarContainer, { width: profileAvatarSize, height: profileAvatarSize, borderRadius: profileAvatarSize / 2 }]}>
              {profile?.avatarSeed ? (
                <Avatar seed={profile.avatarSeed} size={profileAvatarSize} />
              ) : (
                <Ionicons name="person" size={profileAvatarSize * 0.5} color={colors.textSecondary} />
              )}
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
              {userEmail && (
                <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="tail">{userEmail}</Text>
              )}
              <Text style={styles.changeAvatarHint}>Tap to change avatar</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </SettingsSection>

        {/* Subscription */}
        <SettingsSection title="Subscription">
          <SettingsCard>
            <ProfileListItem
              icon="star"
              title="Upgrade to Pro"
              onPress={() => {}}
              iconColor={colors.primary}
            />
          </SettingsCard>
        </SettingsSection>

        {/* Preferences */}
        <SettingsSection title="Preferences">
          <SettingsCard>
            <ProfileListItem
              icon="settings-outline"
              title="Settings"
              subtitle="Preferences, security, and more"
              onPress={handleSettings}
            />
            <ProfileListItem
              icon="help-circle-outline"
              title="Help & Support"
              onPress={handleHelp}
              showDivider
            />
            <ProfileListItem
              icon="information-circle-outline"
              title="About"
              subtitle="Version, terms, privacy"
              onPress={handleAbout}
              showDivider
            />
            <ProfileListItem
              icon="download-outline"
              title={exporting ? 'Exporting...' : 'Export Data'}
              subtitle={exporting ? 'Please wait' : 'Download your data (JSON or CSV)'}
              onPress={handleExportData}
              disabled={exporting}
              right={exporting ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
              showDivider
            />
          </SettingsCard>
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  avatarContainer: {
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  changeAvatarHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
});

