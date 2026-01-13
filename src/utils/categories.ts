import { Ionicons } from '@expo/vector-icons';

export type TransactionType = 'income' | 'expense';

export interface CategoryMetadata {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  defaultType: TransactionType;
  canBeBoth: boolean; // Whether this category can be income or expense depending on context
}

// Income categories
export const INCOME_CATEGORIES: CategoryMetadata[] = [
  { name: 'Salary', icon: 'cash', color: '#1A1A1A', defaultType: 'income', canBeBoth: false },
  { name: 'Freelance', icon: 'briefcase', color: '#1A1A1A', defaultType: 'income', canBeBoth: false },
  { name: 'Investment Returns', icon: 'trending-up', color: '#1A1A1A', defaultType: 'income', canBeBoth: false },
  { name: 'Gifts Received', icon: 'gift', color: '#1A1A1A', defaultType: 'income', canBeBoth: false },
  { name: 'Refunds', icon: 'arrow-undo', color: '#1A1A1A', defaultType: 'income', canBeBoth: false },
  { name: 'Debt', icon: 'card-outline', color: '#1A1A1A', defaultType: 'income', canBeBoth: true },
  { name: 'Other Income', icon: 'add-circle', color: '#1A1A1A', defaultType: 'income', canBeBoth: false },
];

// Expense categories
export const EXPENSE_CATEGORIES: CategoryMetadata[] = [
  { name: 'Food & Dining', icon: 'restaurant', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Shopping', icon: 'bag', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Transport', icon: 'car', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Bills & Utilities', icon: 'receipt', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Subscription', icon: 'repeat', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Debt', icon: 'card-outline', color: '#1A1A1A', defaultType: 'expense', canBeBoth: true },
  { name: 'Entertainment', icon: 'musical-notes', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Healthcare', icon: 'medical', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Education', icon: 'school', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Travel', icon: 'airplane', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Groceries', icon: 'basket', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Cash', icon: 'cash-outline', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Fees', icon: 'card', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
  { name: 'Other', icon: 'receipt-outline', color: '#1A1A1A', defaultType: 'expense', canBeBoth: false },
];

// Categories that can be both income and expense depending on context
export const FLEXIBLE_CATEGORIES: CategoryMetadata[] = [
  { name: 'Transfer', icon: 'swap-horizontal', color: '#1A1A1A', defaultType: 'expense', canBeBoth: true },
  // Note: "Other" is already in EXPENSE_CATEGORIES with canBeBoth: true, so we don't duplicate it here
];

// All categories combined
export const ALL_CATEGORIES: CategoryMetadata[] = [
  ...INCOME_CATEGORIES,
  ...EXPENSE_CATEGORIES,
  ...FLEXIBLE_CATEGORIES.filter(cat => !EXPENSE_CATEGORIES.find(ec => ec.name === cat.name)),
];

// Get categories by type
export const getCategoriesByType = (type: TransactionType): CategoryMetadata[] => {
  if (type === 'income') {
    // For income: include income categories and flexible categories
    const incomeCats = [...INCOME_CATEGORIES];
    const flexibleCats = FLEXIBLE_CATEGORIES.filter(cat => 
      !incomeCats.some(ic => ic.name === cat.name)
    );
    return [...incomeCats, ...flexibleCats];
  }
  // For expense: include expense categories and flexible categories (avoiding duplicates)
  const expenseCats = [...EXPENSE_CATEGORIES];
  const flexibleCats = FLEXIBLE_CATEGORIES.filter(cat => 
    !expenseCats.some(ec => ec.name === cat.name)
  );
  return [...expenseCats, ...flexibleCats];
};

// Get category metadata by name
export const getCategoryMetadata = (categoryName: string): CategoryMetadata | null => {
  const category = ALL_CATEGORIES.find(cat => cat.name === categoryName);
  return category || null;
};

// Validate category name
export const isValidCategory = (categoryName: string): boolean => {
  return ALL_CATEGORIES.some(cat => cat.name === categoryName);
};

// Check if category can be used for a specific type
export const canCategoryBeType = (categoryName: string, type: TransactionType): boolean => {
  const category = getCategoryMetadata(categoryName);
  if (!category) return false;
  
  if (category.canBeBoth) return true;
  return category.defaultType === type;
};

// Smart detection: determine if a category can be income/expense based on context
export const detectCategoryType = (
  categoryName: string,
  amount: number,
  description?: string
): TransactionType | null => {
  const category = getCategoryMetadata(categoryName);
  if (!category) return null;
  
  // If category can't be both, return its default type
  if (!category.canBeBoth) {
    return category.defaultType;
  }
  
  // For flexible categories, use amount and description hints
  // Positive amounts typically indicate income, negative indicate expense
  // But we need to be careful - TrueLayer might provide absolute values
  if (description) {
    const lowerDesc = description.toLowerCase();
    // Income indicators
    if (lowerDesc.includes('salary') || lowerDesc.includes('paycheck') || 
        lowerDesc.includes('refund') || lowerDesc.includes('deposit')) {
      return 'income';
    }
    // Expense indicators
    if (lowerDesc.includes('purchase') || lowerDesc.includes('payment') ||
        lowerDesc.includes('withdrawal') || lowerDesc.includes('fee')) {
      return 'expense';
    }
  }
  
  // Default to expense for flexible categories if no clear indication
  return category.defaultType;
};

// Get default category for a transaction type
export const getDefaultCategory = (type: TransactionType): string => {
  if (type === 'income') {
    return 'Other Income';
  }
  return 'Other';
};

