/**
 * Category Service - Smart Categorization with Learning
 * 
 * Provides intelligent category suggestions based on:
 * - Transaction description patterns
 * - User's historical categorizations (learned patterns)
 * - Subscription matching
 * - Merchant name recognition
 * 
 * Security:
 * - No sensitive data in logs
 * - Learning data stored per-user in Firestore
 * - User data isolation enforced
 */

import {
  getCategoriesByType,
  getCategoryMetadata,
  detectCategoryType,
  getDefaultCategory,
  canCategoryBeType,
  TransactionType,
  CategoryMetadata
} from '../utils/categories';
import { Transaction, Subscription, Debt } from '../database/schema';
import { getFirestoreDb, getUserId, isFirebaseAvailable } from './firebase';
import { collection, doc, getDoc, setDoc, getDocs, query, where } from 'firebase/firestore';

interface CategoryPattern {
  pattern: string; // Description pattern or merchant name
  category: string;
  type: TransactionType;
  confidence: number; // 0-1, how confident we are in this match
  count: number; // How many times user has used this pattern
}

interface UserCategoryLearning {
  patterns: CategoryPattern[];
  lastUpdated: string;
}

// Extract merchant/company name from description
const extractMerchantName = (description: string): string | null => {
  if (!description) return null;
  
  // Remove common prefixes
  const cleanDesc = description
    .replace(/^Subscription:\s*/i, '')
    .replace(/^Payment\s+to\s+/i, '')
    .replace(/^Purchase\s+at\s+/i, '')
    .trim();
  
  // Extract first meaningful word/phrase (usually merchant name)
  const parts = cleanDesc.split(/[,\s-]/);
  if (parts.length > 0 && parts[0].length > 2) {
    return parts[0].trim();
  }
  
  return null;
};

// Pattern matching for common merchants/descriptions
const getPatternMatch = (description: string, type: TransactionType): CategoryMetadata | null => {
  if (!description) return null;
  
  const lowerDesc = description.toLowerCase();
  const categories = getCategoriesByType(type);
  
  // Food & Dining patterns
  if (lowerDesc.includes('restaurant') || lowerDesc.includes('cafe') ||
      lowerDesc.includes('starbucks') || lowerDesc.includes('mcdonald') ||
      lowerDesc.includes('uber eats') || lowerDesc.includes('doordash') ||
      lowerDesc.includes('food') || lowerDesc.includes('dining')) {
    return categories.find(c => c.name === 'Food & Dining') || null;
  }
  
  // Shopping patterns
  if (lowerDesc.includes('amazon') || lowerDesc.includes('target') ||
      lowerDesc.includes('walmart') || lowerDesc.includes('store') ||
      lowerDesc.includes('shop') || lowerDesc.includes('retail')) {
    return categories.find(c => c.name === 'Shopping') || null;
  }
  
  // Transport patterns
  if (lowerDesc.includes('uber') || lowerDesc.includes('lyft') ||
      lowerDesc.includes('taxi') || lowerDesc.includes('gas') ||
      lowerDesc.includes('fuel') || lowerDesc.includes('parking') ||
      lowerDesc.includes('metro') || lowerDesc.includes('transit')) {
    return categories.find(c => c.name === 'Transport') || null;
  }
  
  // Subscription patterns
  if (lowerDesc.includes('subscription') || lowerDesc.includes('netflix') ||
      lowerDesc.includes('spotify') || lowerDesc.includes('apple music') ||
      lowerDesc.includes('disney') || lowerDesc.includes('hulu') ||
      lowerDesc.includes('prime') || lowerDesc.includes('hbo')) {
    return categories.find(c => c.name === 'Subscription') || null;
  }
  
  // Bills & Utilities patterns
  if (lowerDesc.includes('electric') || lowerDesc.includes('water') ||
      lowerDesc.includes('internet') || lowerDesc.includes('phone') ||
      lowerDesc.includes('utility') || lowerDesc.includes('bill')) {
    return categories.find(c => c.name === 'Bills & Utilities') || null;
  }
  
  // Entertainment patterns
  if (lowerDesc.includes('movie') || lowerDesc.includes('concert') ||
      lowerDesc.includes('theater') || lowerDesc.includes('game') ||
      lowerDesc.includes('entertainment')) {
    return categories.find(c => c.name === 'Entertainment') || null;
  }
  
  // Healthcare patterns
  if (lowerDesc.includes('doctor') || lowerDesc.includes('pharmacy') ||
      lowerDesc.includes('hospital') || lowerDesc.includes('medical') ||
      lowerDesc.includes('cvs') || lowerDesc.includes('walgreens') ||
      lowerDesc.includes('health')) {
    return categories.find(c => c.name === 'Healthcare') || null;
  }
  
  // Income patterns
  if (lowerDesc.includes('salary') || lowerDesc.includes('paycheck') ||
      lowerDesc.includes('payment received') || lowerDesc.includes('deposit')) {
    return categories.find(c => c.name === 'Salary') || null;
  }
  
  return null;
};

