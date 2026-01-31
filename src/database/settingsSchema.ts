export interface AppSettings {
  id: string;
  userId: string;
  // Currency settings
  defaultCurrency: string;
  // Reminder settings
  lowBalanceThreshold: number;
  enableLowBalanceAlerts: boolean;
  enableDailyReminders: boolean;
  dailyReminderTime: string; // HH:mm format
  enableSubscriptionReminders: boolean;
  subscriptionReminderDays: number[]; // [3, 1, 0] means 3 days before, 1 day before, and on the day
  enableBudgetAlerts: boolean;
  budgetAlertThresholds: number[]; // [80, 90, 100] means alert at 80%, 90%, and 100%
  // Notification settings
  enableNotifications: boolean;
  enableSound: boolean;
  enableBadge: boolean;
  // Security settings
  enableBiometric: boolean;
  // AI settings
  aiTone: 'friendly' | 'professional' | 'direct' | 'harsh';
  // Transaction preferences
  swipeDirection: 'right-income-left-expense' | 'right-expense-left-income';
  // Other settings
  theme: 'light' | 'dark' | 'auto';
  // Appearance (accent color)
  accentMode: 'preset' | 'custom';
  accentPresetId: string; // e.g. "midnight", "ocean"
  accentCustomHex: string; // #RRGGBB
  createdAt: string;
  updatedAt: string;
}

export const defaultSettings: Omit<AppSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  // Default to GBP for UK-first product/demo.
  defaultCurrency: 'GBP',
  lowBalanceThreshold: 100,
  enableLowBalanceAlerts: true,
  enableDailyReminders: true,
  dailyReminderTime: '09:00',
  enableSubscriptionReminders: true,
  subscriptionReminderDays: [3, 1, 0],
  enableBudgetAlerts: true,
  budgetAlertThresholds: [80, 90, 100],
  enableNotifications: true,
  enableSound: true,
  enableBadge: true,
  enableBiometric: false,
  aiTone: 'professional',
  swipeDirection: 'right-income-left-expense',
  theme: 'light',
  accentMode: 'preset',
  accentPresetId: 'midnight',
  accentCustomHex: '#121212',
};











