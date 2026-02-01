import { addDays, addMonths, addWeeks } from 'date-fns';
import {
  MemoryCategory,
  MemoryConfidence,
  MemorySource,
  MemoryStatus,
  MemoryTier,
  Transaction,
  UserMemory,
} from '../database/schema';

export interface MemoryCandidate {
  tier: MemoryTier;
  category: MemoryCategory;
  title: string;
  detail: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  status?: MemoryStatus;
  isConfirmed?: boolean;
  requiresReview?: boolean;
  expiresAt?: string;
  tags?: string[];
}

export interface MemoryDraft {
  tier: MemoryTier;
  category: MemoryCategory;
  title: string;
  detail: string;
  confidence?: MemoryConfidence;
  status?: MemoryStatus;
  expiresAt?: string;
  requiresReview?: boolean;
  isConfirmed?: boolean;
  tags?: string[];
}

const SENSITIVE_CATEGORIES = new Set<MemoryCategory>(['health', 'legal', 'family']);
const DEFAULT_DYNAMIC_DAYS = 60;
const DEFAULT_SESSION_DAYS = 7;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, ' ');

const bandAmount = (amount: number): string => {
  const bands = [0, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (let i = 0; i < bands.length - 1; i += 1) {
    if (amount >= bands[i] && amount < bands[i + 1]) {
      return `$${bands[i].toLocaleString()}-$${bands[i + 1].toLocaleString()}`;
    }
  }
  const last = bands[bands.length - 1];
  return `$${last.toLocaleString()}+`;
};

const scrubSensitiveText = (value: string): string => {
  let text = value;
  text = text.replace(/\b\d{8,}\b/g, '••••');
  text = text.replace(/\$[\d,]+(?:\.\d{1,2})?/g, (match) => {
    const raw = match.replace(/[$,]/g, '');
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return '$0-$0';
    return bandAmount(parsed);
  });
  return text;
};

const applySafetyDefaults = (candidate: MemoryCandidate): MemoryCandidate => {
  const requiresReview = candidate.requiresReview ?? SENSITIVE_CATEGORIES.has(candidate.category);
  return {
    ...candidate,
    title: scrubSensitiveText(normalizeWhitespace(candidate.title)),
    detail: scrubSensitiveText(normalizeWhitespace(candidate.detail)),
    requiresReview,
    isConfirmed: candidate.isConfirmed ?? !requiresReview,
    status: candidate.status ?? 'active',
    expiresAt:
      candidate.tier === 'dynamic'
        ? candidate.expiresAt ?? addDays(new Date(), DEFAULT_DYNAMIC_DAYS).toISOString()
        : candidate.tier === 'session'
          ? candidate.expiresAt ?? addDays(new Date(), DEFAULT_SESSION_DAYS).toISOString()
          : candidate.expiresAt,
  };
};

export const inferMemoriesFromMessage = (text: string): MemoryCandidate[] => {
  const normalized = normalizeWhitespace(text);
  const lower = normalized.toLowerCase();
  const now = new Date();
  const candidates: MemoryCandidate[] = [];

  const savingMatch = /saving for ([a-z\s]+?)\s+(?:in|within)\s+(\d+)\s*(weeks?|months?)/i.exec(normalized);
  if (savingMatch) {
    const goal = normalizeWhitespace(savingMatch[1]);
    const amount = parseInt(savingMatch[2], 10);
    const unit = savingMatch[3].toLowerCase();
    const expiresAt = unit.startsWith('week') ? addWeeks(now, amount) : addMonths(now, amount);
    candidates.push({
      tier: 'dynamic',
      category: 'goals',
      title: `Saving for ${goal}`,
      detail: `Target timeline: ${amount} ${unit}.`,
      source: 'user',
      confidence: 'high',
      expiresAt: expiresAt.toISOString(),
    });
  }

  const cutMatch = /cut(ting)?\s+(back|down)\s+on\s+([a-z\s]+)/i.exec(normalized);
  if (cutMatch) {
    const category = normalizeWhitespace(cutMatch[3]);
    candidates.push({
      tier: 'dynamic',
      category: 'spending',
      title: `Reduce ${category} spending`,
      detail: `Actively trying to cut ${category} this period.`,
      source: 'user',
      confidence: 'high',
      expiresAt: addMonths(now, 1).toISOString(),
    });
  }

  if (/(between jobs|unemployed|laid off|lost my job)/i.test(lower)) {
    candidates.push({
      tier: 'dynamic',
      category: 'employment',
      title: 'Between jobs',
      detail: 'Income is temporarily disrupted.',
      source: 'user',
      confidence: 'high',
      expiresAt: addDays(now, 90).toISOString(),
    });
  }

  if (/(planning (a )?wedding|getting married)/i.test(lower)) {
    candidates.push({
      tier: 'dynamic',
      category: 'situation',
      title: 'Planning a wedding',
      detail: 'Short-term spending priorities are wedding-related.',
      source: 'user',
      confidence: 'medium',
      expiresAt: addMonths(now, 6).toISOString(),
    });
  }

  if (/(unexpected medical|medical bills|hospital|surgery|treatment)/i.test(lower)) {
    candidates.push({
      tier: 'dynamic',
      category: 'health',
      title: 'Medical expenses',
      detail: 'Facing temporary medical-related costs.',
      source: 'user',
      confidence: 'medium',
    });
  }

  if (/(today|this week|right now|this month)/i.test(lower)) {
    candidates.push({
      tier: 'session',
      category: 'situation',
      title: 'Current focus',
      detail: 'Near-term focus mentioned in conversation.',
      source: 'assistant',
      confidence: 'low',
      expiresAt: addDays(now, 7).toISOString(),
    });
  }

  const dependentsMatch = /(\d+)\s+(kids|children|dependents)/i.exec(normalized);
  if (dependentsMatch) {
    const count = dependentsMatch[1];
    candidates.push({
      tier: 'core',
      category: 'household',
      title: 'Dependents',
      detail: `Has ${count} dependents.`,
      source: 'user',
      confidence: 'high',
    });
  }

  if (/(homeowner|mortgage)/i.test(lower)) {
    candidates.push({
      tier: 'core',
      category: 'housing',
      title: 'Homeowner',
      detail: 'Pays a mortgage.',
      source: 'user',
      confidence: 'medium',
    });
  } else if (/(renting|renter)/i.test(lower)) {
    candidates.push({
      tier: 'core',
      category: 'housing',
      title: 'Renter',
      detail: 'Pays rent.',
      source: 'user',
      confidence: 'medium',
    });
  }

  const riskMatch = /(risk\s+(averse|conservative|moderate|aggressive))/i.exec(lower);
  if (riskMatch) {
    const tolerance = riskMatch[1].replace('risk', '').trim();
    candidates.push({
      tier: 'core',
      category: 'risk',
      title: 'Risk tolerance',
      detail: `Prefers a ${tolerance} approach.`,
      source: 'user',
      confidence: 'high',
    });
  }

  if (/(retire|retirement)/i.test(lower)) {
    candidates.push({
      tier: 'core',
      category: 'goals',
      title: 'Retirement planning',
      detail: 'Long-term retirement focus.',
      source: 'user',
      confidence: 'medium',
    });
  }

  if (/(pay off|debt[-\s]?free)/i.test(lower)) {
    candidates.push({
      tier: 'core',
      category: 'goals',
      title: 'Debt payoff',
      detail: 'Prioritizes paying off debt.',
      source: 'user',
      confidence: 'medium',
    });
  }

  const incomeMatch = /(income|earn|make).{0,12}\$?([\d,]+)/i.exec(normalized);
  if (incomeMatch) {
    const amount = parseFloat(incomeMatch[2].replace(/,/g, ''));
    if (!Number.isNaN(amount)) {
      candidates.push({
        tier: 'core',
        category: 'income',
        title: 'Income range',
        detail: `Income band: ${bandAmount(amount)}.`,
        source: 'user',
        confidence: 'medium',
      });
    }
  }

  return candidates.map(applySafetyDefaults);
};

export const inferMemoriesFromTransactions = (transactions: Transaction[]): MemoryCandidate[] => {
  const now = new Date();
  const since = addDays(now, -30);
  const expenses = transactions.filter((t) => t.type === 'expense' && new Date(t.date) >= since);
  if (expenses.length === 0) return [];
  
  const totalsByCategory = new Map<string, number>();
  let total = 0;
  expenses.forEach((t) => {
    const amount = t.amount || 0;
    total += amount;
    const key = t.category || 'Other';
    totalsByCategory.set(key, (totalsByCategory.get(key) || 0) + amount);
  });
  
  if (total < 200) return [];
  
  let topCategory = '';
  let topAmount = 0;
  totalsByCategory.forEach((amount, category) => {
    if (amount > topAmount) {
      topAmount = amount;
      topCategory = category;
    }
  });
  
  const share = topAmount / total;
  if (!topCategory || share < 0.35 || topAmount < 200) return [];
  const pct = Math.round(share * 100 / 5) * 5;
  
  return [
    applySafetyDefaults({
      tier: 'dynamic',
      category: 'spending',
      title: `High ${topCategory} spend`,
      detail: `${topCategory} is about ${pct}% of recent expenses.`,
      source: 'pattern',
      confidence: 'medium',
      expiresAt: addMonths(now, 1).toISOString(),
    }),
  ];
};

export const getMemoryUpserts = (
  existing: UserMemory[],
  candidates: MemoryCandidate[]
): {
  toCreate: MemoryCandidate[];
  toUpdate: Array<{ id: string; updates: Partial<UserMemory> }>;
} => {
  const toCreate: MemoryCandidate[] = [];
  const toUpdate: Array<{ id: string; updates: Partial<UserMemory> }> = [];
  const normalizedCandidates = candidates.map(applySafetyDefaults);
  
  normalizedCandidates.forEach((candidate) => {
    const match = existing.find(
      (m) =>
        m.tier === candidate.tier &&
        m.category === candidate.category &&
        m.title.toLowerCase() === candidate.title.toLowerCase()
    );
    if (!match) {
      toCreate.push(candidate);
      return;
    }
    if (match.status === 'paused') {
      return;
    }
    const updates: Partial<UserMemory> = {};
    if (candidate.detail && candidate.detail !== match.detail) updates.detail = candidate.detail;
    if (candidate.confidence && candidate.confidence !== match.confidence) updates.confidence = candidate.confidence;
    if (candidate.expiresAt && candidate.expiresAt !== match.expiresAt) updates.expiresAt = candidate.expiresAt;
    if (candidate.requiresReview !== undefined && candidate.requiresReview !== match.requiresReview) {
      updates.requiresReview = candidate.requiresReview;
    }
    if (candidate.isConfirmed !== undefined && candidate.isConfirmed !== match.isConfirmed) {
      updates.isConfirmed = candidate.isConfirmed;
    }
    if (Object.keys(updates).length > 0) {
      toUpdate.push({ id: match.id, updates });
    }
  });
  
  return { toCreate, toUpdate };
};

export const buildMemoryInput = (
  candidate: MemoryCandidate,
  overrides?: Partial<Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'>>
): Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'> => {
  return {
    tier: candidate.tier,
    category: candidate.category,
    title: candidate.title,
    detail: candidate.detail,
    source: candidate.source,
    confidence: candidate.confidence,
    status: candidate.status ?? 'active',
    isConfirmed: candidate.isConfirmed ?? true,
    requiresReview: candidate.requiresReview ?? false,
    tags: candidate.tags ?? [],
    expiresAt: candidate.expiresAt,
    lastUsedAt: undefined,
    ...overrides,
  };
};

