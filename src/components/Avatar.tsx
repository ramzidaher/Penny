import React, { useMemo } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { getAvatarSvgString, getAvatarPngUrl } from '../utils/avatarUtils';

interface AvatarProps {
  seed: string | null;
  size?: number;
}

export default function Avatar({ seed, size = 48 }: AvatarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);

  if (!seed || seed.trim() === '') {
    return (
      <View style={styles.container}>
        <Ionicons name="person" size={size * 0.5} color={colors.textSecondary} />
      </View>
    );
  }

  // On Android, SvgXml often fails to render (native module / fill issues). Use DiceBear PNG API URL with Image.
  const usePngFallback = Platform.OS === 'android';
  const pngUri = useMemo(
    () => (usePngFallback ? getAvatarPngUrl(seed, Math.min(256, size * 2)) : null),
    [seed, size, usePngFallback]
  );
  const svgString = useMemo(() => (usePngFallback ? '' : getAvatarSvgString(seed)), [seed, usePngFallback]);

  if (usePngFallback && pngUri) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: pngUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.svgWrap, { width: size, height: size }]}>
        <SvgXml
          xml={svgString}
          width={size}
          height={size}
          style={Platform.OS === 'android' ? { width: size, height: size } : undefined}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: any, size: number) =>
  StyleSheet.create({
    container: {
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      borderRadius: size / 2,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    svgWrap: {
      width: size,
      height: size,
      overflow: 'hidden',
      borderRadius: size / 2,
    },
  });
