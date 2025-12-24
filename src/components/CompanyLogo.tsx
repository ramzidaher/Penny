import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { getTransactionIcon, getSubscriptionIcon } from '../utils/icons';

// You can set this in your .env file as EXPO_PUBLIC_LOGO_DEV_KEY
// This is your publishable key - safe to use in client-side code
const LOGO_DEV_PUBLIC_KEY = process.env.EXPO_PUBLIC_LOGO_DEV_KEY || 'pk_WinkY0UARgipCtWGpa1HRg';

interface CompanyLogoProps {
  name: string;
  type?: 'transaction' | 'subscription';
  category?: string;
  description?: string;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export default function CompanyLogo({ 
  name, 
  type = 'subscription', 
  category,
  description,
  size = 48,
  fallbackIcon 
}: CompanyLogoProps) {
  const [error, setError] = React.useState(false);
  
  // Get fallback icon
  const getFallbackIcon = () => {
    if (fallbackIcon) {
      return fallbackIcon;
    }
    if (type === 'transaction' && category) {
      return getTransactionIcon(category, description).name;
    }
    return getSubscriptionIcon(name).name;
  };

  const fallbackIconName = getFallbackIcon();

  // Clean company name for logo.dev API
  // Try to extract domain or company name
  const getLogoIdentifier = () => {
    // If it looks like a domain (contains .com, .net, etc.), use it directly
    if (name.includes('.com') || name.includes('.net') || name.includes('.org') || name.includes('.io')) {
      return name.toLowerCase().trim();
    }
    
    // Otherwise, clean the name
    const cleanName = name
      .split(' ')[0] // Take first word
      .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
      .toLowerCase();
    
    // Try with .com suffix first (most common)
    return `${cleanName}.com`;
  };

  const logoIdentifier = getLogoIdentifier();
  const logoUrl = `https://img.logo.dev/${logoIdentifier}?token=${LOGO_DEV_PUBLIC_KEY}`;

  if (error) {
    return (
      <View style={[styles.fallbackContainer, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons 
          name={fallbackIconName} 
          size={size * 0.6} 
          color={colors.primary} 
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={{ uri: logoUrl }}
        style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setError(true)}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    backgroundColor: 'transparent',
  },
  fallbackContainer: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});

