import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { getTransactionIcon, getSubscriptionIcon } from '../utils/icons';

// Set EXPO_PUBLIC_LOGO_DEV_KEY in .env (publishable key - safe in client)
const LOGO_DEV_PUBLIC_KEY = process.env.EXPO_PUBLIC_LOGO_DEV_KEY || '';

interface CompanyLogoProps {
  name: string;
  type?: 'transaction' | 'subscription';
  category?: string;
  description?: string;
  /** When provided (e.g. from Plaid), use this URL instead of Logo.dev */
  logoUrl?: string | null;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export default function CompanyLogo({ 
  name, 
  type = 'subscription', 
  category,
  description,
  logoUrl: providedLogoUrl,
  size = 48,
  fallbackIcon 
}: CompanyLogoProps) {
  const [error, setError] = React.useState(false);
  
  // Get fallback icon for when image fails or no URL
  const getFallbackIcon = () => {
    if (fallbackIcon) return fallbackIcon;
    if (type === 'transaction' && category) {
      return getTransactionIcon(category, description).name;
    }
    return getSubscriptionIcon(name).name;
  };
  const fallbackIconName = getFallbackIcon();

  // Clean company name for Logo.dev API (used when no Plaid logo provided)
  const getLogoIdentifier = () => {
    if (name.includes('.com') || name.includes('.net') || name.includes('.org') || name.includes('.io')) {
      return name.toLowerCase().trim();
    }
    const cleanName = name
      .split(' ')[0]
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
    return `${cleanName}.com`;
  };

  // Prefer Plaid logo URL when provided; otherwise use Logo.dev
  const logoUrl = providedLogoUrl && !error
    ? providedLogoUrl
    : `https://img.logo.dev/${getLogoIdentifier()}?token=${LOGO_DEV_PUBLIC_KEY}`;

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

