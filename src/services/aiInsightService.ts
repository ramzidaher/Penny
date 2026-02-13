import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Account, Transaction, Budget, Subscription, Debt } from '../database/schema';
import { getAccounts, getTransactions, getBudgets, getSubscriptions, getDebts } from '../database/db';
import { getSettings } from './settingsService';
import { convertCurrency } from './currencyConversionService';
import { getCurrencySymbol } from '../utils/currency';
import { computeFinancialSummary } from '../utils/financialSummary';
import { filterTransactionsByPeriod, FilterPeriod } from '../utils/transactionFilters';
import { checkAiAccess, consumeAiUsageIfNeeded } from './aiAccessService';
import { getSubscriptionState } from './subscriptionService';
import { isDemoUser } from './demoUser';
import type { Insight, InsightType, InsightPriority, InsightCtaLabel } from '../types/insight';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const CACHE_KEY = 'ai_insights_cache_v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const PRIORITY_ORDER: InsightPriority[] = ['critical', 'opportunity', 'fyi'];

const VALID_TYPES: InsightType[] = ['spending_pattern', 'prediction', 'opportunity', 'anomaly'];
const VALID_PRIORITIES: InsightPriority[] = ['critical', 'opportunity', 'fyi'];
const VALID_CTA: InsightCtaLabel[] = ['See Details', 'Take Action'];

interface CachedInsights {
  insights: Insight[];
  lastGeneratedAt: string;
  dataHash: string;
}

interface GetInsightsOptions {
  forceRefresh?: boolean;
  dataHash?: string;
  period?: FilterPeriod;
}

export interface GetInsightsResult {
  insights: Insight[];
  accessDenied?: boolean;
  accessDeniedReason?: 'upgrade' | 'limit' | 'demo_paywall';
}

function sortByPriority(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    const i = PRIORITY_ORDER.indexOf(a.priority);
    const j = PRIORITY_ORDER.indexOf(b.priority);
    return i - j;
  });
}

function validateInsight(raw: unknown): Insight | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o.type as string;
  const headline = typeof o.headline === 'string' ? o.headline.trim() : '';
  const detail = typeof o.detail === 'string' ? o.detail.trim() : '';
  const ctaLabel = o.ctaLabel as string;
  const priority = o.priority as string;
  if (!headline || !VALID_TYPES.includes(type as InsightType) || !VALID_PRIORITIES.includes(priority as InsightPriority)) {
    return null;
  }
  const cta: InsightCtaLabel = VALID_CTA.includes(ctaLabel as InsightCtaLabel) ? (ctaLabel as InsightCtaLabel) : 'See Details';
  return {
    type: type as InsightType,
    headline,
    detail,
    ctaLabel: cta,
    ctaRoute: typeof o.ctaRoute === 'string' ? o.ctaRoute : undefined,
    priority: priority as InsightPriority,
  };
}

export function computeDataHash(
  transactions: Transaction[],
  budgets: Budget[]
): string {
  const lastTxDate = transactions.length > 0
    ? transactions.map(t => t.date).sort().reverse()[0]
    : '';
  const budgetsOverLimit = budgets.filter(b => b.limit > 0 && b.currentSpent >= b.limit).length;
  return `${transactions.length}-${lastTxDate}-${budgetsOverLimit}`;
}

interface FinancialData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  totalAssets: number;
  totalDebts: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

async function getFinancialData(period: FilterPeriod = 'month'): Promise<FinancialData> {
  const [accounts, allTransactions, budgets, subscriptions, debts] = await Promise.all([
    getAccounts(),
    getTransactions(),
    getBudgets(),
    getSubscriptions(),
    getDebts(),
  ]);
  const { totalAssets, totalDebts } = computeFinancialSummary(accounts, debts);
  const filtered = filterTransactionsByPeriod(allTransactions, period);
  return {
    accounts,
    transactions: filtered.transactions,
    budgets,
    subscriptions,
    totalAssets,
    totalDebts,
    monthlyIncome: filtered.income,
    monthlyExpenses: filtered.expenses,
  };
}

async function buildFinancialContextFromData(
  data: FinancialData,
  displayCurrency: string
): Promise<{ context: string; symbol: string }> {
  const symbol = getCurrencySymbol(displayCurrency);
  const accountIdToCurrency = new Map<string, string>(data.accounts.map(a => [a.id, a.currency || 'USD']));

  const accountBalances = new Map<string, number>();
  for (const acc of data.accounts) {
    const balance = acc.balance ?? 0;
    const from = acc.currency || 'USD';
    const converted = from === displayCurrency ? balance : await convertCurrency(balance, from, displayCurrency);
    accountBalances.set(acc.id, converted);
  }

  const transactionAmounts = new Map<string, number>();
  for (const t of data.transactions) {
    const from = accountIdToCurrency.get(t.accountId) || 'USD';
    const converted = from === displayCurrency ? t.amount : await convertCurrency(t.amount, from, displayCurrency);
    transactionAmounts.set(t.id, converted);
  }

  const subscriptionAmounts = new Map<string, number>();
  for (const s of data.subscriptions) {
    const from = s.currency || 'USD';
    const converted = from === displayCurrency ? s.amount : await convertCurrency(s.amount, from, displayCurrency);
    subscriptionAmounts.set(s.id, converted);
  }

  const accountsToSum = data.accounts.filter(acc => !(acc.type === 'card' && acc.linkedAccountId));
  const totalBalance = accountsToSum.reduce((sum, acc) => sum + (accountBalances.get(acc.id) ?? 0), 0) - data.totalDebts;
  const monthlyIncome = data.transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (transactionAmounts.get(t.id) ?? t.amount), 0);
  const monthlyExpenses = data.transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (transactionAmounts.get(t.id) ?? t.amount), 0);

  const lines: string[] = [
    `Financial Summary (${displayCurrency} ${symbol}):`,
    `- Net Worth: ${symbol}${totalBalance.toFixed(2)}`,
    `- Income: ${symbol}${monthlyIncome.toFixed(2)}`,
    `- Expenses: ${symbol}${monthlyExpenses.toFixed(2)}`,
    `- Available: ${symbol}${(monthlyIncome - monthlyExpenses).toFixed(2)}`,
    '',
    `Accounts (${data.accounts.length}):`,
    ...data.accounts.map(acc => `  - ${acc.name} (${acc.type}): ${symbol}${(accountBalances.get(acc.id) ?? 0).toFixed(2)}`),
    '',
    'Recent Transactions (last 10):',
    ...data.transactions.slice(0, 10).map(t => {
      const amount = transactionAmounts.get(t.id) ?? t.amount;
      return `  - ${t.type === 'income' ? '+' : '-'}${symbol}${amount.toFixed(2)} | ${t.category} | ${t.description || 'No description'}`;
    }),
    '',
    'Budgets:',
    ...data.budgets.map(b =>
      `  - ${b.category}: ${symbol}${b.currentSpent.toFixed(2)} / ${symbol}${b.limit.toFixed(2)} (${b.limit > 0 ? ((b.currentSpent / b.limit) * 100).toFixed(0) : 0}%)`
    ),
    '',
    'Active Subscriptions:',
    ...data.subscriptions.map(s =>
      `  - ${s.name}: ${symbol}${(subscriptionAmounts.get(s.id) ?? s.amount).toFixed(2)}/${s.frequency}`
    ),
  ];

  return { context: lines.join('\n'), symbol };
}

