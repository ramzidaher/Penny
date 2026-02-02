import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../src/components/ScreenHeader';
import { colors } from '../src/theme/colors';
import { useToast } from '../src/contexts/ToastContext';
import { isDemoUser } from '../src/services/demoUser';
import { setDemoPaywallBypass } from '../src/services/demoPaywallService';
import {
  purchasePackage,
  restorePurchases,
  refreshPurchases,
  useSubscriptionStatus,
} from '../src/services/subscriptionService';

const TERMS_URL = 'https://pennyfinance.app/terms';
const PRIVACY_URL = 'https://pennyfinance.app/privacy';

const PRODUCT_IDS = {
  basicMonthly: 'basic_monthly',
  basicAnnual: 'basic_annual',
  valueMonthly: 'value_monthly',
  valueAnnual: 'value_annual',
  expertMonthly: 'expert_monthly',
  expertAnnual: 'expert_annual',
  lifetime: 'lifetime',
};

type PlanId = 'basic' | 'value' | 'expert' | 'lifetime';

const PLAN_COPY: Record<PlanId, { title: string; subtitle: string; features: string[] }> = {
  basic: {
    title: 'Basic',
    subtitle: 'All accounts in one place',
    features: ['Account aggregation', 'Budgets and subscriptions', 'Secure PIN & biometrics'],
  },
  value: {
    title: 'Value',
    subtitle: 'Smart help with limits',
    features: ['Up to 5 AI requests/week', 'Spend & budget insights', 'Priority support'],
  },
  expert: {
    title: 'Expert',
    subtitle: 'Unlimited AI coaching',
    features: ['Unlimited AI requests', 'Advanced insights', 'Early feature access'],
  },
  lifetime: {
    title: 'Forever yours',
    subtitle: 'One-time payment',
    features: ['Lifetime access', 'All premium features', 'No renewals'],
  },
};

