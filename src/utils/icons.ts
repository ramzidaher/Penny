import { Ionicons } from '@expo/vector-icons';

export const getTransactionIcon = (category: string, description?: string): { name: keyof typeof Ionicons.glyphMap; color: string } => {
  const lowerCategory = category.toLowerCase();
  const lowerDesc = (description || '').toLowerCase();

  // Food & Dining
  if (lowerCategory.includes('food') || lowerCategory.includes('dining') || 
      lowerDesc.includes('restaurant') || lowerDesc.includes('cafe') || 
      lowerDesc.includes('food') || lowerDesc.includes('grocery') ||
      lowerDesc.includes('starbucks') || lowerDesc.includes('mcdonald') ||
      lowerDesc.includes('uber eats') || lowerDesc.includes('doordash')) {
    return { name: 'restaurant', color: '#1A1A1A' };
  }

  // Shopping
  if (lowerCategory.includes('shopping') || lowerDesc.includes('amazon') ||
      lowerDesc.includes('target') || lowerDesc.includes('walmart') ||
      lowerDesc.includes('store') || lowerDesc.includes('shop')) {
    return { name: 'bag', color: '#1A1A1A' };
  }

  // Transportation
  if (lowerCategory.includes('transport') || lowerDesc.includes('uber') ||
      lowerDesc.includes('lyft') || lowerDesc.includes('taxi') ||
      lowerDesc.includes('gas') || lowerDesc.includes('fuel') ||
      lowerDesc.includes('parking') || lowerDesc.includes('metro')) {
    return { name: 'car', color: '#1A1A1A' };
  }

  // Bills & Utilities
  if (lowerCategory.includes('bills') || lowerCategory.includes('utilities') ||
      lowerDesc.includes('electric') || lowerDesc.includes('water') ||
      lowerDesc.includes('internet') || lowerDesc.includes('phone') ||
      lowerDesc.includes('utility') || lowerDesc.includes('bill')) {
    return { name: 'receipt', color: '#1A1A1A' };
  }

  // Entertainment
  if (lowerCategory.includes('entertainment') || lowerDesc.includes('movie') ||
      lowerDesc.includes('netflix') || lowerDesc.includes('spotify') ||
      lowerDesc.includes('game') || lowerDesc.includes('concert') ||
      lowerDesc.includes('theater')) {
    return { name: 'musical-notes', color: '#1A1A1A' };
  }

  // Healthcare
  if (lowerCategory.includes('health') || lowerDesc.includes('doctor') ||
      lowerDesc.includes('pharmacy') || lowerDesc.includes('hospital') ||
      lowerDesc.includes('medical') || lowerDesc.includes('cvs') ||
      lowerDesc.includes('walgreens')) {
    return { name: 'medical', color: '#1A1A1A' };
  }

  // Education
  if (lowerCategory.includes('education') || lowerDesc.includes('school') ||
      lowerDesc.includes('university') || lowerDesc.includes('course') ||
      lowerDesc.includes('book') || lowerDesc.includes('tuition')) {
    return { name: 'school', color: '#1A1A1A' };
  }

  // Travel
  if (lowerCategory.includes('travel') || lowerDesc.includes('hotel') ||
      lowerDesc.includes('flight') || lowerDesc.includes('airline') ||
      lowerDesc.includes('airbnb') || lowerDesc.includes('trip')) {
    return { name: 'airplane', color: '#1A1A1A' };
  }

  // Income
  if (lowerCategory.includes('income') || lowerDesc.includes('salary') ||
      lowerDesc.includes('paycheck') || lowerDesc.includes('payment')) {
    return { name: 'cash', color: '#1A1A1A' };
  }

  // Default
  return { name: 'receipt', color: '#1A1A1A' };
};

export const getSubscriptionIcon = (name: string): { name: keyof typeof Ionicons.glyphMap; color: string } => {
  const lowerName = name.toLowerCase();

  // Streaming Services
  if (lowerName.includes('netflix')) {
    return { name: 'tv', color: '#1A1A1A' };
  }
  if (lowerName.includes('spotify')) {
    return { name: 'musical-notes', color: '#1A1A1A' };
  }
  if (lowerName.includes('apple') || lowerName.includes('apple music')) {
    return { name: 'musical-notes', color: '#1A1A1A' };
  }
  if (lowerName.includes('disney') || lowerName.includes('disney+')) {
    return { name: 'tv', color: '#1A1A1A' };
  }
  if (lowerName.includes('hulu')) {
    return { name: 'tv', color: '#1A1A1A' };
  }
  if (lowerName.includes('prime') || lowerName.includes('amazon prime')) {
    return { name: 'tv', color: '#1A1A1A' };
  }
  if (lowerName.includes('hbo') || lowerName.includes('max')) {
    return { name: 'tv', color: '#1A1A1A' };
  }
  if (lowerName.includes('youtube') || lowerName.includes('youtube premium')) {
    return { name: 'logo-youtube', color: '#1A1A1A' };
  }

  // Software & Cloud
  if (lowerName.includes('adobe')) {
    return { name: 'color-palette', color: '#1A1A1A' };
  }
  if (lowerName.includes('microsoft') || lowerName.includes('office')) {
    return { name: 'document', color: '#1A1A1A' };
  }
  if (lowerName.includes('google') || lowerName.includes('google drive')) {
    return { name: 'logo-google', color: '#1A1A1A' };
  }
  if (lowerName.includes('dropbox')) {
    return { name: 'cloud', color: '#1A1A1A' };
  }
  if (lowerName.includes('icloud')) {
    return { name: 'cloud', color: '#1A1A1A' };
  }

  // Fitness & Health
  if (lowerName.includes('gym') || lowerName.includes('fitness')) {
    return { name: 'fitness', color: '#1A1A1A' };
  }
  if (lowerName.includes('peloton')) {
    return { name: 'bicycle', color: '#1A1A1A' };
  }

  // News & Media
  if (lowerName.includes('new york times') || lowerName.includes('nyt')) {
    return { name: 'newspaper', color: '#1A1A1A' };
  }
  if (lowerName.includes('medium')) {
    return { name: 'book', color: '#1A1A1A' };
  }

  // Gaming
  if (lowerName.includes('playstation') || lowerName.includes('psn')) {
    return { name: 'game-controller', color: '#1A1A1A' };
  }
  if (lowerName.includes('xbox') || lowerName.includes('xbox live')) {
    return { name: 'game-controller', color: '#1A1A1A' };
  }
  if (lowerName.includes('nintendo') || lowerName.includes('switch')) {
    return { name: 'game-controller', color: '#1A1A1A' };
  }

  // Default subscription icon
  return { name: 'repeat', color: '#1A1A1A' };
};

