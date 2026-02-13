import type { Subscription } from '../database/schema';

/** Normalize merchant name for grouping (case-insensitive, trimmed). */
export function normalizeMerchantName(name: string): string {
  return (name || '').trim().toLowerCase();
}

/** Monthly equivalent of a subscription's amount based on frequency. */
export function getSubscriptionMonthlyAmount(sub: Subscription): number {
  switch (sub.frequency) {
    case 'monthly':
      return sub.amount;
    case 'yearly':
      return sub.amount / 12;
    case 'weekly':
      return sub.amount * (52 / 12);
    default:
      return sub.amount;
  }
}

export interface DuplicateGroup {
  merchantKey: string;
  displayName: string;
  subscriptions: Subscription[];
  count: number;
  monthlyTotal: number;
}

/**
 * Group subscriptions by normalized merchant name (excluding those marked "different service").
 * Returns only groups with count > 1.
 */
export function getDuplicateGroups(subs: Subscription[]): DuplicateGroup[] {
  const byMerchant = new Map<string, Subscription[]>();
  const displayNames = new Map<string, string>();

  for (const sub of subs) {
    if (sub.isDifferentService) continue;
    const key = normalizeMerchantName(sub.name);
    if (!key) continue;
    if (!byMerchant.has(key)) {
      byMerchant.set(key, []);
      displayNames.set(key, sub.name.trim() || sub.name);
    }
    byMerchant.get(key)!.push(sub);
  }

  const groups: DuplicateGroup[] = [];
  for (const [merchantKey, subscriptions] of byMerchant) {
    if (subscriptions.length <= 1) continue;
    const monthlyTotal = subscriptions.reduce(
      (sum, s) => sum + getSubscriptionMonthlyAmount(s),
      0
    );
    groups.push({
      merchantKey,
      displayName: displayNames.get(merchantKey) || merchantKey,
      subscriptions,
      count: subscriptions.length,
      monthlyTotal,
    });
  }
  return groups;
}

/**
 * Check if a subscription belongs to any duplicate group (same merchant, not marked different).
 */
export function isInDuplicateGroup(
  sub: Subscription,
  duplicateGroups: DuplicateGroup[]
): boolean {
  const key = normalizeMerchantName(sub.name);
  const group = duplicateGroups.find((g) => g.merchantKey === key);
  return !!group && group.count > 1 && !sub.isDifferentService;
}