const FALLBACK_PRICES: Record<string, string> = {
  [PRODUCT_IDS.basicMonthly]: '£3.99 / month',
  [PRODUCT_IDS.basicAnnual]: '£39.99 / year',
  [PRODUCT_IDS.valueMonthly]: '£6.99 / month',
  [PRODUCT_IDS.valueAnnual]: '£74.99 / year',
  [PRODUCT_IDS.expertMonthly]: '£11.99 / month',
  [PRODUCT_IDS.expertAnnual]: '£129.99 / year',
  [PRODUCT_IDS.lifetime]: '£1000 one-time',
};

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { offerings, isLoading } = useSubscriptionStatus();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('expert');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'annual'>('annual');

  useEffect(() => {
    if (!offerings && !isLoading) {
      refreshPurchases().catch(() => {
        // ignore; UI will show fallback prices
      });
    }
  }, [offerings, isLoading]);

  const availablePackages = offerings?.current?.availablePackages ?? [];
  const packageMap = useMemo(() => {
    const map = new Map<string, (typeof availablePackages)[number]>();
    availablePackages.forEach((pkg) => {
      map.set(pkg.identifier, pkg);
      map.set(pkg.product.identifier, pkg);
    });
    return map;
  }, [availablePackages]);

  const getPackageForSelection = () => {
    if (selectedPlan === 'lifetime') {
      return packageMap.get(PRODUCT_IDS.lifetime);
    }
    const key = `${selectedPlan}${selectedInterval === 'monthly' ? 'Monthly' : 'Annual'}` as keyof typeof PRODUCT_IDS;
    return packageMap.get(PRODUCT_IDS[key]);
  };

  const getPriceLabel = (plan: PlanId, interval?: 'monthly' | 'annual') => {
    if (plan === 'lifetime') {
      return FALLBACK_PRICES[PRODUCT_IDS.lifetime];
    }
    const key = `${plan}${interval === 'monthly' ? 'Monthly' : 'Annual'}` as keyof typeof PRODUCT_IDS;
    const pkg = packageMap.get(PRODUCT_IDS[key]);
    return pkg?.product?.priceString ? `${pkg.product.priceString} / ${interval}` : FALLBACK_PRICES[PRODUCT_IDS[key]];
  };

  const handlePurchase = async () => {
    const pkg = getPackageForSelection();
    if (!pkg) {
      toast.showError('This plan is not available yet.');
      return;
    }
    try {
      await purchasePackage(pkg);
      toast.showSuccess('Subscription active. Welcome!');
      if (params.returnTo) {
        router.replace(params.returnTo as any);
      } else {
        router.back();
      }
    } catch (error: any) {
      if (error?.userCancelled) return;
      toast.showError(error?.message || 'Purchase failed. Please try again.');
    }
  };

  const handleRestore = async () => {
    try {
      await restorePurchases();
      toast.showSuccess('Purchases restored.');
    } catch (error: any) {
      toast.showError(error?.message || 'Failed to restore purchases.');
    }
  };

  const handleDemoContinue = async () => {
    await setDemoPaywallBypass(true);
    if (params.returnTo) {
      router.replace(params.returnTo as any);
    } else {
      router.back();
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      toast.showError('Unable to open link.');
    });
  };

  const selectedPrice = getPriceLabel(selectedPlan, selectedInterval);
  const isDemo = isDemoUser();
  const storeLabel = Platform.OS === 'ios' ? 'Apple' : 'Google';
  const renewalCopy =
    selectedPlan === 'lifetime'
      ? 'One-time purchase. No renewals.'
      : `Payment is charged to your ${storeLabel} account at confirmation. ${
          selectedPlan === 'expert' ? 'Includes a 7-day free trial. ' : ''
        }After any trial, ${selectedPrice}. Auto-renews unless canceled at least 24 hours before the end of the current period.`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Upgrade to Penny"
        subtitle="Keep every account in sync + unlock AI"
        rightAction={{
          icon: 'close',
          onPress: () => router.back(),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose your plan</Text>
          {(['basic', 'value', 'expert', 'lifetime'] as PlanId[]).map((plan) => {
            const isSelected = selectedPlan === plan;
            return (
              <TouchableOpacity
                key={plan}
                style={[styles.planCard, isSelected && styles.planCardSelected]}
                onPress={() => setSelectedPlan(plan)}
                activeOpacity={0.8}
              >
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planTitle}>{PLAN_COPY[plan].title}</Text>
                    <Text style={styles.planSubtitle}>{PLAN_COPY[plan].subtitle}</Text>
                  </View>
                  {plan === 'expert' && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>7-day trial</Text>
                    </View>
                  )}
                </View>
                {plan !== 'lifetime' && (
                  <View style={styles.intervalRow}>
                    <TouchableOpacity
                      style={[
                        styles.intervalPill,
                        selectedInterval === 'monthly' && isSelected && styles.intervalPillActive,
                      ]}
                      onPress={() => {
                        setSelectedPlan(plan);
                        setSelectedInterval('monthly');
                      }}
                    >
                      <Text
                        style={[
                          styles.intervalText,
                          selectedInterval === 'monthly' && isSelected && styles.intervalTextActive,
                        ]}
                      >
                        Monthly
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.intervalPill,
                        selectedInterval === 'annual' && isSelected && styles.intervalPillActive,
                      ]}
                      onPress={() => {
                        setSelectedPlan(plan);
                        setSelectedInterval('annual');
                      }}
                    >
                      <Text
                        style={[
                          styles.intervalText,
                          selectedInterval === 'annual' && isSelected && styles.intervalTextActive,
                        ]}
                      >
                        Annual
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                <Text style={styles.planPrice}>{getPriceLabel(plan, selectedInterval)}</Text>
                <View style={styles.planFeatures}>
                  {PLAN_COPY[plan].features.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, (isLoading || !getPackageForSelection()) && styles.ctaButtonDisabled]}
          onPress={handlePurchase}
          disabled={isLoading || !getPackageForSelection()}
        >
          <Text style={styles.ctaButtonText}>
            {selectedPlan === 'lifetime' ? 'Unlock forever' : 'Start subscription'}
          </Text>
          <Text style={styles.ctaSubtext}>{selectedPrice}</Text>
        </TouchableOpacity>

        {isDemo && (
          <TouchableOpacity style={styles.demoButton} onPress={handleDemoContinue}>
            <Text style={styles.demoButtonText}>Continue demo</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {renewalCopy}
          </Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => openLink(TERMS_URL)}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>•</Text>
            <TouchableOpacity onPress={() => openLink(PRIVACY_URL)}>
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>•</Text>
            <TouchableOpacity onPress={handleRestore}>
              <Text style={styles.footerLink}>Restore</Text>
            </TouchableOpacity>
          </View>
          {Platform.OS === 'ios' && (
            <Text style={styles.footerNote}>Subscriptions are managed via Apple ID settings.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  planSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 11,
    color: colors.background,
    fontWeight: '600',
  },
  intervalRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  intervalPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  intervalPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  intervalText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  intervalTextActive: {
    color: colors.primary,
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 10,
  },
  planFeatures: {
    marginTop: 10,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  ctaButton: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.background,
  },
  ctaSubtext: {
    fontSize: 12,
    color: colors.background,
    marginTop: 4,
  },
  demoButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  footerDivider: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerNote: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});

