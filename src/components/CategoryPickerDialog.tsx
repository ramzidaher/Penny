import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { getCategoriesByType, CategoryMetadata, TransactionType } from '../utils/categories';

interface CategoryPickerDialogProps {
  visible: boolean;
  type: TransactionType;
  onSelect: (category: string) => void;
  onClose: () => void;
  suggestedCategory?: string;
}

export default function CategoryPickerDialog({
  visible,
  type,
  onSelect,
  onClose,
  suggestedCategory,
}: CategoryPickerDialogProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState('');
  const categories = getCategoriesByType(type);
  
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleSelect = (category: string) => {
    setSearchQuery('');
    onSelect(category);
    // Don't call onClose here - let the parent handle closing after showing the next dialog
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Select {type === 'income' ? 'Income' : 'Expense'} Category
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search categories..."
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          
          <ScrollView style={styles.categoriesList} showsVerticalScrollIndicator={false}>
            {filteredCategories.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No categories found</Text>
              </View>
            ) : (
              filteredCategories.map((category, index) => {
                const isSuggested = suggestedCategory === category.name;
                // Use index in key to ensure uniqueness even if category names somehow duplicate
                return (
                  <TouchableOpacity
                    key={`${category.name}-${index}-${type}`}
                    style={[
                      styles.categoryItem,
                      isSuggested && styles.categoryItemSuggested,
                    ]}
                    onPress={() => handleSelect(category.name)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.categoryIconContainer,
                      isSuggested && styles.categoryIconContainerSuggested,
                    ]}>
                      <Ionicons
                        name={category.icon}
                        size={24}
                        color={isSuggested ? colors.background : colors.text}
                      />
                    </View>
                    <Text style={[
                      styles.categoryName,
                      isSuggested && styles.categoryNameSuggested,
                    ]}>
                      {category.name}
                    </Text>
                    {isSuggested && (
                      <View style={styles.suggestedBadge}>
                        <Text style={styles.suggestedBadgeText}>Suggested</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.heading,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 20,
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  categoriesList: {
    paddingHorizontal: 20,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryItemSuggested: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  categoryIconContainerSuggested: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  categoryName: {
    flex: 1,
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  categoryNameSuggested: {
    color: colors.background,
  },
  suggestedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  suggestedBadgeText: {
    ...typography.bodySmall,
    fontSize: 12,
    fontWeight: '600',
    color: colors.background,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

