import axios from 'axios';
import { Account, Transaction, Budget, Subscription, Debt, UserMemory } from '../database/schema';
import { filterMemoriesForPrompt } from './memoryService';
import { convertCurrency } from './currencyConversionService';
import { getCurrencySymbol } from '../utils/currency';
import { computeFinancialSummary } from '../utils/financialSummary';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

interface FinancialData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

/** Convert financial data amounts to the app's display currency for AI context. Uses same asset logic as computeFinancialSummary (no double-count for card+linked). */
async function convertFinancialDataToCurrency(
  data: FinancialData,
  targetCurrency: string
): Promise<{
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  accountBalances: Map<string, number>;
  transactionAmounts: Map<string, number>;
  subscriptionAmounts: Map<string, number>;
}> {
  const accountBalances = new Map<string, number>();
  const transactionAmounts = new Map<string, number>();
  const subscriptionAmounts = new Map<string, number>();
  const accountIdToCurrency = new Map<string, string>(data.accounts.map(a => [a.id, a.currency || 'USD']));

  const accountsToSum = data.accounts.filter((acc) => !(acc.type === 'card' && acc.linkedAccountId));

  const [accountConverted, txConverted, subConverted] = await Promise.all([
    Promise.all(data.accounts.map(async (acc) => {
      const balance = acc.balance ?? 0;
      const from = acc.currency || 'USD';
      const converted = from === targetCurrency ? balance : await convertCurrency(balance, from, targetCurrency);
      accountBalances.set(acc.id, converted);
      return converted;
    })),
    Promise.all(data.transactions.map(async (t) => {
      const from = accountIdToCurrency.get(t.accountId) || 'USD';
      const converted = from === targetCurrency ? t.amount : await convertCurrency(t.amount, from, targetCurrency);
      transactionAmounts.set(t.id, converted);
      return { id: t.id, amount: converted, type: t.type };
    })),
    Promise.all(data.subscriptions.map(async (s) => {
      const from = s.currency || 'USD';
      const converted = from === targetCurrency ? s.amount : await convertCurrency(s.amount, from, targetCurrency);
      subscriptionAmounts.set(s.id, converted);
      return converted;
    })),
  ]);

  const convertedTotalAssets = accountsToSum.reduce(
    (sum, acc) => sum + (accountBalances.get(acc.id) ?? 0),
    0
  );
  const totalBalance = convertedTotalAssets - data.totalDebts;
  const monthlyIncome = txConverted.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpenses = txConverted.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  return {
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    accountBalances,
    transactionAmounts,
    subscriptionAmounts,
  };
}

