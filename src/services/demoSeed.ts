import { addAccount, addTransaction, getAccounts, getTransactions } from '../database/db';
import { isDemoUser } from './demoUser';
import { getSettings } from './settingsService';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../utils/categories';
import type { Account, Transaction } from '../database/schema';

const DEMO_ACCOUNT_PREFIX = 'Demo Bank';
const DEMO_TRANSACTION_PREFIX = 'Demo';
const DEMO_BANK_COUNT = 5;
const DEMO_TRANSACTION_COUNT = 100;

const DEMO_BANK_NAMES = [
  'Penny Savings',
  'Metro Capital',
  'Northshore Bank',
  'Summit Credit',
  'Harbor Financial',
];

const DEMO_MERCHANTS = [
  'Star Bean Cafe',
  'Green Grocer',
  'Metro Transit',
  'Bright Fitness',
  'Cloud Media',
  'City Pharmacy',
  'QuickFuel',
  'TechTown',
  'Fresh Market',
  'Luna Bistro',
  'Sunrise Utilities',
  'Book Harbor',
  'Riverside Hotel',
  'Skyline Airways',
  'HomeCraft',
];

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const randomAmount = (min: number, max: number): number => {
  const value = min + Math.random() * (max - min);
  return Math.round(value * 100) / 100;
};

const randomDateWithinDays = (daysBack: number): string => {
  const now = Date.now();
  const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - offset).toISOString();
};

const buildDemoAccount = (index: number, currency: string): Omit<Account, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: `${DEMO_ACCOUNT_PREFIX} ${index + 1} - ${DEMO_BANK_NAMES[index % DEMO_BANK_NAMES.length]}`,
  type: 'bank',
  currency,
  balance: Math.round((3500 + Math.random() * 12000) * 100) / 100,
});

const buildDemoTransaction = (
  accountId: string,
  type: 'income' | 'expense'
): Omit<Transaction, 'id' | 'createdAt'> => {
  const categoryOptions = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = pick(categoryOptions).name;
  const merchant = pick(DEMO_MERCHANTS);

  return {
    accountId,
    type,
    category,
    description: `${DEMO_TRANSACTION_PREFIX} - ${merchant}`,
    amount: type === 'income' ? randomAmount(450, 4200) : randomAmount(5, 280),
    date: randomDateWithinDays(120),
  };
};

export const ensureDemoSeeded = async (): Promise<void> => {
  if (!isDemoUser()) return;

  const [settings, existingAccounts, existingTransactions] = await Promise.all([
    getSettings(),
    getAccounts(),
    getTransactions(),
  ]);

  const demoAccounts = existingAccounts.filter(account =>
    account.name?.toLowerCase().startsWith(DEMO_ACCOUNT_PREFIX.toLowerCase())
  );
  const demoTransactions = existingTransactions.filter(txn =>
    txn.description?.toLowerCase().startsWith(DEMO_TRANSACTION_PREFIX.toLowerCase())
  );

  if (demoAccounts.length >= DEMO_BANK_COUNT && demoTransactions.length >= DEMO_TRANSACTION_COUNT) {
    return;
  }

  const currency = settings.defaultCurrency || 'GBP';
  const accountsToCreate = Math.max(0, DEMO_BANK_COUNT - demoAccounts.length);
  const createdAccountIds: string[] = [];

  for (let i = 0; i < accountsToCreate; i += 1) {
    const accountData = buildDemoAccount(demoAccounts.length + i, currency);
    const accountId = await addAccount(accountData);
    createdAccountIds.push(accountId);
  }

  const allDemoAccountIds = [
    ...demoAccounts.map(account => account.id),
    ...createdAccountIds,
  ];

  if (allDemoAccountIds.length === 0) return;

  const transactionsToCreate = Math.max(0, DEMO_TRANSACTION_COUNT - demoTransactions.length);
  const perAccount = Math.floor(transactionsToCreate / allDemoAccountIds.length);
  let remainder = transactionsToCreate % allDemoAccountIds.length;

  for (const accountId of allDemoAccountIds) {
    const count = perAccount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;

    for (let i = 0; i < count; i += 1) {
      const type: 'income' | 'expense' = Math.random() < 0.18 ? 'income' : 'expense';
      const transactionData = buildDemoTransaction(accountId, type);
      await addTransaction(transactionData);
    }
  }
};