export const buildMemoryInputFromDraft = (
  draft: MemoryDraft,
  source: MemorySource = 'user'
): Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'> => {
  const candidate: MemoryCandidate = {
    tier: draft.tier,
    category: draft.category,
    title: draft.title,
    detail: draft.detail,
    source,
    confidence: draft.confidence ?? 'high',
    status: draft.status ?? 'active',
    isConfirmed: draft.isConfirmed ?? true,
    requiresReview: draft.requiresReview ?? false,
    expiresAt: draft.expiresAt,
    tags: draft.tags ?? [],
  };
  const safeCandidate = applySafetyDefaults(candidate);
  return buildMemoryInput(safeCandidate, { isConfirmed: true, requiresReview: false });
};

export const isMemoryExpired = (memory: UserMemory, now: Date = new Date()): boolean => {
  if (!memory.expiresAt) return false;
  return new Date(memory.expiresAt) < now;
};

export const filterMemoriesForPrompt = (memories: UserMemory[]): UserMemory[] => {
  const now = new Date();
  return memories.filter(
    (m) =>
      m.status === 'active' &&
      m.isConfirmed &&
      !m.requiresReview &&
      !isMemoryExpired(m, now)
  );
};

export const getExpiredMemories = (memories: UserMemory[]): UserMemory[] => {
  const now = new Date();
  return memories.filter((m) => isMemoryExpired(m, now));
};
