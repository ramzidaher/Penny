export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'card' | 'cash' | 'investment';
  balance?: number; // Optional: only set for manual accounts, TrueLayer accounts fetch on-demand
  currency: string;
  // Card-specific fields (only used when type === 'card')
  linkedAccountId?: string; // The bank account this card is linked to
  cardNumber?: string; // Full card number (stored securely, not displayed)
  cardPin?: string; // Last 4 digits of card (for display)
  cardLogo?: string; // Bank/issuer name for logo display
  // TrueLayer-specific fields
  truelayerConnectionId?: string; // ID to track which TrueLayer connection
  truelayerAccountId?: string; // TrueLayer's account ID
  truelayerProviderName?: string; // Provider name from TrueLayer (e.g., "SANTANDER", "HSBC")
  isSynced?: boolean; // Whether account is synced from TrueLayer
  lastSyncedAt?: string; // Last sync timestamp
  truelayerAccountType?: string; // Account type from TrueLayer (savings, current, etc.)
  // Plaid-specific fields (synced accounts)
  plaidItemId?: string; // Plaid item_id
  plaidAccountId?: string; // Plaid account_id
  plaidInstitutionId?: string; // metadata.institution.id
  plaidInstitutionName?: string; // metadata.institution.name
  plaidAccountType?: string; // Plaid account.type (depository, credit, etc.)
  plaidAccountSubtype?: string; // Plaid account.subtype (checking, savings, etc.)
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
  plaidTransactionId?: string;
  plaidAccountId?: string;
  plaidItemId?: string;
  merchantLogoUrl?: string; // Plaid merchant logo URL when synced from Plaid
  subscriptionId?: string; // Link to subscription if this transaction is a subscription payment
  debtId?: string; // Link to debt if this transaction is a debt payment
  budgetId?: string; // Link to budget if this transaction is explicitly linked to a budget
  descriptionHash?: string; // SHA-256 hash of raw description for GDPR compliance and transaction matching
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
  /** User-facing label to differentiate same merchant (e.g. "Uber One", "Uber Eats") */
  label?: string;
  /** When true, exclude from duplicate grouping (user confirmed "different services") */
  isDifferentService?: boolean;
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  title: string; // First message or user-provided title
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export type MemoryTier = 'core' | 'dynamic' | 'session';
export type MemoryStatus = 'active' | 'paused';
export type MemorySource = 'user' | 'assistant' | 'pattern' | 'system';
export type MemoryConfidence = 'low' | 'medium' | 'high';
export type MemoryCategory =
  | 'income'
  | 'household'
  | 'housing'
  | 'goals'
  | 'risk'
  | 'preferences'
  | 'constraints'
  | 'situation'
  | 'spending'
  | 'employment'
  | 'debt'
  | 'savings'
  | 'budgeting'
  | 'health'
  | 'legal'
  | 'family'
  | 'other';export interface UserMemory {
  id: string;
  tier: MemoryTier;
  category: MemoryCategory;
  title: string;
  detail: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  status: MemoryStatus;
  isConfirmed: boolean;
  requiresReview: boolean;
  tags?: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}
