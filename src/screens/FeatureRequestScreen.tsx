import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import { createCannyPost, listCannyPosts, CannyPostSummary } from '../services/cannyService';

const BOARD_TOKEN = '70458a9a-7785-7746-cd00-b7c198b1eec4';

export default function FeatureRequestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const dialog = useDialog();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [posts, setPosts] = useState<CannyPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listCannyPosts({ boardToken: BOARD_TOKEN, limit: 30, skip: 0 });
      setPosts(res.posts || []);
    } catch (error: any) {
      console.error('Failed to load feature requests:', error);
      dialog.alert('Error', error.message || 'Unable to load feature requests right now.');
    } finally {
      setLoading(false);
    }
  }, [dialog]);

  React.useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      dialog.alert('Missing title', 'Please add a short title for your request.');
      return;
    }
    if (!details.trim()) {
      dialog.alert('Missing details', 'Please describe what you need.');
      return;
    }

    try {
      setSubmitting(true);
      await createCannyPost({
        boardToken: BOARD_TOKEN,
        title: title.trim(),
        details: details.trim(),
      });
      setTitle('');
      setDetails('');
      await loadPosts();
      dialog.alert('Submitted', 'Your request has been sent. Thanks for the feedback!');
    } catch (error: any) {
      console.error('Failed to submit request:', error);
      dialog.alert('Error', error.message || 'Unable to submit your request right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenInBrowser = async (url?: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open Canny link:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Feature request</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Submit a request</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Short summary"
              placeholderTextColor={colors.textLight}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
            <Text style={styles.inputLabel}>Details</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe the feature you want…"
              placeholderTextColor={colors.textLight}
              value={details}
              onChangeText={setDetails}
              multiline
            />
            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color={colors.background} />
                  <Text style={styles.primaryButtonText}>Submit request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent requests</Text>
            <TouchableOpacity onPress={loadPosts} style={styles.refreshButton}>
              <Ionicons name="refresh" size={16} color={colors.textSecondary} />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading requests…</Text>
            </View>
          ) : posts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No requests yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to share an idea.</Text>
            </View>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Text style={styles.postTitle}>{post.title}</Text>
                  {!!post.status && (
                    <Text style={styles.postStatus}>{post.status}</Text>
                  )}
                </View>
                {!!post.details && (
                  <Text style={styles.postDetails} numberOfLines={3}>
                    {post.details}
                  </Text>
                )}
                <View style={styles.postMetaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="chevron-up-circle-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{post.score ?? 0} votes</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{post.commentCount ?? 0} comments</Text>
                  </View>
                  {!!post.url && (
                    <TouchableOpacity onPress={() => handleOpenInBrowser(post.url)} style={styles.metaLink}>
                      <Text style={styles.metaLinkText}>Open</Text>
                      <Ionicons name="open-outline" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
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
      backgroundColor: colors.background,
    },
    backButton: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    headerSpacer: {
      width: 32,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    section: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginTop: 4,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.background,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    loadingState: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      paddingVertical: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    refreshText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    postCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      gap: 10,
    },
    postHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    postTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    postStatus: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    postDetails: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    postMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    metaLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaLinkText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
  });
