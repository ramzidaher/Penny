import axios from 'axios';
import { Account, Transaction, Budget, Subscription } from '../database/schema';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

interface FinancialData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

const getFinancialData = async (period: 'week' | 'month' | 'year' | 'all' = 'month'): Promise<FinancialData> => {
  const { getAccounts, getTransactions, getBudgets, getSubscriptions } = await import('../database/db');
  const { filterTransactionsByPeriod } = await import('../utils/transactionFilters');
  
  const accounts = await getAccounts();
  const allTransactions = await getTransactions();
  const budgets = await getBudgets();
  const subscriptions = await getSubscriptions();

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  
  // Filter transactions by period (default to monthly for AI context)
  const filteredData = filterTransactionsByPeriod(allTransactions, period);

  return {
    accounts,
    transactions: filteredData.transactions,
    budgets,
    subscriptions,
    totalBalance,
    monthlyIncome: filteredData.income,
    monthlyExpenses: filteredData.expenses,
  };
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const getToneInstructions = (tone: 'friendly' | 'professional' | 'direct' | 'harsh'): string => {
  switch (tone) {
    case 'friendly':
      return "Be warm, encouraging, and supportive. Use a gentle, friendly tone. Be empathetic and understanding. Use positive language and offer encouragement.";
    case 'professional':
      return "Be formal, measured, and professional. Use clear, business-appropriate language. Be concise and objective. Maintain a calm, professional demeanor.";
    case 'direct':
      return "Be straightforward and no-nonsense. Speak casually and directly, no sugar-coating. Be honest and to the point. Use casual, conversational language.";
    case 'harsh':
      return "Be brutally honest and use strong language including swear words when appropriate. Be harsh but helpful - tough love approach. Use casual, edgy language. Don't hold back - tell it like it is. Use profanity when it emphasizes your point or when the user is making a bad financial decision.";
    default:
      return "Be professional and helpful.";
  }
};

export const askAI = async (question: string, conversationHistory: Message[] = [], period: 'week' | 'month' | 'year' | 'all' = 'month'): Promise<string> => {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Please add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.';
  }

  try {
    const financialData = await getFinancialData(period);
    
    // Get user settings to determine AI tone
    let toneInstructions = '';
    try {
      const { getSettings } = await import('./settingsService');
      const settings = await getSettings();
      toneInstructions = getToneInstructions(settings.aiTone || 'professional');
    } catch (error) {
      console.error('Error fetching settings for AI tone:', error);
      // Default to professional if settings can't be loaded
      toneInstructions = getToneInstructions('professional');
    }
    
    const systemPrompt = `You are a financial advisor AI assistant for Penny app. Analyze the following financial data and answer the user's question.

TONE AND COMMUNICATION STYLE:
${toneInstructions}

Financial Summary:
- Total Balance: $${financialData.totalBalance.toFixed(2)}
- Monthly Income: $${financialData.monthlyIncome.toFixed(2)}
- Monthly Expenses: $${financialData.monthlyExpenses.toFixed(2)}
- Available: $${(financialData.monthlyIncome - financialData.monthlyExpenses).toFixed(2)}

Accounts (${financialData.accounts.length}):
${financialData.accounts.map(acc => `  - ${acc.name} (${acc.type}): $${(acc.balance ?? 0).toFixed(2)}`).join('\n')}

Recent Transactions (last 10):
${financialData.transactions.slice(0, 10).map(t => 
  `  - ${t.type === 'income' ? '+' : '-'}$${t.amount.toFixed(2)} | ${t.category} | ${t.description || 'No description'}`
).join('\n')}

Budgets:
${financialData.budgets.map(b => 
  `  - ${b.category}: $${b.currentSpent.toFixed(2)} / $${b.limit.toFixed(2)} (${((b.currentSpent / b.limit) * 100).toFixed(0)}%)`
).join('\n')}

Active Subscriptions:
${financialData.subscriptions.map(s => 
  `  - ${s.name}: $${s.amount.toFixed(2)}/${s.frequency}`
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
      `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
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
  const question = description 
    ? `Can I afford to buy ${description} for $${amount.toFixed(2)}?`
    : `Can I afford a purchase of $${amount.toFixed(2)}?`;
  
  return askAI(question);
};
