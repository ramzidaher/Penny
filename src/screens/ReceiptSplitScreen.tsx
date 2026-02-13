import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../components/ScreenHeader';
import ScreenWrapper from '../components/ScreenWrapper';
import { useTheme } from '../contexts/ThemeContext';
import { parseReceiptFromImage, computeSelectedTotal } from '../services/receiptParseService';
import { getCurrencySymbol } from '../utils/currency';
import type { ParsedReceipt, ReceiptLineItem } from '../types/receipt';
import type { ThemeColors } from '../theme/themeColors';
import { typography } from '../theme/typography';

type Step = 'capture' | 'parsing' | 'split' | 'error';

export default function ReceiptSplitScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const [step, setStep] = useState<Step>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestCameraPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }, []);

  const requestMediaLibraryPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  }, []);

  const pickImageAndParse = useCallback(async (useCamera: boolean) => {
    if (useCamera) {
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          'Camera access',
          'Please allow camera access in Settings to take a photo of your receipt.'
        );
        return;
      }
    } else {
      const granted = await requestMediaLibraryPermission();
      if (!granted) {
        Alert.alert(
          'Photo library access',
          'Please allow photo library access to choose a receipt image.'
        );
        return;
      }
    }

    try {
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
            base64: true,
          });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setImageUri(asset.uri);
      setStep('parsing');
      setErrorMessage(null);

      const base64 = asset.base64;
      if (!base64) {
        setErrorMessage('Could not read image. Try another photo.');
        setStep('error');
        return;
      }

      const mimeType = asset.uri?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const parsed = await parseReceiptFromImage(base64, mimeType);

      if (!parsed) {
        setErrorMessage('Could not read receipt. Make sure the photo is clear and try again.');
        setStep('error');
        return;
      }

      setReceipt(parsed);
      setSelectedIds(new Set(parsed.items.map((i) => i.id)));
      setStep('split');
    } catch (err) {
      console.warn('[ReceiptSplit] Error:', err);
      setErrorMessage('Something went wrong. Please try again.');
      setStep('error');
    }
  }, [requestCameraPermission, requestMediaLibraryPermission]);

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!receipt) return;
    setSelectedIds(new Set(receipt.items.map((i) => i.id)));
  }, [receipt]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const reset = useCallback(() => {
    setStep('capture');
    setImageUri(null);
    setReceipt(null);
    setSelectedIds(new Set());
    setErrorMessage(null);
  }, []);

  const symbol = receipt ? getCurrencySymbol(receipt.currency) : '';
  const share = receipt && selectedIds.size > 0 ? computeSelectedTotal(receipt, selectedIds) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Split receipt"
        subtitle="Photo a receipt, then tick what you’re paying for"
        rightAction={{
          icon: step === 'split' ? 'refresh-outline' : 'close',
          onPress: step === 'split' ? reset : () => router.back(),
        }}
      />
      <ScreenWrapper
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {step === 'capture' && (
          <View style={styles.captureSection}>
            <Text style={styles.captureTitle}>Take or choose a receipt photo</Text>
            <Text style={styles.captureSubtitle}>
              Restaurant, cafe, or shop receipts work best. We’ll extract each line and add up your share, including VAT and service.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => pickImageAndParse(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={24} color={themeColors.background} />
              <Text style={styles.primaryButtonText}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => pickImageAndParse(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={24} color={themeColors.primary} />
              <Text style={styles.secondaryButtonText}>Choose from library</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'parsing' && (
          <View style={styles.parsingSection}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
            <ActivityIndicator size="large" color={themeColors.primary} style={styles.spinner} />
            <Text style={styles.parsingText}>Analyzing receipt…</Text>
          </View>
        )}

        {step === 'error' && (
          <View style={styles.errorSection}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImageSmall} resizeMode="contain" />
            ) : null}
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={reset} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'split' && receipt && (
          <View style={styles.splitSection}>
            {receipt.merchant ? (
              <Text style={styles.merchant}>{receipt.merchant}</Text>
            ) : null}
            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={selectAll} style={styles.linkButton}>
                <Text style={styles.linkText}>Select all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearSelection} style={styles.linkButton}>
                <Text style={styles.linkText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {receipt.items.map((item) => (
                <ReceiptItemRow
                  key={item.id}
                  item={item}
                  symbol={symbol}
                  checked={selectedIds.has(item.id)}
                  onToggle={() => toggleItem(item.id)}
                  styles={styles}
                />
              ))}
            </ScrollView>
            {(receipt.tax !== undefined && receipt.tax > 0) || (receipt.serviceCharge !== undefined && receipt.serviceCharge > 0) ? (
              <View style={styles.totalsNote}>
                <Text style={styles.totalsNoteText}>
                  VAT and service are split proportionally based on your selected items.
                </Text>
              </View>
            ) : null}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Your total</Text>
              {share ? (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Items</Text>
                    <Text style={styles.summaryValue}>{symbol}{share.itemsTotal.toFixed(2)}</Text>
                  </View>
                  {share.taxShare > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>VAT (share)</Text>
                      <Text style={styles.summaryValue}>{symbol}{share.taxShare.toFixed(2)}</Text>
                    </View>
                  )}
                  {share.serviceShare > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Service (share)</Text>
                      <Text style={styles.summaryValue}>{symbol}{share.serviceShare.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                    <Text style={styles.summaryTotalLabel}>You owe</Text>
                    <Text style={styles.summaryTotalValue}>{symbol}{share.total.toFixed(2)}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.summaryHint}>Tick items above to see your total.</Text>
              )}
            </View>
          </View>
        )}
      </ScreenWrapper>
    </View>
  );
}

