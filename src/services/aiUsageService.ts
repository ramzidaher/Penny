import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ai_weekly_usage_v1';

interface WeeklyUsage {
  weekStart: string;
  count: number;
}

const getWeekStart = (date: Date = new Date()): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
};

const readUsage = async (): Promise<WeeklyUsage> => {
  const weekStart = getWeekStart();
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { weekStart, count: 0 };
  }
  try {
    const parsed = JSON.parse(stored) as WeeklyUsage;
    if (parsed.weekStart !== weekStart) {
      return { weekStart, count: 0 };
    }
    return parsed;
  } catch {
    return { weekStart, count: 0 };
  }
};

const writeUsage = async (usage: WeeklyUsage) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
};

export const getWeeklyUsage = async (): Promise<WeeklyUsage> => {
  return readUsage();
};

export const incrementWeeklyUsage = async (): Promise<number> => {
  const usage = await readUsage();
  const next = { ...usage, count: usage.count + 1 };
  await writeUsage(next);
  return next.count;
};

export const getWeeklyUsageStatus = async (limit: number) => {
  const usage = await readUsage();
  const remaining = Math.max(limit - usage.count, 0);
  return {
    count: usage.count,
    remaining,
    allowed: usage.count < limit,
    weekStart: usage.weekStart,
  };
};

