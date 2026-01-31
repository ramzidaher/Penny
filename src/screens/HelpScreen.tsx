import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function HelpScreen() {

  const handleContactSupport = () => {
    // Open email client or support link
    const email = 'support@pennyfinance.app';
    const subject = 'Support Request';
    const body = 'Please describe your issue or question here...';
    
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    Linking.openURL(mailtoLink).catch((err) => {
      console.error('Failed to open email client:', err);
    });
  };

  const faqItems = [
    {
      question: 'How do I add a transaction?',
      answer: 'Go to the Finance tab and tap the "+" button, then select "Add Transaction". Fill in the details and save.',
    },
    {
      question: 'How do I connect my bank account?',
      answer: 'Navigate to Finance > Accounts and tap "Add Account" to create accounts manually.',
    },
    {
      question: 'How do I set up budgets?',
      answer: 'Go to Finance > Budgets and tap the "+" button to create a new budget. Set your spending limit and category.',
    },
    {
      question: 'How do I change my AI tone?',
      answer: 'Go to Profile > Settings > AI Tone and select your preferred communication style.',
    },
    {
      question: 'How do I enable notifications?',
      answer: 'Go to Profile > Settings > Notifications and toggle on the notification types you want to receive.',
    },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Help Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqItems.map((item, index) => (
            <View key={index} style={styles.faqCard}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}
        </View>

        {/* Contact Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get Help</Text>
          <TouchableOpacity
            style={styles.supportCard}
            onPress={handleContactSupport}
            activeOpacity={0.7}
          >
            <View style={styles.supportCardContent}>
              <View style={styles.supportCardLeft}>
                <View style={styles.supportIconContainer}>
                  <Ionicons name="mail-outline" size={20} color={colors.text} />
                </View>
                <View style={styles.supportTextContainer}>
                  <Text style={styles.supportCardTitle}>Contact Support</Text>
                  <Text style={styles.supportCardDescription}>
                    Send us an email and we'll get back to you as soon as possible
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Resources Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resources</Text>
          <View style={styles.resourcesCard}>
            <Text style={styles.resourcesText}>
              For more information, visit our website or check the documentation.
            </Text>
          </View>
        </View>

        <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 20,
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
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  supportCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  supportCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  supportCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  supportIconContainer: {
    marginRight: 12,
  },
  supportTextContainer: {
    flex: 1,
  },
  supportCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  supportCardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  resourcesCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resourcesText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bottomPadding: {
    height: 40,
  },
});

