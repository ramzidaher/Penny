import axios from 'axios';
import { Account, Transaction, Budget, Subscription } from '../database/schema';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

interface FinancialData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  subscriptions: Subscription[];
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

const getFinancialData = async (): Promise<FinancialData> => {
  const { getAccounts, getTransactions, getBudgets, getSubscriptions } = await import('../database/db');
  
  const accounts = await getAccounts();
  const transactions = await getTransactions();
  const budgets = await getBudgets();
  const subscriptions = await getSubscriptions();

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  const monthlyTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date >= startOfMonth && date <= endOfMonth;
  });
  
  const monthlyIncome = monthlyTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const monthlyExpenses = monthlyTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    accounts,
    transactions: monthlyTransactions,
    budgets,
    subscriptions,
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
  };
};

export const askAI = async (question: string): Promise<string> => {
  if (!OPENAI_API_KEY) {
    return 'OpenAI API key not configured. Please add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.';
  }

  try {
    const financialData = await getFinancialData();
    
    const prompt = `You are a financial advisor AI assistant for Penny app. Analyze the following financial data and answer the user's question.

Financial Summary:
- Total Balance: $${financialData.totalBalance.toFixed(2)}
- Monthly Income: $${financialData.monthlyIncome.toFixed(2)}
- Monthly Expenses: $${financialData.monthlyExpenses.toFixed(2)}
- Available: $${(financialData.monthlyIncome - financialData.monthlyExpenses).toFixed(2)}

Accounts (${financialData.accounts.length}):
${financialData.accounts.map(acc => `  - ${acc.name} (${acc.type}): $${acc.balance.toFixed(2)}`).join('\n')}

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

User Question: ${question}

Provide a concise, helpful answer. If asked about purchasing something, analyze if they can afford it based on their current financial situation. Be direct and practical.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful financial advisor AI assistant. Provide clear, practical financial advice based on the user\'s financial data.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error('AI Service Error:', error);
    return `Error: ${error.response?.data?.error?.message || error.message || 'Failed to get AI response'}`;
  }
};

export const canAffordPurchase = async (amount: number, description?: string): Promise<string> => {
  const question = description 
    ? `Can I afford to buy ${description} for $${amount.toFixed(2)}?`
    : `Can I afford a purchase of $${amount.toFixed(2)}?`;
  
  return askAI(question);
};