// Load user's learned patterns from Firestore
const loadUserPatterns = async (): Promise<CategoryPattern[]> => {
  if (!isFirebaseAvailable()) {
    return [];
  }
  
  try {
    const db = getFirestoreDb();
    const userId = getUserId();
    
    if (!db || !userId) {
      return [];
    }
    
    const learningRef = doc(db, `users/${userId}/categoryLearning/patterns`);
    const learningSnap = await getDoc(learningRef);
    
    if (learningSnap.exists()) {
      const data = learningSnap.data() as UserCategoryLearning;
      return data.patterns || [];
    }
    
    return [];
  } catch (error) {
    // Log error but don't throw - learning is optional
    console.error('[categoryService] Error loading user patterns');
    return [];
  }
};

// Save user's learned patterns to Firestore
const saveUserPattern = async (pattern: CategoryPattern): Promise<void> => {
  if (!isFirebaseAvailable()) {
    return;
  }
  
  try {
    const db = getFirestoreDb();
    const userId = getUserId();
    
    if (!db || !userId) {
      return;
    }
    
    const existingPatterns = await loadUserPatterns();
    
    // Check if pattern already exists
    const existingIndex = existingPatterns.findIndex(
      p => p.pattern.toLowerCase() === pattern.pattern.toLowerCase() && p.type === pattern.type
    );
    
    if (existingIndex >= 0) {
      // Update existing pattern: increase count and adjust confidence
      existingPatterns[existingIndex].count += 1;
      existingPatterns[existingIndex].confidence = Math.min(1.0, existingPatterns[existingIndex].confidence + 0.1);
      existingPatterns[existingIndex].category = pattern.category;
    } else {
      // Add new pattern
      existingPatterns.push(pattern);
    }
    
    // Save to Firestore
    const learningRef = doc(db, `users/${userId}/categoryLearning/patterns`);
    await setDoc(learningRef, {
      patterns: existingPatterns,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    // Log error but don't throw - learning is optional
    console.error('[categoryService] Error saving user pattern');
  }
};

// Match transaction description against subscription names
// Returns both category and subscription ID if match found
const matchSubscription = async (description: string): Promise<{ category: string; subscriptionId?: string } | null> => {
  if (!isFirebaseAvailable()) {
    return null;
  }
  
  try {
    const { getSubscriptions } = await import('../database/db');
    const subscriptions = await getSubscriptions();
    
    const merchantName = extractMerchantName(description);
    if (!merchantName) return null;
    
    // Check if any subscription name matches
    const matchingSubscription = subscriptions.find(sub => {
      const subNameLower = sub.name.toLowerCase();
      const merchantLower = merchantName.toLowerCase();
      return subNameLower.includes(merchantLower) || merchantLower.includes(subNameLower);
    });
    
    if (matchingSubscription) {
      return {
        category: 'Subscription',
        subscriptionId: matchingSubscription.id,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[categoryService] Error matching subscription');
    return null;
  }
};

// Match transaction description against debt names
// Returns debt ID if match found
const matchDebt = async (description: string, category: string): Promise<string | null> => {
  if (!isFirebaseAvailable()) {
    return null;
  }
  
  try {
    const { getDebts } = await import('../database/db');
    const debts = await getDebts();
    
    const merchantName = extractMerchantName(description);
    if (!merchantName) return null;
    
    // Check if any debt name matches and category matches debt's budgetCategory
    const matchingDebt = debts.find(debt => {
      const debtNameLower = debt.name.toLowerCase();
      const merchantLower = merchantName.toLowerCase();
      const nameMatches = debtNameLower.includes(merchantLower) || merchantLower.includes(debtNameLower);
      const categoryMatches = debt.budgetCategory && debt.budgetCategory === category;
      return nameMatches && categoryMatches;
    });
    
    if (matchingDebt) {
      return matchingDebt.id;
    }
    
    return null;
  } catch (error) {
    console.error('[categoryService] Error matching debt');
    return null;
  }
};

/**
 * Suggest category for a transaction
 */
export const suggestCategory = async (
  description: string,
  type: TransactionType,
  amount?: number
): Promise<{ category: string; confidence: number; subscriptionId?: string; debtId?: string }> => {
  if (!description) {
    return { category: getDefaultCategory(type), confidence: 0.1, subscriptionId: undefined, debtId: undefined };
  }
  
  // 1. Check user's learned patterns (highest priority)
  const userPatterns = await loadUserPatterns();
  const matchingPattern = userPatterns.find(p => {
    const patternLower = p.pattern.toLowerCase();
    const descLower = description.toLowerCase();
    return descLower.includes(patternLower) || patternLower.includes(descLower);
  });
  
  if (matchingPattern && matchingPattern.type === type) {
    // Check if this category matches a debt
    const debtId = await matchDebt(description, matchingPattern.category);
    return {
      category: matchingPattern.category,
      confidence: matchingPattern.confidence,
      subscriptionId: undefined,
      debtId: debtId || undefined,
    };
  }
  
  // 2. Check subscription matching
  const subscriptionMatch = await matchSubscription(description);
  if (subscriptionMatch) {
    return { 
      category: subscriptionMatch.category, 
      confidence: 0.9,
      subscriptionId: subscriptionMatch.subscriptionId,
      debtId: undefined,
    };
  }
  
  // 3. Pattern matching for common merchants
  const patternMatch = getPatternMatch(description, type);
  if (patternMatch) {
    // Check if this category matches a debt
    const debtId = await matchDebt(description, patternMatch.name);
    return { 
      category: patternMatch.name, 
      confidence: 0.7,
      subscriptionId: undefined,
      debtId: debtId || undefined,
    };
  }
  
  // 4. Default category
  return { category: getDefaultCategory(type), confidence: 0.1, subscriptionId: undefined, debtId: undefined };
};

/**
 * Learn from user's categorization choice
 */
export const learnFromCategorization = async (
  description: string,
  category: string,
  type: TransactionType
): Promise<void> => {
  if (!description) return;
  // Only learn valid category+type pairs to avoid reinforcing wrong mappings
  if (!canCategoryBeType(category.trim(), type)) return;

  const merchantName = extractMerchantName(description);
  const pattern = merchantName || description.substring(0, 50).toLowerCase();

  const categoryPattern: CategoryPattern = {
    pattern,
    category,
    type,
    confidence: 0.5, // Start with medium confidence
    count: 1,
  };
  
  await saveUserPattern(categoryPattern);
};

/**
 * Get suggested categories for a transaction type
 * Returns categories sorted by relevance
 */
export const getSuggestedCategories = (type: TransactionType): CategoryMetadata[] => {
  return getCategoriesByType(type);
};

