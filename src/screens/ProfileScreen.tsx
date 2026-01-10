import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { getUserEmail, getCurrentUser, logoutUser } from '../services/firebase';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userEmail = getUserEmail();
  const currentUser = getCurrentUser();
  
  // Get display name or email username
  const displayName = currentUser?.displayName || (userEmail ? userEmail.split('@')[0] : 'User');

  const handleDone = () => {
    router.back();
  };

  const handleSettings = () => {
    router.push('/(tabs)/finance/settings');
  };

  const handleSignOut = async () => {
    // Use web-compatible confirmation
    const confirmSignOut = (): Promise<boolean> => {
      if (Platform.OS === 'web') {
        return Promise.resolve(
          typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')
        );
      } else {
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
              { 
                text: 'Cancel', 
                style: 'cancel',
                onPress: () => resolve(false)
              },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: () => resolve(true),
              },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
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
          Alert.alert('Error', error.message || 'Failed to sign out. Please try again.');
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

        {/* Settings Section */}
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
                <Text style={styles.actionCardTitle}>Settings</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
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

const styles = StyleSheet.create({
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
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
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