function ReceiptItemRow({
  item,
  symbol,
  checked,
  onToggle,
  styles: s,
}: {
  item: ReceiptLineItem;
  symbol: string;
  checked: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      style={s.itemRow}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'checkbox-outline'}
        size={24}
        color={checked ? s.checkboxChecked.color : s.checkboxUnchecked.color}
      />
      <Text style={s.itemDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <Text style={s.itemAmount}>
        {symbol}{item.amount.toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    captureSection: {
      paddingTop: 24,
    },
    captureTitle: {
      ...typography.h3,
      color: c.text,
      marginBottom: 8,
    },
    captureSubtitle: {
      ...typography.bodySmall,
      color: c.textSecondary,
      marginBottom: 24,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: c.primary,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
      marginBottom: 12,
    },
    primaryButtonText: {
      ...typography.body,
      fontWeight: '600',
      color: c.background,
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    secondaryButtonText: {
      ...typography.body,
      color: c.primary,
    },
    parsingSection: {
      paddingTop: 24,
      alignItems: 'center',
    },
    previewImage: {
      width: '100%',
      height: 200,
      borderRadius: 12,
      backgroundColor: c.surface,
      marginBottom: 24,
    },
    spinner: {
      marginBottom: 12,
    },
    parsingText: {
      ...typography.body,
      color: c.textSecondary,
    },
    previewImageSmall: {
      width: '100%',
      maxHeight: 160,
      borderRadius: 12,
      backgroundColor: c.surface,
      marginBottom: 16,
    },
    errorSection: {
      paddingTop: 24,
    },
    errorText: {
      ...typography.body,
      color: c.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    splitSection: {
      paddingTop: 16,
    },
    merchant: {
      ...typography.h3,
      color: c.text,
      marginBottom: 12,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 16,
      marginBottom: 12,
    },
    linkButton: {
      paddingVertical: 4,
      paddingHorizontal: 0,
    },
    linkText: {
      ...typography.bodySmall,
      color: c.primary,
      fontWeight: '500',
    },
    itemsList: {
      maxHeight: Platform.OS === 'web' ? 320 : 280,
      marginBottom: 16,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: c.surface,
      borderRadius: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    checkboxChecked: { color: c.primary },
    checkboxUnchecked: { color: c.border },
    itemDescription: {
      flex: 1,
      ...typography.body,
      color: c.text,
    },
    itemAmount: {
      ...typography.body,
      fontWeight: '600',
      color: c.text,
    },
    totalsNote: {
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    totalsNoteText: {
      ...typography.caption,
      color: c.textSecondary,
      fontStyle: 'italic',
    },
    summaryCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    summaryTitle: {
      ...typography.h3,
      color: c.text,
      marginBottom: 12,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    summaryLabel: {
      ...typography.bodySmall,
      color: c.textSecondary,
    },
    summaryValue: {
      ...typography.bodySmall,
      color: c.text,
      fontWeight: '500',
    },
    summaryTotalRow: {
      marginTop: 8,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginBottom: 0,
    },
    summaryTotalLabel: {
      ...typography.body,
      fontWeight: '600',
      color: c.text,
    },
    summaryTotalValue: {
      ...typography.body,
      fontWeight: '700',
      color: c.text,
    },
    summaryHint: {
      ...typography.bodySmall,
      color: c.textSecondary,
    },
  });
}
