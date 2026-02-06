import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Share, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDialog } from '../contexts/DialogContext';
import { useTheme } from '../contexts/ThemeContext';
import { getUserEmail, getCurrentUser, logoutUser } from '../services/firebase';
import { exportDataAsJSON, exportDataAsCSV } from '../services/dataExportService';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const userEmail = getUserEmail();
  const currentUser = getCurrentUser();
  const [exporting, setExporting] = useState(false);
  
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

  const handleSignOut = async () => {
    // Use web-compatible confirmation
    const confirmSignOut = (): Promise<boolean> => {
      if (Platform.OS === 'web') {
        return Promise.resolve(
          typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')
        );
      } else {
        return dialog.showDialog(
          'Sign Out',
          'Are you sure you want to sign out?',
          [
            { 
              text: 'Cancel', 
              style: 'cancel',
            },
            {
              text: 'Sign Out',
              style: 'destructive',
            },
          ]
        ).then((buttonText) => {
          // Return true if "Sign Out" was pressed, false otherwise
          return buttonText === 'Sign Out';
        });
      }
    };

    const shouldSignOut = await confirmSignOut();
    
    if (shouldSignOut) {
      try {
        console.log('Signing out...');
        await logoutUser();
        console.log('Sign out successful - App.tsx should handle navigation');
        // Navigation will be handled by App.tsx auth state listener
      } catch (error: any) {
        console.error('Sign out error:', error);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(error.message || 'Failed to sign out. Please try again.');
        } else {
          dialog.alert('Error', error.message || 'Failed to sign out. Please try again.');
        }
      }
    } else {
      console.log('Sign out cancelled');
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={handleDone} style={styles.doneButton}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {/* User Info Section */}
        <View style={styles.section}>
          <View style={styles.userCard}>
            <View style={styles.avatarContainer}>
              <Ionicons name="person" size={32} color={colors.textSecondary} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{displayName}</Text>
              {userEmail && (
                <Text style={styles.userEmail}>{userEmail}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => {
              // Handle upgrade to pro
            }}
            activeOpacity={0.7}
          >
            <View style={styles.actionCardContent}>
              <View style={styles.actionCardLeft}>
                <View style={styles.actionIconContainer}>
                  <Ionicons name="star" size={20} color="#007AFF" />
                </View>
                <Text style={styles.actionCardTitle}>Upgrade to Pro</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={handleSettings}
            activeOpacity={0.7}
          >
            <View style={styles.actionCardContent}>
              <View style={styles.actionCardLeft}>
                <View style={styles.actionIconContainer}>
                  <Ionicons name="settings-outline" size={20} color={colors.text} />
                </View>
                <View style={styles.actionCardTextContainer}>
                  <Text style={styles.actionCardTitle}>Settings</Text>
                  <Text style={styles.actionCardSubtitle}>Preferences, security, and more</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardWithMargin]}
            onPress={handleHelp}
            activeOpacity={0.7}
          >
            <View style={styles.actionCardContent}>
              <View style={styles.actionCardLeft}>
                <View style={styles.actionIconContainer}>
                  <Ionicons name="help-circle-outline" size={20} color={colors.text} />
                </View>
                <Text style={styles.actionCardTitle}>Help & Support</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardWithMargin]}
            onPress={handleAbout}
            activeOpacity={0.7}
          >
            <View style={styles.actionCardContent}>
              <View style={styles.actionCardLeft}>
                <View style={styles.actionIconContainer}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                </View>
                <View style={styles.actionCardTextContainer}>
                  <Text style={styles.actionCardTitle}>About</Text>
                  <Text style={styles.actionCardSubtitle}>Version, terms, privacy</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardWithMargin]}
            onPress={handleExportData}
            activeOpacity={0.7}
            disabled={exporting}
          >
            <View style={styles.actionCardContent}>
              <View style={styles.actionCardLeft}>
                <View style={styles.actionIconContainer}>
                  {exporting ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="download-outline" size={20} color={colors.text} />
                  )}
                </View>
                <View style={styles.actionCardTextContainer}>
                  <Text style={styles.actionCardTitle}>
                    {exporting ? 'Exporting...' : 'Export Data'}
                  </Text>
                  <Text style={styles.actionCardSubtitle}>
                    {exporting ? 'Please wait' : 'Download your data (JSON or CSV)'}
                  </Text>
                </View>
              </View>
              {!exporting && (
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Sign Out Section */}
        <View style={[styles.section, styles.sectionLast]}>
          <TouchableOpacity
            style={styles.signOutCard}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <View style={styles.signOutContent}>
              <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  doneButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  doneText: {
    fontSize: 17,
    color: colors.primary,
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: 60,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionLast: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
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
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  actionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  actionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionIconContainer: {
    marginRight: 12,
  },
  actionCardTextContainer: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
  },
  actionCardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionCardWithMargin: {
    marginTop: 12,
  },
  signOutCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 8,
  },
  signOutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
});

