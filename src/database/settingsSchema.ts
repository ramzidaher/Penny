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
  // Other settings
  theme: 'light' | 'dark' | 'auto';
  createdAt: string;
  updatedAt: string;
}

export const defaultSettings: Omit<AppSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  defaultCurrency: 'USD',
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
  theme: 'light',
};









