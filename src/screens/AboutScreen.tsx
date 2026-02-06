import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTheme } from '../contexts/ThemeContext';
import ProfileSettingsHeader from '../components/ProfileSettingsHeader';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLink = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open URL:', err);
    });
  };

  // Get app version from app.json (via Constants)
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || '2';

  return (
    <View style={styles.container}>
      <ProfileSettingsHeader
        title="About"
        leftButton={{ type: 'back', onPress: () => router.back() }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        {/* App Info Section */}
        <View style={styles.section}>
          <View style={styles.appInfoCard}>
            <Text style={styles.appName}>Penny</Text>
            <Text style={styles.appTagline}>Your Personal Finance Assistant</Text>
            <View style={styles.versionContainer}>
              <Text style={styles.versionLabel}>Version</Text>
              <Text style={styles.versionText}>{appVersion}</Text>
            </View>
            <View style={styles.versionContainer}>
              <Text style={styles.versionLabel}>Build</Text>
              <Text style={styles.versionText}>{buildNumber}</Text>
            </View>
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.legalCard}
            onPress={() => handleLink('https://pennyfinance.app/terms')}
            activeOpacity={0.7}
          >
            <View style={styles.legalCardContent}>
              <View style={styles.legalCardLeft}>
                <Ionicons name="document-text-outline" size={20} color={colors.text} />
                <Text style={styles.legalCardTitle}>Terms of Service</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.legalCard, styles.legalCardWithMargin]}
            onPress={() => handleLink('https://pennyfinance.app/privacy')}
            activeOpacity={0.7}
          >
            <View style={styles.legalCardContent}>
              <View style={styles.legalCardLeft}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
                <Text style={styles.legalCardTitle}>Privacy Policy</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Additional Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Penny helps you manage your finances, track spending, set budgets, and get AI-powered financial advice.
            </Text>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: { background: string; surface: string; border: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  appInfoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -1,
  },
  appTagline: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  versionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  versionLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  legalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  legalCardWithMargin: {
    marginTop: 12,
  },
  legalCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  legalCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  legalCardTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bottomPadding: {
    height: 40,
  },
  });