async function generateInsightsFromGemini(
  data: FinancialData,
  displayCurrency: string,
  symbol: string
): Promise<Insight[]> {
  const { context } = await buildFinancialContextFromData(data, displayCurrency);

  const systemPrompt = `You are a financial insight assistant for the Penny app. Based on the user's financial data, generate 1 to 3 short, actionable insights.

RULES:
- Use ONLY the currency and symbol provided (${displayCurrency} ${symbol}). Use actual numbers from the data.
- Output a JSON array only, no markdown or extra text. Each object must have: type, headline, detail, ctaLabel, priority.
- type: one of "spending_pattern" (e.g. "You've spent 40% more on transport this month"), "prediction" (e.g. "At this rate you'll exceed your food budget by Feb 15"), "opportunity" (e.g. "You could save £120/month by canceling unused subscriptions"), "anomaly" (e.g. "Large transaction detected: £500 to United Airlines").
- priority: "critical" for overspending/upcoming shortfalls, "opportunity" for savings/optimization, "fyi" for patterns/trends.
- ctaLabel: "See Details" or "Take Action".
- headline: one short sentence. detail: one sentence with specific numbers.
- If there is nothing notable, return 1 fyi insight about overall health or a neutral pattern.`;

  const userPrompt = `Financial data:\n${context}\n\nReturn a JSON array of 1-3 insight objects. Example: [{"type":"spending_pattern","headline":"You've spent 40% more on transport this month","detail":"Transport total is £X vs £Y last period.","ctaLabel":"See Details","priority":"fyi"}]`;

  const response = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.5,
        responseMimeType: 'application/json',
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
    }
  );

  const text =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (!text) return [];

  // Strip markdown code block if present
  let jsonStr = text;
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : [];
    const insights: Insight[] = [];
    for (const item of arr.slice(0, 3)) {
      const insight = validateInsight(item);
      if (insight) insights.push(insight);
    }
    return sortByPriority(insights);
  } catch {
    return [];
  }
}

async function readCache(): Promise<CachedInsights | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedInsights;
    if (!Array.isArray(parsed.insights) || !parsed.lastGeneratedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(insights: Insight[], dataHash: string): Promise<void> {
  await AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      insights,
      lastGeneratedAt: new Date().toISOString(),
      dataHash,
    } as CachedInsights)
  );
}

export async function getInsights(options: GetInsightsOptions = {}): Promise<GetInsightsResult> {
  const { forceRefresh = false, dataHash: currentDataHash, period = 'month' } = options;

  const state = getSubscriptionState();
  const demoUser = isDemoUser();
  const access = await checkAiAccess(state.accessLevel, demoUser);
  if (!access.allowed) {
    return {
      insights: [],
      accessDenied: true,
      accessDeniedReason: access.reason,
    };
  }

  if (!GEMINI_API_KEY) {
    return { insights: [] };
  }

  const cached = await readCache();
  const now = Date.now();
  const cacheAge = cached ? now - new Date(cached.lastGeneratedAt).getTime() : Infinity;
  const cacheValid = cached && cacheAge < CACHE_MAX_AGE_MS && (currentDataHash == null || cached.dataHash === currentDataHash);

  if (!forceRefresh && cacheValid && cached.insights.length > 0) {
    return { insights: cached.insights };
  }

  try {
    const settings = await getSettings().catch(() => ({}));
    const displayCurrency = settings.defaultCurrency || 'USD';
    const symbol = getCurrencySymbol(displayCurrency);

    const data = await getFinancialData(period);
    const insights = await generateInsightsFromGemini(data, displayCurrency, symbol);
    if (insights.length === 0) {
      return { insights: cached?.insights ?? [] };
    }

    await consumeAiUsageIfNeeded(state.accessLevel);

    const hash = currentDataHash ?? computeDataHash(data.transactions, data.budgets);
    await writeCache(insights, hash);

    return { insights };
  } catch (err) {
    console.warn('[aiInsightService] Generate failed:', err);
    if (cached?.insights?.length) {
      return { insights: cached.insights };
    }
    return { insights: [] };
  }
}
