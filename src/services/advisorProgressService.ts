import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { getFirestoreDb, getUserId, isFirebaseAvailable, waitForFirebase } from './firebase';
import { Account, Transaction, Budget, Subscription } from '../database/schema';
import { generateAdvisorMissions, AdvisorMission } from '../utils/advisorMissions';

export interface AdvisorBadge {
  id: string;
  earnedAt: string; // ISO
}

export interface AdvisorProgress {
  id: string; // 'main'
  userId: string;
  xp: number;
  level: number;
  streakCount: number;
  lastCheckInDate?: string; // YYYY-MM-DD
  badges: AdvisorBadge[];
  missions: AdvisorMission[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

const isoNow = () => new Date().toISOString();
const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
};

const xpToLevel = (xp: number) => Math.max(1, Math.floor(xp / 100) + 1);

let cachedProgress: AdvisorProgress | null = null;

const loadDataForMissions = async () => {
  const { getAccounts, getTransactions, getBudgets, getSubscriptions } = await import('../database/db');
  const [accounts, transactions, budgets, subscriptions] = await Promise.all([
    getAccounts(),
    getTransactions(),
    getBudgets(),
    getSubscriptions(),
  ]);

  return { accounts, transactions, budgets, subscriptions };
};

export const getAdvisorProgress = async (): Promise<AdvisorProgress> => {
  await waitForFirebase();
  if (!isFirebaseAvailable()) throw new Error('Firebase is not available');

  const userId = getUserId();
  if (!userId) throw new Error('User not authenticated');

  if (cachedProgress) return cachedProgress;

  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore database not initialized');

  const ref = doc(db, `users/${userId}/advisorProgress`, 'main');
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() as any;
    const progress: AdvisorProgress = {
      id: snap.id,
      userId,
      xp: data.xp ?? 0,
      level: data.level ?? xpToLevel(data.xp ?? 0),
      streakCount: data.streakCount ?? 0,
      lastCheckInDate: data.lastCheckInDate,
      badges: (data.badges ?? []) as AdvisorBadge[],
      missions: (data.missions ?? []) as AdvisorMission[],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || isoNow()),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || isoNow()),
    };

    cachedProgress = progress;
    return progress;
  }

  // Create default
  const now = isoNow();
  const { accounts, transactions, budgets, subscriptions } = await loadDataForMissions();
  const missions = generateAdvisorMissions({ accounts, transactions, budgets, subscriptions, today: todayKey() });

  const progress: AdvisorProgress = {
    id: 'main',
    userId,
    xp: 0,
    level: 1,
    streakCount: 0,
    lastCheckInDate: undefined,
    badges: [],
    missions,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, {
    xp: progress.xp,
    level: progress.level,
    streakCount: progress.streakCount,
    lastCheckInDate: progress.lastCheckInDate,
    badges: progress.badges,
    missions: progress.missions,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  cachedProgress = progress;
  return progress;
};

const saveAdvisorProgress = async (progress: AdvisorProgress): Promise<void> => {
  await waitForFirebase();
  if (!isFirebaseAvailable()) throw new Error('Firebase is not available');

  const userId = getUserId();
  if (!userId) throw new Error('User not authenticated');

  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore database not initialized');

  const ref = doc(db, `users/${userId}/advisorProgress`, 'main');
  await setDoc(
    ref,
    {
      xp: progress.xp,
      level: progress.level,
      streakCount: progress.streakCount,
      lastCheckInDate: progress.lastCheckInDate ?? null,
      badges: progress.badges,
      missions: progress.missions,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  cachedProgress = progress;
};

export const refreshDailyMissionsIfNeeded = async (): Promise<AdvisorProgress> => {
  const progress = await getAdvisorProgress();
  const today = todayKey();

  const hasTodayMissions = progress.missions.some(m => m.expiresOn === today);
  if (hasTodayMissions) return progress;

  const { accounts, transactions, budgets, subscriptions } = await loadDataForMissions();
  const missions = generateAdvisorMissions({ accounts, transactions, budgets, subscriptions, today });

  const updated: AdvisorProgress = {
    ...progress,
    missions,
    updatedAt: isoNow(),
  };
  await saveAdvisorProgress(updated);
  return updated;
};

export const awardAdvisorXp = async (xpDelta: number): Promise<AdvisorProgress> => {
  const progress = await getAdvisorProgress();
  const xp = Math.max(0, (progress.xp || 0) + xpDelta);
  const level = xpToLevel(xp);

  const updated: AdvisorProgress = {
    ...progress,
    xp,
    level,
    updatedAt: isoNow(),
  };
  await saveAdvisorProgress(updated);
  return updated;
};

const ensureBadge = (progress: AdvisorProgress, badgeId: string): AdvisorProgress => {
  if (progress.badges.some(b => b.id === badgeId)) return progress;
  return {
    ...progress,
    badges: [...progress.badges, { id: badgeId, earnedAt: isoNow() }],
  };
};

export const checkInToday = async (): Promise<AdvisorProgress> => {
  let progress = await getAdvisorProgress();
  const today = todayKey();

  if (progress.lastCheckInDate === today) {
    // Still refresh missions (if needed) but don’t double-award.
    return await refreshDailyMissionsIfNeeded();
  }

  const nextStreak = progress.lastCheckInDate === yesterdayKey() ? (progress.streakCount || 0) + 1 : 1;
  progress = {
    ...progress,
    lastCheckInDate: today,
    streakCount: nextStreak,
    updatedAt: isoNow(),
  };

  // Streak badges
  if (nextStreak >= 3) progress = ensureBadge(progress, 'streak_3');
  if (nextStreak >= 7) progress = ensureBadge(progress, 'streak_7');
  if (nextStreak >= 14) progress = ensureBadge(progress, 'streak_14');

  // Award XP for check-in
  progress = {
    ...progress,
    xp: (progress.xp || 0) + 20,
  };
  progress.level = xpToLevel(progress.xp);

  await saveAdvisorProgress(progress);
  return await refreshDailyMissionsIfNeeded();
};

export const completeMission = async (missionId: string): Promise<AdvisorProgress> => {
  let progress = await getAdvisorProgress();
  const now = isoNow();

  const missions = progress.missions.map(m => {
    if (m.id !== missionId) return m;
    if (m.completedAt) return m;
    return { ...m, completedAt: now };
  });

  const completed = missions.find(m => m.id === missionId);
  const reward = completed?.completedAt ? (completed.rewardXp || 0) : 0;

  progress = {
    ...progress,
    missions,
    xp: (progress.xp || 0) + reward,
    updatedAt: now,
  };
  progress.level = xpToLevel(progress.xp);

  // Mission badges
  if (reward > 0) progress = ensureBadge(progress, 'first_mission');

  await saveAdvisorProgress(progress);
  return progress;
};

export const clearAdvisorProgressCache = () => {
  cachedProgress = null;
};

