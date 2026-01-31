import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '../utils/navigation';
import { useDialog } from '../contexts/DialogContext';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useToast } from '../contexts/ToastContext';
import { setOAuthFlowActive } from '../services/oAuthFlowService';
import { isDemoUser } from '../services/demoUser';
import {
  createPlaidHostedLinkToken,
  exchangePlaidPublicToken,
  listPlaidItems,
  plaidLinkTokenGet,
  removePlaidItem,
  type PlaidEnvironment,
  type PlaidItemSummary,
} from '../services/plaidService';

export default function ConnectBankScreen() {
  const navigation = useNavigation();
  const dialog = useDialog();
  const router = useRouter();
  const [items, setItems] = useState<PlaidItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { showSuccess, showError } = useToast();
  const activeLinkTokenRef = useRef<string | null>(null);

  // Load Plaid items on mount
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const next = await listPlaidItems();
      setItems(next);
    } catch (error) {
      console.error('Error loading Plaid items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setOAuthFlowActive(true);
      setConnecting(true);

      // Demo users are always sandbox; everyone else uses configured env (defaults to sandbox).
      const configuredEnv = (process.env.EXPO_PUBLIC_PLAID_ENV as PlaidEnvironment | undefined) || 'sandbox';
      const environment: PlaidEnvironment = isDemoUser() ? 'sandbox' : (configuredEnv === 'production' ? 'production' : 'sandbox');

      const { link_token, hosted_link_url } = await createPlaidHostedLinkToken(environment);
      if (!hosted_link_url) {
        throw new Error('Plaid did not return hosted_link_url. Make sure Hosted Link is enabled.');
      }

      activeLinkTokenRef.current = link_token;

      const completionRedirectUri = 'penny://plaid-callback';
      const result = await WebBrowser.openAuthSessionAsync(hosted_link_url, completionRedirectUri);

      if (result.type !== 'success') {
        // User cancelled or dismissed
        setConnecting(false);
        setOAuthFlowActive(false);
        return;
      }

      // Poll /link/token/get to obtain public_token (Hosted Link does not return it via redirect)
      const publicTokenPayload = await pollForPublicToken(link_token);
      const publicToken = publicTokenPayload?.public_token;
      if (!publicToken) {
        throw new Error('Unable to obtain public_token from link session.');
      }

      await exchangePlaidPublicToken({
        public_token: publicToken,
        environment,
        institution: publicTokenPayload?.institution || undefined,
      });

      await loadItems();
      showSuccess('Bank connected successfully! Accounts have been added.');
    } catch (error: any) {
      console.error('Error connecting Plaid bank:', error);
      showError(error.message || 'Failed to connect bank');
      setConnecting(false);
      setOAuthFlowActive(false);
    }
  };

  const pollForPublicToken = async (linkToken: string) => {
    const started = Date.now();
    const timeoutMs = 60_000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    while (Date.now() - started < timeoutMs) {
      const data = await plaidLinkTokenGet(linkToken);
      const sessions: any[] = data?.link_sessions || [];

      // Find a finished session first, otherwise pick the latest.
      const session = sessions.find((s) => s?.finished_at) || sessions[sessions.length - 1];
      const results = session?.results;
      const itemAdds: any[] = results?.item_add_results || [];
      const first = itemAdds[0];
      const publicToken: string | undefined = first?.public_token || session?.on_success?.public_token;

      if (publicToken) {
        return {
          public_token: publicToken,
          institution: first?.institution || session?.on_success?.metadata?.institution || null,
        };
      }

      // If the session has finished but no token, treat as exit/error.
      if (session?.finished_at && session?.exit) {
        throw new Error('Link session exited before completion.');
      }

      await sleep(2000);
    }

    throw new Error('Timed out waiting for Plaid link session to finish.');
  };

  const handleDisconnect = async (itemId: string) => {
    try {
      await removePlaidItem(itemId);
      await loadItems();
      showSuccess('Bank disconnected');
    } catch (error: any) {
      console.error('Error disconnecting:', error);
      showError(error.message || 'Failed to disconnect bank');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Connected Banks</Text>
        <TouchableOpacity
          style={[styles.connectButton, connecting && styles.connectButtonDisabled]}
          onPress={handleConnect}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={colors.background} />
              <Text style={styles.connectButtonText}>Connect Bank</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No banks connected</Text>
          <Text style={styles.emptySubtext}>Tap "Connect Bank" to get started</Text>
        </View>
      ) : (
        <View style={styles.connectionsList}>
          {items.map((item) => (
            <View key={item.item_id} style={styles.connectionCard}>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>{item.institution_name || 'Connected Bank'}</Text>
                <Text style={styles.connectionId}>
                  {item.item_id ? `Item • ${item.item_id.substring(0, 8)}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.disconnectButton} onPress={() => handleDisconnect(item.item_id)}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          </View>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  finalizingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  finalizingTitle: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  finalizingSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h1,
    marginBottom: 16,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    ...typography.h2,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  connectionsList: {
    padding: 20,
  },
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    ...typography.h3,
    marginBottom: 4,
  },
  connectionId: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  disconnectButton: {
    padding: 8,
  },
});
