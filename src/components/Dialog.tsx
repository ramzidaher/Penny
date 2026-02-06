import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface DialogData {
  id: string;
  title: string;
  message: string;
  buttons?: DialogButton[];
}

interface DialogProps {
  dialog: DialogData;
  onDismiss: (id: string) => void;
}

export default function Dialog({ dialog, onDismiss }: DialogProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleDismiss = (buttonPress?: () => void) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (buttonPress) {
        buttonPress();
      }
      onDismiss(dialog.id);
    });
  };

  const handleBackdropPress = () => {
    // Only dismiss on backdrop press if there's a cancel button or default OK button
    const hasCancel = dialog.buttons?.some(btn => btn.style === 'cancel');
    if (hasCancel || !dialog.buttons || dialog.buttons.length === 0) {
      handleDismiss();
    }
  };

  const buttons = dialog.buttons || [{ text: 'OK' }];

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={() => handleDismiss()}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropOpacity,
            },
          ]}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.dialogContainer,
                {
                  transform: [{ scale }],
                  opacity,
                },
              ]}
            >
              <View style={styles.dialog}>
                <Text style={styles.title}>{dialog.title}</Text>
                <Text style={styles.message}>{dialog.message}</Text>
                
                <View style={styles.buttonContainer}>
                  {buttons.map((button, index) => {
                    const isPrimary = button.style !== 'cancel' && button.style !== 'destructive';
                    const isDestructive = button.style === 'destructive';
                    const isCancel = button.style === 'cancel';
                    
                    // Ensure button.text is always a string
                    // Handle case where text might be an object with {text, style} structure
                    const buttonText = typeof button.text === 'string' 
                      ? button.text 
                      : (button.text && typeof button.text === 'object' && 'text' in button.text)
                        ? String(button.text.text)
                        : String(button.text || 'OK');
                    
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.button,
                          buttons.length > 1 && index < buttons.length - 1 && styles.buttonWithMargin,
                          isPrimary && styles.buttonPrimary,
                          isCancel && styles.buttonCancel,
                          isDestructive && styles.buttonDestructive,
                        ]}
                        onPress={() => handleDismiss(button.onPress)}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            isPrimary && styles.buttonTextPrimary,
                            isCancel && styles.buttonTextCancel,
                            isDestructive && styles.buttonTextDestructive,
                          ]}
                        >
                          {buttonText}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const createStyles = (colors: { background: string; primary: string; border: string; text: string; textSecondary: string; error: string }) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'android' ? 16 : 20,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: Platform.OS === 'android' ? SCREEN_WIDTH - 32 : SCREEN_WIDTH - 40,
  },
  dialog: {
    backgroundColor: colors.background,
    borderRadius: Platform.OS === 'android' ? 12 : 16,
    padding: Platform.OS === 'android' ? 20 : 24,
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: Platform.OS === 'android' ? 4 : 8,
    },
    shadowOpacity: Platform.OS === 'android' ? 0.25 : 0.15,
    shadowRadius: Platform.OS === 'android' ? 8 : 16,
    elevation: Platform.OS === 'android' ? 24 : 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'android' && {
      overflow: 'hidden',
    }),
  },
  title: {
    ...typography.h3,
    fontSize: Platform.OS === 'android' ? 18 : 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: Platform.OS === 'android' ? 10 : 12,
    textAlign: 'left',
  },
  message: {
    ...typography.body,
    fontSize: Platform.OS === 'android' ? 15 : 16,
    color: colors.textSecondary,
    marginBottom: Platform.OS === 'android' ? 20 : 24,
    lineHeight: Platform.OS === 'android' ? 21 : 22,
    textAlign: 'left',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Platform.OS === 'android' ? 8 : 12,
    flexWrap: 'wrap',
  },
  button: {
    paddingVertical: Platform.OS === 'android' ? 10 : 12,
    paddingHorizontal: Platform.OS === 'android' ? 20 : 24,
    borderRadius: Platform.OS === 'android' ? 6 : 8,
    minWidth: Platform.OS === 'android' ? 70 : 80,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android' && {
      overflow: 'hidden',
    }),
  },
  buttonWithMargin: {
    marginRight: 0,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonCancel: {
    backgroundColor: 'transparent',
  },
  buttonDestructive: {
    backgroundColor: colors.error,
  },
  buttonText: {
    ...typography.body,
    fontSize: Platform.OS === 'android' ? 14 : 16,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: colors.background,
  },
  buttonTextCancel: {
    color: colors.textSecondary,
  },
  buttonTextDestructive: {
    color: colors.background,
  },
  });

