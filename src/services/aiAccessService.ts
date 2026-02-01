import { AccessLevel } from './subscriptionService';
import { getDemoPaywallBypass } from './demoPaywallService';
import { getWeeklyUsageStatus, incrementWeeklyUsage } from './aiUsageService';

export const AI_WEEKLY_LIMIT = 5;

export type AiAccessResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; reason: 'upgrade' | 'limit' | 'demo_paywall'; remaining?: number };

export const checkAiAccess = async (accessLevel: AccessLevel, isDemoUser: boolean): Promise<AiAccessResult> => {
  if (isDemoUser) {
    const bypassed = await getDemoPaywallBypass();
    if (!bypassed) {
      return { allowed: false, reason: 'demo_paywall' };
    }
    return { allowed: true };
  }

  if (accessLevel === 'expert' || accessLevel === 'lifetime') {
    return { allowed: true };
  }

  if (accessLevel === 'value') {
    const status = await getWeeklyUsageStatus(AI_WEEKLY_LIMIT);
    if (!status.allowed) {
      return { allowed: false, reason: 'limit', remaining: status.remaining };
    }
    return { allowed: true, remaining: status.remaining };
  }

  return { allowed: false, reason: 'upgrade' };
};

export const consumeAiUsageIfNeeded = async (accessLevel: AccessLevel) => {
  if (accessLevel === 'value') {
    await incrementWeeklyUsage();
  }
};

