import { Account, Transaction, Budget, Subscription } from '../database/schema';

export type AdvisorMissionKind =
  | 'daily_checkin'
  | 'budget_guardrail'
  | 'subscription_trim'
  | 'top_spend_review'
  | 'log_transactions';

export interface AdvisorMission {
  id: string;
  kind: AdvisorMissionKind;
  title: string;
  description: string;
  rewardXp: number;
  expiresOn: string; // YYYY-MM-DD
  completedAt?: string; // ISO
}

export interface AdvisorMissionContext {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  today: string; // YYYY-MM-DD
}

const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export function generateAdvisorMissions(ctx: AdvisorMissionContext, maxMissions = 3): AdvisorMission[] {
  const seed = `${ctx.today}|a${ctx.accounts.length}|t${ctx.transactions.length}|b${ctx.budgets.length}|s${ctx.subscriptions.length}`;
  const seedNum = hashString(seed);

  const expenseTx = ctx.transactions.filter(t => t.type === 'expense');
  const hasBudgets = ctx.budgets.length > 0;
  const hasSubs = ctx.subscriptions.length > 0;

  const budgetsOver80 = ctx.budgets.filter(b => (b.limit || 0) > 0 && (b.currentSpent / b.limit) >= 0.8);
  const topCategory = (() => {
    const map = new Map<string, number>();
    for (const t of expenseTx) {
      map.set(t.category, (map.get(t.category) || 0) + t.amount);
    }
    let best: { category: string; amount: number } | null = null;
    for (const [category, amount] of map.entries()) {
      if (!best || amount > best.amount) best = { category, amount };
    }
    return best?.category;
  })();

  const candidates: AdvisorMission[] = [
    {
      id: `m_${ctx.today}_checkin`,
      kind: 'daily_checkin',
      title: 'Daily check-in',
      description: 'Get a quick snapshot and 3 next steps.',
      rewardXp: 20,
      expiresOn: ctx.today,
    },
    ...(hasBudgets
      ? [{
          id: `m_${ctx.today}_budget`,
          kind: 'budget_guardrail' as const,
          title: budgetsOver80.length ? 'Budgets at risk' : 'Budget guardrails',
          description: budgetsOver80.length
            ? `Review ${budgetsOver80.length} budget(s) over 80% and choose one action to stay on track.`
            : 'Review your budgets and pick one category to keep tighter this period.',
          rewardXp: 30,
          expiresOn: ctx.today,
        }]
      : []),
    ...(hasSubs
      ? [{
          id: `m_${ctx.today}_subs`,
          kind: 'subscription_trim' as const,
          title: 'Trim subscriptions',
          description: 'Pick one subscription to cancel, downgrade, or negotiate.',
          rewardXp: 30,
          expiresOn: ctx.today,
        }]
      : []),
    ...(topCategory
      ? [{
          id: `m_${ctx.today}_topcat`,
          kind: 'top_spend_review' as const,
          title: 'Top spending category',
          description: `Review your spending in “${topCategory}” and choose one improvement.`,
          rewardXp: 25,
          expiresOn: ctx.today,
        }]
      : []),
    {
      id: `m_${ctx.today}_logtx`,
      kind: 'log_transactions',
      title: 'Log 3 transactions',
      description: 'Add or review 3 transactions to keep your data fresh.',
      rewardXp: 15,
      expiresOn: ctx.today,
    },
  ];

  // Deterministic selection: rotate through candidates by seeded offset.
  const picked: AdvisorMission[] = [];
  const offset = seedNum % Math.max(1, candidates.length);

  for (let i = 0; i < candidates.length && picked.length < maxMissions; i++) {
    const idx = (offset + i) % candidates.length;
    const mission = candidates[idx];
    if (picked.some(m => m.kind === mission.kind)) continue;
    picked.push(mission);
  }

  return picked;
}

