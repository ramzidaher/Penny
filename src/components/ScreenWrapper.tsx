import React, { ReactNode, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, RefreshControl, ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

interface ScreenWrapperProps {
  children: ReactNode;
  enableKeyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  refreshControl?: React.ReactElement<typeof RefreshControl>;
  onRefresh?: () => void;
  refreshing?: boolean;
  loading?: boolean;
  loadingComponent?: ReactNode;
  contentContainerStyle?: object;
  showsVerticalScrollIndicator?: boolean;
}

export interface ScreenWrapperRef {
  scrollToEnd: (options?: { animated?: boolean }) => void;
  scrollTo: (options?: { x?: number; y?: number; animated?: boolean }) => void;
}

const ScreenWrapper = forwardRef<ScreenWrapperRef, ScreenWrapperProps>(({
  children,
  enableKeyboardAvoiding = false,
  keyboardVerticalOffset = 0,
  refreshControl,
  onRefresh,
  refreshing = false,
  loading = false,
  loadingComponent,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
}, ref) => {
  const insets = useSafeAreaInsets();
  const scrollViewRef = React.useRef<ScrollView>(null);

  useImperativeHandle(ref, () => ({
    scrollToEnd: (options?: { animated?: boolean }) => {
      scrollViewRef.current?.scrollToEnd(options);
    },
    scrollTo: (options?: { x?: number; y?: number; animated?: boolean }) => {
      scrollViewRef.current?.scrollTo(options);
    },
  }));

  const refreshControlElement = refreshControl || (onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
  ) : undefined);

  const scrollViewContent = (
    <ScrollView
      ref={scrollViewRef}
      style={styles.scrollView}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={contentContainerStyle}
      refreshControl={refreshControlElement}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {loading && loadingComponent ? loadingComponent : children}
    </ScrollView>
  );

  if (enableKeyboardAvoiding) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {scrollViewContent}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      {scrollViewContent}
    </View>
  );
});

ScreenWrapper.displayName = 'ScreenWrapper';

export default ScreenWrapper;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
});

