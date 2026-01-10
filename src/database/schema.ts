export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'card' | 'cash' | 'investment';
  balance: number;
  currency: string;
  // Card-specific fields (only used when type === 'card')
  linkedAccountId?: string; // The bank account this card is linked to
  cardNumber?: string; // Full card number (stored securely, not displayed)
  cardPin?: string; // Last 4 digits of card (for display)
  cardLogo?: string; // Bank/issuer name for logo display
  // TrueLayer-specific fields
  truelayerConnectionId?: string; // ID to track which TrueLayer connection
  truelayerAccountId?: string; // TrueLayer's account ID
  isSynced?: boolean; // Whether account is synced from TrueLayer
  lastSyncedAt?: string; // Last sync timestamp
  truelayerAccountType?: string; // Account type from TrueLayer (savings, current, etc.)
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  createdAt: string;
  truelayerTransactionId?: string;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  period: 'weekly' | 'monthly' | 'yearly';
  currentSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: 'monthly' | 'yearly' | 'weekly';
  nextBillingDate: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Debt {
  id: string;
  name: string;
  description: string;
  totalAmount: number;
  remainingAmount: number;
  interestRate?: number;
  minimumPayment?: number;
  dueDate: string;
  accountId?: string; // Account linked to this debt
  budgetCategory?: string; // Budget category this debt affects
  type: 'loan' | 'credit_card' | 'buy_now_pay_later' | 'personal' | 'other';
  status: 'active' | 'paid_off' | 'overdue';
  createdAt: string;
  updatedAt: string;
}