const getFinancialData = async (period: 'week' | 'month' | 'year' | 'all' = 'month'): Promise<FinancialData> => {
  const { getAccounts, getTransactions, getBudgets, getSubscriptions, getDebts } = await import('../database/db');
  const { filterTransactionsByPeriod } = await import('../utils/transactionFilters');

  const [accounts, allTransactions, budgets, subscriptions, debts] = await Promise.all([
    getAccounts(),
    getTransactions(),
    getBudgets(),
    getSubscriptions(),
    getDebts(),
  ]);

  const { totalAssets, totalDebts, netWorth } = computeFinancialSummary(accounts, debts);
  const filteredData = filterTransactionsByPeriod(allTransactions, period);

  return {
    accounts,
    transactions: filteredData.transactions,
    budgets,
    subscriptions,
    totalAssets,
    totalDebts,
    netWorth,
    monthlyIncome: filteredData.income,
    monthlyExpenses: filteredData.expenses,
  };
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const formatMemoryBlock = (memories: UserMemory[]): string => {
  const core = memories.filter(m => m.tier === 'core');
  const dynamic = memories.filter(m => m.tier === 'dynamic');
  const session = memories.filter(m => m.tier === 'session');
  const render = (items: UserMemory[]) =>
    items
      .map(m => `- ${m.title}: ${m.detail} (${m.category}, ${m.confidence})`)
      .join('\n');
  const sections: string[] = [];
  if (core.length > 0) {
    sections.push(`Core Memory:\n${render(core)}`);
  }
  if (dynamic.length > 0) {
    sections.push(`Dynamic Memory:\n${render(dynamic)}`);
  }
  if (session.length > 0) {
    sections.push(`Session Memory:\n${render(session)}`);
  }
  return sections.join('\n\n').trim();
};

const getToneInstructions = (tone: 'friendly' | 'professional' | 'direct' | 'harsh'): string => {
  switch (tone) {
    case 'friendly':
      return "Be warm, encouraging, and supportive. Use a gentle, friendly tone. Be empathetic and understanding. Use positive language and offer encouragement.";
    case 'professional':
      return "Be formal, measured, and professional. Use clear, business-appropriate language. Be concise and objective. Maintain a calm, professional demeanor.";
    case 'direct':
      return "Be straightforward and no-nonsense. Speak casually and directly, no sugar-coating. Be honest and to the point. Use casual, conversational language.";
    case 'harsh':
      return "Be candid and firm without using profanity. Use direct, plain language and focus on clear, actionable feedback. Keep the tone respectful and avoid insults or shock value.";
    default:
      return "Be professional and helpful.";
  }
};

export const askAI = async (
  question: string,
  conversationHistory: Message[] = [],
  period: 'week' | 'month' | 'year' | 'all' = 'month',
  memories: UserMemory[] = []
): Promise<string> => {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Please add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.';
  }

  try {
    const financialData = await getFinancialData(period);

    const { getSettings } = await import('./settingsService');
    let settings: { defaultCurrency?: string; aiTone?: string };
    try {
      settings = await getSettings();
    } catch (error) {
      console.error('Error fetching settings for AI:', error);
      settings = {};
    }
    const displayCurrency = settings.defaultCurrency || 'USD';
    const toneInstructions = getToneInstructions((settings.aiTone as 'friendly' | 'professional' | 'direct' | 'harsh') || 'professional');

    const converted = await convertFinancialDataToCurrency(financialData, displayCurrency);
    const symbol = getCurrencySymbol(displayCurrency);

    const safeMemories = filterMemoriesForPrompt(memories);
    const memoryBlock = formatMemoryBlock(safeMemories);

    const systemPrompt = `You are a financial planning assistant for the Penny app. Provide general informational guidance based on the user's data.
Do not present yourself as a licensed advisor and do not provide legal, medical, or tax advice. Include a brief disclaimer when appropriate.
Avoid asking for or inferring sensitive personal data beyond what is provided. If the user requests something that requires a professional, recommend consulting a qualified expert.

CURRENCY: All amounts below are in ${displayCurrency} (${symbol}). Always use this currency and symbol when stating or discussing amounts in your answers.

TONE AND COMMUNICATION STYLE:
${toneInstructions}

${memoryBlock ? `USER MEMORY (use only when relevant, do not mention it explicitly):\n${memoryBlock}\n` : ''}

Financial Summary:
- Net Worth: ${symbol}${converted.totalBalance.toFixed(2)}
- Monthly Income: ${symbol}${converted.monthlyIncome.toFixed(2)}
- Monthly Expenses: ${symbol}${converted.monthlyExpenses.toFixed(2)}
- Available: ${symbol}${(converted.monthlyIncome - converted.monthlyExpenses).toFixed(2)}

Accounts (${financialData.accounts.length}):
${financialData.accounts.map(acc => `  - ${acc.name} (${acc.type}): ${symbol}${(converted.accountBalances.get(acc.id) ?? 0).toFixed(2)}`).join('\n')}

Recent Transactions (last 10):
${financialData.transactions.slice(0, 10).map(t => {
  const amount = converted.transactionAmounts.get(t.id) ?? t.amount;
  return `  - ${t.type === 'income' ? '+' : '-'}${symbol}${amount.toFixed(2)} | ${t.category} | ${t.description || 'No description'}`;
}).join('\n')}

Budgets (in ${displayCurrency}):
${financialData.budgets.map(b => 
  `  - ${b.category}: ${symbol}${b.currentSpent.toFixed(2)} / ${symbol}${b.limit.toFixed(2)} (${((b.currentSpent / b.limit) * 100).toFixed(0)}%)`
).join('\n')}

Active Subscriptions:
${financialData.subscriptions.map(s => 
  `  - ${s.name}: ${symbol}${(converted.subscriptionAmounts.get(s.id) ?? s.amount).toFixed(2)}/${s.frequency}`
).join('\n')}

Provide a concise, helpful answer. If asked about purchasing something, analyze if they can afford it based on their current financial situation. You can reference previous conversation context when answering follow-up questions.`;

    // Convert conversation history and current question to Gemini format
    const contents = [
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: question }],
      },
    ];

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        contents,
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
      }
    );

    // Handle Gemini API response format
    if (response.data.candidates && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return candidate.content.parts[0].text;
      }
    }
    
    // Fallback if response structure is unexpected
    return 'Sorry, I received an unexpected response format. Please try again.';
  } catch (error: any) {
    // Avoid noisy red-console logs for expected network/API failures.
    // Keep the returned message user-friendly instead.
    const message = error?.message || 'Failed to get AI response';
    console.warn('AI Service Error:', message);
    
    // Handle Gemini API specific error format
    if (error.response?.data?.error) {
      const geminiError = error.response.data.error;
      return `Error: ${geminiError.message || geminiError.status || 'Failed to get AI response'}`;
    }

    // Axios "Network Error" is common on iOS if the device is offline / captive portal / DNS issues.
    if (message === 'Network Error') {
      return 'Error: Network unavailable. Please check your internet connection and try again.';
    }
    
    return `Error: ${error.message || 'Failed to get AI response'}`;
  }
};

export const canAffordPurchase = async (amount: number, description?: string): Promise<string> => {
  const { getSettings } = await import('./settingsService');
  const settings = await getSettings().catch((): { defaultCurrency?: string } => ({}));
  const displayCurrency = settings?.defaultCurrency || 'USD';
  const symbol = getCurrencySymbol(displayCurrency);
  const question = description
    ? `Can I afford to buy ${description} for ${symbol}${amount.toFixed(2)}?`
    : `Can I afford a purchase of ${symbol}${amount.toFixed(2)}?`;
  return askAI(question);
};
