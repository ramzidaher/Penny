import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Image,
  Animated,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { registerUser, initFirebase, isUsernameAvailable, isEmailAvailable } from '../services/firebase';
import Avatar from './Avatar';
import { AVATAR_SEEDS } from '../utils/avatarUtils';
import { requestPermissions } from '../services/notifications';
import { isBiometricAvailable, getBiometricType, saveBiometricCredentials } from '../services/biometricService';
import { setPIN } from '../services/pinService';
import { markPINSetupComplete } from '../services/pinEnforcement';
import { useDialog } from '../contexts/DialogContext';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';
import { format } from 'date-fns';

interface SignupData {
  name: string;
  username: string;
  email: string;
  dateOfBirth: Date | null;
  password: string;
  confirmPassword: string;
  pin: string;
  confirmPin: string;
  aiTone: 'friendly' | 'professional' | 'direct' | 'harsh' | null;
  avatarSeed: string | null;
}

export default function SignupOnboarding() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dialog = useDialog();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));
  
  // Form data
  const [formData, setFormData] = useState<SignupData>({
    name: '',
    username: '',
    email: '',
    dateOfBirth: null,
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: '',
    aiTone: null,
    avatarSeed: null,
  });
  
  // PIN step state
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Focus states for inputs
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  
  // Permissions
  const [notificationPermission, setNotificationPermission] = useState<boolean | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // Preferences state
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number>(100);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [isCustomThreshold, setIsCustomThreshold] = useState(false);
  const [customThreshold, setCustomThreshold] = useState<string>('');

  const totalSteps = 9;

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricType(type);
      }
    };
    checkBiometric();
    
    // Cleanup timeout on unmount
    return () => {
      if (emailCheckTimeoutRef.current) {
        clearTimeout(emailCheckTimeoutRef.current);
      }
    };
  }, []);


  // Animate step transitions
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: currentStep - 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [currentStep]);

  // Input length limits to prevent DoS attacks
  const MAX_NAME_LENGTH = 100;
  const MAX_USERNAME_LENGTH = 20;
  const MIN_USERNAME_LENGTH = 3;
  const MAX_EMAIL_LENGTH = 254; // RFC 5321
  const MIN_PASSWORD_LENGTH = 8;
  const MAX_PASSWORD_LENGTH = 128;
  const MIN_AGE = 18; // Minimum age for financial app

  const sanitizeInput = (input: string, maxLength: number): string => {
    // Remove leading/trailing whitespace and limit length
    return input.trim().slice(0, maxLength);
  };

  const validateEmail = (email: string): boolean => {
    // RFC 5322 compliant email regex (simplified)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (email.length > MAX_EMAIL_LENGTH) {
      return false;
    }
    return emailRegex.test(email);
  };

  const validateUsername = (username: string): { valid: boolean; message: string } => {
    // Username must be alphanumeric and underscores only, 3-20 characters
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    
    if (username.length < MIN_USERNAME_LENGTH) {
      return { valid: false, message: `Username must be at least ${MIN_USERNAME_LENGTH} characters` };
    }
    if (username.length > MAX_USERNAME_LENGTH) {
      return { valid: false, message: `Username must be no more than ${MAX_USERNAME_LENGTH} characters` };
    }
    if (!usernameRegex.test(username)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
    }
    // Reserved usernames check
    const reserved = ['admin', 'administrator', 'root', 'system', 'support', 'help', 'api', 'www', 'mail', 'test'];
    if (reserved.includes(username.toLowerCase())) {
      return { valid: false, message: 'This username is reserved' };
    }
    return { valid: true, message: '' };
  };

  const validatePassword = (password: string): { valid: boolean; message: string } => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { valid: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return { valid: false, message: `Password must be no more than ${MAX_PASSWORD_LENGTH} characters` };
    }
    // Check for at least one letter and one number (basic complexity)
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return { valid: false, message: 'Password must contain at least one letter and one number' };
    }
    return { valid: true, message: '' };
  };

  const validateDateOfBirth = (dateOfBirth: Date | null): { valid: boolean; message: string } => {
    if (!dateOfBirth) {
      return { valid: false, message: 'Date of birth is required' };
    }
    const today = new Date();
    const age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    const dayDiff = today.getDate() - dateOfBirth.getDate();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    
    if (actualAge < MIN_AGE) {
      return { valid: false, message: `You must be at least ${MIN_AGE} years old to use this app` };
    }
    // Check for reasonable maximum age (150 years)
    if (actualAge > 150) {
      return { valid: false, message: 'Please enter a valid date of birth' };
    }
    // Check that date is not in the future
    if (dateOfBirth > today) {
      return { valid: false, message: 'Date of birth cannot be in the future' };
    }
    return { valid: true, message: '' };
  };

  const checkEmail = async (email: string) => {
    if (!email.trim()) {
      setEmailAvailable(null);
      return;
    }
    
    // Validate email format first (client-side)
    if (!validateEmail(email)) {
      setEmailAvailable(false);
      return;
    }
    
    // Check immediately when email is entered
    setEmailChecking(true);
    
    try {
      // Initialize Firebase if needed
      await initFirebase();
      const available = await isEmailAvailable(email.toLowerCase());
      console.log('[SignupOnboarding] Email check result:', email, 'available:', available);
      setEmailAvailable(available);
    } catch (error: any) {
      console.error('[SignupOnboarding] Error checking email:', error);
      // Handle errors
      if (error.message?.includes('Invalid email')) {
        setEmailAvailable(false);
      } else if (error.message?.includes('email-already-in-use') || error.code === 'auth/email-already-in-use') {
        // Email is already in use
        setEmailAvailable(false);
      } else {
        // For other errors, don't reveal error details to prevent information leakage
        // Set to null so user can still try, but don't show checkmark
        setEmailAvailable(null);
      }
    } finally {
      setEmailChecking(false);
    }
  };

  const checkUsername = async (username: string) => {
    if (!username.trim()) {
      setUsernameAvailable(null);
      return;
    }
    
    // Validate username format first (client-side)
    const validation = validateUsername(username);
    if (!validation.valid) {
      setUsernameAvailable(false);
      return;
    }
    
    setUsernameChecking(true);
    
    try {
      // Initialize Firebase if needed
      await initFirebase();
      // Cloud Function handles rate limiting server-side
      const available = await isUsernameAvailable(username.toLowerCase());
      setUsernameAvailable(available);
    } catch (error: any) {
      console.error('Error checking username:', error);
      // Handle rate limiting errors from Cloud Function
      if (error.message?.includes('Too many requests')) {
        dialog.alert('Rate Limit', 'Too many username checks. Please wait a moment and try again.');
        setUsernameAvailable(null);
      } else if (error.message) {
        // Show user-friendly error messages
        setUsernameAvailable(false);
      } else {
        // Don't reveal error details to prevent information leakage
        setUsernameAvailable(null);
      }
    } finally {
      setUsernameChecking(false);
    }
  };

  const handleNext = async () => {
    console.log('[SignupOnboarding] handleNext called, currentStep:', currentStep, 'totalSteps:', totalSteps);
    
    // Handle final step separately
    if (currentStep === totalSteps) {
      // Final step - create account
      console.log('[SignupOnboarding] Final step - calling handleCreateAccount');
      await handleCreateAccount();
      return;
    }
    
    // Validate current step before proceeding to next step
    if (currentStep === 1) {
      // Welcome screen - no validation needed
      console.log('[SignupOnboarding] Moving from step 1 to 2');
      setCurrentStep(2);
    } else if (currentStep === 2) {
      console.log('[SignupOnboarding] Validating step 2...');
      // Personal info validation with security checks
      const sanitizedName = sanitizeInput(formData.name, MAX_NAME_LENGTH);
      if (!sanitizedName) {
        dialog.alert('Error', 'Please enter your full name');
        return;
      }
      
      const sanitizedUsername = sanitizeInput(formData.username, MAX_USERNAME_LENGTH).toLowerCase();
      if (!sanitizedUsername) {
        dialog.alert('Error', 'Please enter a username');
        return;
      }
      
      const usernameValidation = validateUsername(sanitizedUsername);
      if (!usernameValidation.valid) {
        dialog.alert('Error', usernameValidation.message);
        return;
      }
      
      if (usernameAvailable === false) {
        dialog.alert('Error', 'Username is already taken');
        return;
      }
      
      const sanitizedEmail = sanitizeInput(formData.email, MAX_EMAIL_LENGTH).toLowerCase();
      if (!sanitizedEmail) {
        dialog.alert('Error', 'Please enter your email');
        return;
      }
        if (!validateEmail(sanitizedEmail)) {
          dialog.alert('Error', 'Please enter a valid email address');
          return;
        }
        
        if (emailAvailable === false) {
          dialog.alert('Error', 'This email is already registered. Please sign in instead.');
          return;
        }
        
        const dobValidation = validateDateOfBirth(formData.dateOfBirth);
      if (!dobValidation.valid) {
        dialog.alert('Error', dobValidation.message);
        return;
      }
      
      // Update form data with sanitized values
      setFormData({
        ...formData,
        name: sanitizedName,
        username: sanitizedUsername,
        email: sanitizedEmail,
      });
      
      console.log('[SignupOnboarding] Step 2 validation passed, moving to step 3');
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Avatar selection
      if (!formData.avatarSeed || formData.avatarSeed.trim() === '') {
        dialog.alert('Error', 'Please choose an avatar');
        return;
      }
      console.log('[SignupOnboarding] Step 3 (avatar) validation passed, moving to step 4');
      setCurrentStep(4);
    } else if (currentStep === 4) {
      console.log('[SignupOnboarding] Validating step 4 (password)...');
      // Password validation with security checks
      if (!formData.password.trim()) {
        dialog.alert('Error', 'Please enter a password');
        return;
      }
      
      // Check password length limits
      if (formData.password.length > MAX_PASSWORD_LENGTH) {
        dialog.alert('Error', `Password must be no more than ${MAX_PASSWORD_LENGTH} characters`);
        return;
      }
      
      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.valid) {
        dialog.alert('Error', passwordValidation.message);
        return;
      }
      
      if (formData.password !== formData.confirmPassword) {
        dialog.alert('Error', 'Passwords do not match');
        return;
      }
      console.log('[SignupOnboarding] Step 4 validation passed, moving to step 5');
      setCurrentStep(5);
      setPinStep('enter');
    } else if (currentStep === 5) {
      console.log('[SignupOnboarding] Validating step 5 (PIN)...');
      // PIN validation
      if (pinStep === 'enter') {
        if (!formData.pin || formData.pin.length !== 6) {
          dialog.alert('Error', 'PIN must be exactly 6 digits');
          return;
        }
        // Move to confirm step
        setPinStep('confirm');
        setFormData({ ...formData, confirmPin: '' });
        return;
      } else {
        // Confirm step
        if (!formData.confirmPin || formData.confirmPin.length !== 6) {
          dialog.alert('Error', 'Please confirm your PIN');
          return;
        }
        
        if (formData.pin !== formData.confirmPin) {
          dialog.alert('Error', 'PINs do not match. Please try again.');
          setFormData({ ...formData, pin: '', confirmPin: '' });
          setPinStep('enter');
          return;
        }
        
        console.log('[SignupOnboarding] Step 5 validation passed, moving to step 6');
        setCurrentStep(6);
      }
    } else if (currentStep === 6) {
      // AI Tone selection - validate selection
      if (!formData.aiTone) {
        dialog.alert('Error', 'Please select an AI tone preference');
        return;
      }
      console.log('[SignupOnboarding] Step 6 validation passed, moving to step 7');
      setCurrentStep(7);
    } else if (currentStep === 7) {
      // Preferences - no validation needed, all have defaults
      console.log('[SignupOnboarding] Moving from step 7 (preferences) to step 8');
      setCurrentStep(8);
    } else if (currentStep === 8) {
      // Permissions - can skip, so just proceed
      console.log('[SignupOnboarding] Moving from step 8 to 9');
      setCurrentStep(9);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleRequestNotifications = async () => {
    try {
      const granted = await requestPermissions();
      setNotificationPermission(granted);
      if (granted) {
        dialog.alert('Success', 'Notifications enabled!');
      }
    } catch (error) {
      console.error('Error requesting notifications:', error);
      setNotificationPermission(false);
    }
  };

  const handleEnableBiometric = async () => {
    if (!biometricAvailable) {
      dialog.alert('Not Available', 'Biometric authentication is not available on this device');
      return;
    }
    setBiometricEnabled(true);
    dialog.alert('Enabled', `${biometricType} will be available after you create your account`);
  };

  const handleCreateAccount = async () => {
    try {
      console.log('[SignupOnboarding] Starting account creation...');
      setLoading(true);
      
      // Final validation before registration
      const sanitizedName = sanitizeInput(formData.name, MAX_NAME_LENGTH);
      const sanitizedUsername = sanitizeInput(formData.username, MAX_USERNAME_LENGTH).toLowerCase();
      const sanitizedEmail = sanitizeInput(formData.email, MAX_EMAIL_LENGTH).toLowerCase();
      
      console.log('[SignupOnboarding] Validating inputs...', {
        hasName: !!sanitizedName,
        hasUsername: !!sanitizedUsername,
        hasEmail: !!sanitizedEmail,
        hasDOB: !!formData.dateOfBirth,
        hasPassword: !!formData.password,
      });
      
      // Re-validate all inputs
      const usernameValidation = validateUsername(sanitizedUsername);
      if (!usernameValidation.valid) {
        console.log('[SignupOnboarding] Username validation failed');
        dialog.alert('Error', usernameValidation.message);
        setLoading(false);
        return;
      }
      
      if (!validateEmail(sanitizedEmail)) {
        console.log('[SignupOnboarding] Email validation failed');
        dialog.alert('Error', 'Invalid email address');
        setLoading(false);
        return;
      }
      
      const dobValidation = validateDateOfBirth(formData.dateOfBirth);
      if (!dobValidation.valid) {
        console.log('[SignupOnboarding] DOB validation failed');
        dialog.alert('Error', dobValidation.message);
        setLoading(false);
        return;
      }
      
      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.valid) {
        console.log('[SignupOnboarding] Password validation failed');
        dialog.alert('Error', passwordValidation.message);
        setLoading(false);
        return;
      }
      
      console.log('[SignupOnboarding] Initializing Firebase...');
      await initFirebase();
      console.log('[SignupOnboarding] Firebase initialized');
      
      // Register user with sanitized inputs
      console.log('[SignupOnboarding] Registering user...');
      const user = await registerUser(
        sanitizedEmail,
        formData.password, // Password doesn't need sanitization, Firebase handles it
        sanitizedName,
        sanitizedUsername,
        formData.dateOfBirth || undefined,
        formData.avatarSeed || undefined
      );
      
      console.log('[SignupOnboarding] User registered successfully:', user?.uid);
      
      // Set PIN after successful registration
      // CRITICAL: PIN must be set BEFORE auth state propagates so lock screen shows immediately
      if (formData.pin && formData.pin.length === 6) {
        try {
          console.log('[SignupOnboarding] Setting PIN...');
          await setPIN(formData.pin);
          await markPINSetupComplete();
          console.log('[SignupOnboarding] PIN set successfully - lock screen will show after auth state propagates');
        } catch (error) {
          console.error('[SignupOnboarding] Error setting PIN:', error);
          dialog.alert('Error', 'Failed to set PIN. You can set it later in settings.');
          // Continue with signup even if PIN setup fails
        }
      }
      
      // Save biometric credentials ONLY after successful registration
      if (biometricEnabled && biometricAvailable && user) {
        try {
          console.log('[SignupOnboarding] Saving biometric credentials...');
          await saveBiometricCredentials(sanitizedEmail, formData.password);
          console.log('[SignupOnboarding] Biometric credentials saved');
        } catch (error) {
          console.error('[SignupOnboarding] Error saving biometric credentials:', error);
          // Don't block signup if this fails - user can enable later
        }
      }
      
      // Save preferences (AI tone, currency, low balance threshold)
      try {
        console.log('[SignupOnboarding] Saving preferences...');
        const { updateSettings } = await import('../services/settingsService');
        const preferences: any = {};
        
        if (formData.aiTone) {
          preferences.aiTone = formData.aiTone;
        }
        
        preferences.defaultCurrency = defaultCurrency;
        preferences.lowBalanceThreshold = lowBalanceThreshold;
        
        await updateSettings(preferences);
        console.log('[SignupOnboarding] Preferences saved:', preferences);
      } catch (error) {
        console.error('[SignupOnboarding] Error saving preferences:', error);
        // Don't block signup if this fails - user can set it later
      }
      
      // Clear sensitive data from memory (best practice)
      setFormData({
        name: '',
        username: '',
        email: '',
        dateOfBirth: null,
        password: '',
        confirmPassword: '',
        pin: '',
        confirmPin: '',
        aiTone: null,
        avatarSeed: null,
      });
      
      console.log('[SignupOnboarding] Account creation complete');
      console.log('[SignupOnboarding] Flow: Auth state will change → _layout.tsx will detect PIN is set → Lock screen will show → User enters PIN → Home screen');
      
      // Don't navigate manually - let RootLayout handle navigation based on auth state
      // The auth state change will trigger RootLayout's lock screen logic:
      // 1. Auth state changes (user is now authenticated)
      // 2. _layout.tsx checks if PIN is set (it is, we just set it)
      // 3. _layout.tsx shows lock screen immediately
      // 4. User enters PIN to unlock
      // 5. After unlock, navigation to home screen happens
      // No need to show success dialog here - lock screen will appear immediately
    } catch (error: any) {
      console.error('[SignupOnboarding] Registration error:', error);
      console.error('[SignupOnboarding] Error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
      });
      
      // Generic error message to prevent information leakage
      let errorMessage = 'Failed to create account. Please check your information and try again.';
      
      // Only show specific errors for user input issues (not security-sensitive)
      if (error?.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error?.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error?.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
      } else if (error?.message?.includes('Username') && !error?.message?.includes('taken')) {
        // Only show username format errors, not availability errors (prevents enumeration)
        errorMessage = error.message;
      } else if (error?.message) {
        // Show the error message if it's user-friendly
        errorMessage = error.message;
      }
      // For other errors (network, server, etc.), use generic message
      
      dialog.alert('Registration Failed', errorMessage);
    } finally {
      setLoading(false);
      console.log('[SignupOnboarding] handleCreateAccount completed, loading set to false');
    }
  };

  const renderProgressDots = () => {
    return (
      <View style={styles.progressContainer}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const step = index + 1;
          const isActive = step === currentStep;
          const isCompleted = step < currentStep;
          
          return (
            <View
              key={step}
              style={[
                styles.progressDot,
                isActive && styles.progressDotActive,
                isCompleted && styles.progressDotCompleted,
              ]}
            />
          );
        })}
      </View>
    );
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.title}>
        Welcome to <Text style={styles.pennyTitleText}>Penny</Text>
      </Text>
      <Text style={styles.subtitle}>
        Your personal finance companion to track accounts, manage budgets, monitor subscriptions, and gain AI-powered insights.
      </Text>
      <View style={styles.featuresList}>
        <View style={styles.featureItem}>
          <Ionicons name="wallet-outline" size={24} color={colors.primary} />
          <Text style={styles.featureText}>Track accounts & balances</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="cash-outline" size={24} color={colors.primary} />
          <Text style={styles.featureText}>Manage transactions</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="pie-chart-outline" size={24} color={colors.primary} />
          <Text style={styles.featureText}>Set budgets & alerts</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="card-outline" size={24} color={colors.primary} />
          <Text style={styles.featureText}>Track subscriptions</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.primary} />
          <Text style={styles.featureText}>Secure with PIN & biometrics</Text>
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.stepTitle}>Personal Information</Text>
      <Text style={styles.stepDescription}>Tell us a bit about yourself</Text>
      
      <View style={styles.form}>
        <View style={[styles.inputContainer, focusedInput === 'name' && styles.inputContainerFocused]}>
          <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor={colors.textLight}
            value={formData.name}
            onChangeText={(text) => {
              const sanitized = sanitizeInput(text, MAX_NAME_LENGTH);
              setFormData({ ...formData, name: sanitized });
            }}
            onFocus={() => setFocusedInput('name')}
            onBlur={() => setFocusedInput(null)}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={[styles.inputContainer, focusedInput === 'username' && styles.inputContainerFocused]}>
          <Ionicons name="at-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={colors.textLight}
            value={formData.username}
            onChangeText={(text) => {
              // Sanitize and limit length immediately
              const sanitized = sanitizeInput(text, MAX_USERNAME_LENGTH).toLowerCase();
              setFormData({ ...formData, username: sanitized });
              // Only check if format is valid
              if (sanitized.length >= MIN_USERNAME_LENGTH) {
                checkUsername(sanitized);
              } else {
                setUsernameAvailable(null);
              }
            }}
            onFocus={() => setFocusedInput('username')}
            onBlur={() => setFocusedInput(null)}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {usernameChecking && (
            <Ionicons name="hourglass-outline" size={20} color={colors.textSecondary} style={styles.inputRightIcon} />
          )}
          {!usernameChecking && usernameAvailable === true && (
            <Ionicons name="checkmark-circle" size={20} color={colors.success} style={styles.inputRightIcon} />
          )}
          {!usernameChecking && usernameAvailable === false && (
            <Ionicons name="close-circle" size={20} color={colors.error} style={styles.inputRightIcon} />
          )}
        </View>
        {usernameAvailable === false && (
          <Text style={styles.errorText}>Username is already taken</Text>
        )}

        <View style={[styles.inputContainer, focusedInput === 'email' && styles.inputContainerFocused]}>
          <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textLight}
            value={formData.email}
            onChangeText={(text) => {
              const sanitized = sanitizeInput(text, MAX_EMAIL_LENGTH).toLowerCase();
              setFormData({ ...formData, email: sanitized });
              // Clear previous timeout
              if (emailCheckTimeoutRef.current) {
                clearTimeout(emailCheckTimeoutRef.current);
              }
              // Debounce email check
              emailCheckTimeoutRef.current = setTimeout(() => {
                checkEmail(sanitized);
              }, 500);
            }}
            onFocus={() => setFocusedInput('email')}
            onBlur={() => setFocusedInput(null)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {emailChecking && (
            <Ionicons name="hourglass-outline" size={20} color={colors.textSecondary} style={styles.inputRightIcon} />
          )}
          {!emailChecking && emailAvailable === true && (
            <Ionicons name="checkmark-circle" size={20} color={colors.success} style={styles.inputRightIcon} />
          )}
          {!emailChecking && emailAvailable === false && (
            <Ionicons name="close-circle" size={20} color={colors.error} style={styles.inputRightIcon} />
          )}
        </View>
        {emailAvailable === false && (
          <Text style={styles.errorText}>This email is already registered. Please sign in instead.</Text>
        )}

        <View style={[styles.dateInputContainer, focusedInput === 'dateOfBirth' && styles.dateInputContainerFocused]}>
          <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              setFocusedInput('dateOfBirth');
              setShowDatePicker(true);
            }}
            onBlur={() => setFocusedInput(null)}
          >
            <Text style={[styles.dateButtonText, !formData.dateOfBirth && styles.dateButtonPlaceholder]}>
              {formData.dateOfBirth ? format(formData.dateOfBirth, 'MMM dd, yyyy') : 'Date of Birth'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {Platform.OS === 'ios' ? (
          <Modal
            visible={showDatePicker}
            transparent={true}
            animationType="slide"
            onRequestClose={() => {
              setShowDatePicker(false);
              setFocusedInput(null);
            }}
          >
            <View style={styles.datePickerModal}>
              <View style={styles.datePickerContainer}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowDatePicker(false);
                      setFocusedInput(null);
                    }}
                    style={styles.datePickerCancel}
                  >
                    <Text style={styles.datePickerCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <View style={styles.datePickerTitleContainer}>
                    <Text style={styles.datePickerTitle}>Select Date of Birth</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowDatePicker(false);
                      setFocusedInput(null);
                    }}
                    style={styles.datePickerDone}
                  >
                    <Text style={styles.datePickerDoneText}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerContent}>
                  <DateTimePicker
                    value={formData.dateOfBirth || new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    minimumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 150))}
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        setFormData({ ...formData, dateOfBirth: selectedDate });
                      }
                    }}
                    style={styles.datePickerIOS}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          showDatePicker && (
            <DateTimePicker
              value={formData.dateOfBirth || new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
              mode="date"
              display="default"
              maximumDate={new Date()}
              minimumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 150))}
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                setFocusedInput(null);
                if (event.type === 'set' && selectedDate) {
                  setFormData({ ...formData, dateOfBirth: selectedDate });
                }
              }}
            />
          )
        )}
      </View>
    </View>
  );

  const renderStep3Avatar = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.stepTitle}>Choose your avatar</Text>
      <Text style={styles.stepDescription}>Pick an avatar to represent you</Text>
      <View style={styles.avatarGrid}>
        {AVATAR_SEEDS.map((seed) => (
          <TouchableOpacity
            key={seed}
            style={[
              styles.avatarGridItem,
              formData.avatarSeed === seed && styles.avatarGridItemSelected,
            ]}
            onPress={() => setFormData({ ...formData, avatarSeed: seed })}
            activeOpacity={0.7}
          >
            <Avatar seed={seed} size={56} />
            {formData.avatarSeed === seed && (
              <View style={styles.avatarGridCheck}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.stepTitle}>Create Password</Text>
      <Text style={styles.stepDescription}>Choose a secure password</Text>
      
      <View style={styles.form}>
        <View style={[styles.inputContainer, focusedInput === 'password' && styles.inputContainerFocused]}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textLight}
            value={formData.password}
            onChangeText={(text) => {
              // Limit password length to prevent DoS
              const limited = text.slice(0, MAX_PASSWORD_LENGTH);
              setFormData({ ...formData, password: limited });
            }}
            onFocus={() => setFocusedInput('password')}
            onBlur={() => setFocusedInput(null)}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons 
              name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
              size={20} 
              color={colors.textSecondary} 
            />
          </TouchableOpacity>
        </View>

        <View style={[styles.inputContainer, focusedInput === 'confirmPassword' && styles.inputContainerFocused]}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor={colors.textLight}
            value={formData.confirmPassword}
            onChangeText={(text) => {
              // Limit password length to prevent DoS
              const limited = text.slice(0, MAX_PASSWORD_LENGTH);
              setFormData({ ...formData, confirmPassword: limited });
            }}
            onFocus={() => setFocusedInput('confirmPassword')}
            onBlur={() => setFocusedInput(null)}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons 
              name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} 
              size={20} 
              color={colors.textSecondary} 
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.passwordHint}>
          Password must be at least {MIN_PASSWORD_LENGTH} characters and contain letters and numbers
        </Text>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.stepTitle}>Set Up PIN</Text>
      <Text style={styles.stepDescription}>
        {pinStep === 'enter' 
          ? 'Enter a 6-digit PIN to secure your app'
          : 'Confirm your 6-digit PIN'
        }
      </Text>
      
      <View style={styles.form}>
        <View style={[styles.inputContainer, focusedInput === 'pin' && styles.inputContainerFocused]}>
          <Ionicons 
            name={pinStep === 'enter' ? 'key-outline' : 'checkmark-circle-outline'} 
            size={20} 
            color={colors.textSecondary} 
            style={styles.inputIcon} 
          />
          <TextInput
            style={styles.pinInput}
            placeholder={pinStep === 'enter' ? 'Enter PIN' : 'Confirm PIN'}
            placeholderTextColor={colors.textLight}
            value={pinStep === 'enter' ? formData.pin : formData.confirmPin}
            onChangeText={(text) => {
              // Only allow digits and limit to 6 characters
              const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
              if (pinStep === 'enter') {
                setFormData({ ...formData, pin: digitsOnly });
                // Auto-advance when 6 digits entered
                if (digitsOnly.length === 6) {
                  setTimeout(() => {
                    setPinStep('confirm');
                    setFormData(prev => ({ ...prev, confirmPin: '' }));
                  }, 100);
                }
              } else {
                setFormData(prev => {
                  const updated = { ...prev, confirmPin: digitsOnly };
                  // Auto-validate when 6 digits entered in confirm step
                  if (digitsOnly.length === 6) {
                    setTimeout(() => {
                      setFormData(current => {
                        if (current.pin === digitsOnly) {
                          // PINs match, move to next step
                          setCurrentStep(5);
                          return current;
                        } else {
                          // PINs don't match
                          dialog.alert('Error', 'PINs do not match. Please try again.');
                          setPinStep('enter');
                          return { ...current, pin: '', confirmPin: '' };
                        }
                      });
                    }, 150);
                  }
                  return updated;
                });
              }
            }}
            onFocus={() => setFocusedInput('pin')}
            onBlur={() => setFocusedInput(null)}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            secureTextEntry={Platform.OS === 'ios'}
          />
        </View>
        
        {/* Show PIN dots for visual feedback */}
        <View style={styles.pinDotsContainer}>
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const currentValue = pinStep === 'enter' ? formData.pin : formData.confirmPin;
            return (
              <View
                key={index}
                style={[
                  styles.pinDot,
                  index < currentValue.length && styles.pinDotFilled,
                ]}
              />
            );
          })}
        </View>
        
        {pinStep === 'confirm' && (
          <TouchableOpacity
            style={styles.backButtonInline}
            onPress={() => {
              setPinStep('enter');
              setFormData({ ...formData, confirmPin: '' });
            }}
          >
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={styles.backButtonTextInline}>Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderStep5 = () => {
    const toneOptions: Array<{ value: 'friendly' | 'professional' | 'direct' | 'harsh'; label: string; description: string; icon: string }> = [
      {
        value: 'friendly',
        label: 'Friendly & Supportive',
        description: 'Warm, encouraging, gentle guidance',
        icon: 'heart-outline',
      },
      {
        value: 'professional',
        label: 'Professional & Calm',
        description: 'Formal, measured, professional advice',
        icon: 'briefcase-outline',
      },
      {
        value: 'direct',
        label: 'Direct & No-Nonsense',
        description: 'Straightforward, no sugar-coating, casual language',
        icon: 'chatbubble-outline',
      },
      {
        value: 'harsh',
        label: 'Harsh & Brutally Honest',
        description: 'Uses strong language, very direct, tough love approach, and use curse words',
        icon: 'flame-outline',
      },
    ];

    return (
      <View style={styles.stepContainer}>
        <View style={styles.logoContainerSmall}>
          <Image 
            source={require('../../assets/PennyLogoTransparent.png')} 
            style={styles.logoSmall}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.stepTitle}>Choose AI Tone</Text>
        <Text style={styles.stepDescription}>
          How should Penny's AI talk to you?
        </Text>
        
        <View style={styles.toneOptionsContainer}>
          {toneOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.toneOptionCardCompact,
                formData.aiTone === option.value && styles.toneOptionCardCompactSelected,
              ]}
              onPress={() => setFormData({ ...formData, aiTone: option.value })}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={option.icon as any} 
                size={20} 
                color={formData.aiTone === option.value ? colors.primary : colors.textSecondary} 
              />
              <View style={styles.toneOptionTextContainer}>
                <Text style={[
                  styles.toneOptionLabelCompact,
                  formData.aiTone === option.value && styles.toneOptionLabelCompactSelected,
                ]}>
                  {option.label}
                </Text>
                <Text style={styles.toneOptionDescriptionCompact}>{option.description}</Text>
              </View>
              {formData.aiTone === option.value && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
        
        <Text style={styles.toneNote}>
          You can change this later in Profile settings
        </Text>
      </View>
    );
  };

  const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
    { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
    { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
    { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  ];

  const renderStep6 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.stepTitle}>Configure Preferences</Text>
      <Text style={styles.stepDescription}>Set up your default settings</Text>
      
      {/* Currency Selection */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceLabel}>Default Currency</Text>
        <TouchableOpacity
          style={styles.preferenceDropdown}
          onPress={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
          activeOpacity={0.7}
        >
          <Text style={styles.preferenceDropdownText}>
            {currencies.find(c => c.code === defaultCurrency)?.symbol} {defaultCurrency}
          </Text>
          <Ionicons 
            name={showCurrencyDropdown ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color={colors.textSecondary} 
          />
        </TouchableOpacity>
        {showCurrencyDropdown && (
          <ScrollView 
            style={styles.preferenceDropdownList}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {currencies.map((currency, index) => (
              <TouchableOpacity
                key={currency.code}
                style={[
                  styles.preferenceDropdownItem,
                  index === currencies.length - 1 && styles.preferenceDropdownItemLast,
                  defaultCurrency === currency.code && styles.preferenceDropdownItemActive,
                ]}
                onPress={() => {
                  setDefaultCurrency(currency.code);
                  setShowCurrencyDropdown(false);
                }}
              >
                <Text
                  style={[
                    styles.preferenceDropdownItemText,
                    defaultCurrency === currency.code && styles.preferenceDropdownItemTextActive,
                  ]}
                >
                  {currency.symbol} {currency.code} - {currency.name}
                </Text>
                {defaultCurrency === currency.code && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Low Balance Threshold */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceLabel}>Low Balance Warning</Text>
        <Text style={styles.preferenceDescription}>
          Get notified when balance falls below this amount
        </Text>
        <View style={styles.thresholdButtonsContainer}>
          {[50, 100, 200, 500].map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[
                styles.thresholdButtonOnboarding,
                !isCustomThreshold && lowBalanceThreshold === amount && styles.thresholdButtonOnboardingActive,
              ]}
              onPress={() => {
                setIsCustomThreshold(false);
                setCustomThreshold('');
                setLowBalanceThreshold(amount);
              }}
            >
              <Text
                style={[
                  styles.thresholdButtonOnboardingText,
                  !isCustomThreshold && lowBalanceThreshold === amount && styles.thresholdButtonOnboardingTextActive,
                ]}
              >
                {currencies.find(c => c.code === defaultCurrency)?.symbol}{amount}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.thresholdButtonOnboarding,
              isCustomThreshold && styles.thresholdButtonOnboardingActive,
            ]}
            onPress={() => {
              setIsCustomThreshold(true);
              setCustomThreshold(lowBalanceThreshold.toString());
            }}
          >
            <Text
              style={[
                styles.thresholdButtonOnboardingText,
                isCustomThreshold && styles.thresholdButtonOnboardingTextActive,
              ]}
            >
              Custom
            </Text>
          </TouchableOpacity>
        </View>
        {isCustomThreshold && (
          <View style={styles.customThresholdContainer}>
            <Text style={styles.customThresholdLabel}>
              Enter custom amount ({currencies.find(c => c.code === defaultCurrency)?.symbol})
            </Text>
            <TextInput
              style={[
                styles.customThresholdInput,
                focusedInput === 'customThreshold' && styles.customThresholdInputFocused,
              ]}
              value={customThreshold}
              onChangeText={(text) => {
                // Only allow numbers and decimal point
                const numericValue = text.replace(/[^0-9.]/g, '');
                setCustomThreshold(numericValue);
                // Update threshold if valid
                const numValue = parseFloat(numericValue);
                if (!isNaN(numValue) && numValue > 0) {
                  setLowBalanceThreshold(numValue);
                }
              }}
              placeholder={`${currencies.find(c => c.code === defaultCurrency)?.symbol || '$'}0.00`}
              placeholderTextColor={colors.textLight}
              keyboardType="decimal-pad"
              onFocus={() => setFocusedInput('customThreshold')}
              onBlur={() => setFocusedInput(null)}
            />
            {customThreshold && parseFloat(customThreshold) <= 0 && (
              <Text style={styles.customThresholdError}>
                Please enter a positive number
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const renderStep7 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.stepTitle}>Enable Features</Text>
      <Text style={styles.stepDescription}>Optional but recommended</Text>
      
      <View style={styles.permissionsContainer}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionCardHeader}>
            <Ionicons name="notifications-outline" size={24} color={colors.primary} />
            <Text style={styles.permissionTitleCompact}>Notifications</Text>
          </View>
          <Text style={styles.permissionDescriptionCompact}>
            Get alerts for low balances and budget warnings
          </Text>
          {notificationPermission === null ? (
            <TouchableOpacity
              style={styles.permissionButtonCompact}
              onPress={handleRequestNotifications}
            >
              <Text style={styles.permissionButtonTextCompact}>Enable</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.permissionStatusCompact}>
              <Ionicons 
                name={notificationPermission ? 'checkmark-circle' : 'close-circle'} 
                size={20} 
                color={notificationPermission ? colors.success : colors.textSecondary} 
              />
              <Text style={styles.permissionStatusTextCompact}>
                {notificationPermission ? 'Enabled' : 'Not Enabled'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.permissionCard}>
          <View style={styles.permissionCardHeader}>
            <Ionicons 
              name={Platform.OS === 'ios' ? 'finger-print-outline' : 'finger-print'} 
              size={24} 
              color={colors.primary} 
            />
            <Text style={styles.permissionTitleCompact}>{biometricType}</Text>
          </View>
          <Text style={styles.permissionDescriptionCompact}>
            Sign in quickly with {biometricType.toLowerCase()}
          </Text>
          {biometricAvailable ? (
            !biometricEnabled ? (
              <TouchableOpacity
                style={styles.permissionButtonCompact}
                onPress={handleEnableBiometric}
              >
                <Text style={styles.permissionButtonTextCompact}>Enable</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.permissionStatusCompact}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.permissionStatusTextCompact}>Enabled</Text>
              </View>
            )
          ) : (
            <Text style={styles.permissionUnavailableCompact}>Not available</Text>
          )}
        </View>
      </View>
    </View>
  );

  const renderStep8 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainerSmall}>
        <Image 
          source={require('../../assets/PennyLogoTransparent.png')} 
          style={styles.logoSmall}
          resizeMode="contain"
        />
      </View>
      <Ionicons name="checkmark-circle" size={80} color={colors.primary} style={styles.completeIcon} />
      <Text style={styles.stepTitle}>You're All Set!</Text>
      <Text style={styles.stepDescription}>
        We're creating your account. You'll need to sign in with your email and password first.
      </Text>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3Avatar();
      case 4:
        return renderStep3();
      case 5:
        return renderStep4();
      case 6:
        return renderStep5();
      case 7:
        return renderStep6();
      case 8:
        return renderStep7();
      case 9:
        return renderStep8();
      default:
        return renderStep1();
    }
  };

  return (
    <View style={styles.wrapper}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
        bounces={false}
        alwaysBounceVertical={false}
      >
        <View style={[
          styles.content,
          { 
            paddingTop: Math.max(insets.top + (isSmallScreen ? 20 : 32), isSmallScreen ? 40 : 60),
            paddingBottom: Math.max(insets.bottom + (isSmallScreen ? 24 : 32), isSmallScreen ? 24 : 32),
            minHeight: SCREEN_HEIGHT - insets.top - insets.bottom
          }
        ]}>
          <View style={styles.progressWrapper}>
            {renderProgressDots()}
          </View>
          
          <Animated.View
            style={[
              styles.stepWrapper,
              {
                opacity: slideAnim.interpolate({
                  inputRange: [0, totalSteps - 1],
                  outputRange: [1, 1],
                }),
              },
            ]}
          >
            {renderCurrentStep()}
          </Animated.View>

          <View style={styles.buttonContainer}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                disabled={loading}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextButton, loading && styles.nextButtonDisabled]}
              onPress={async () => {
                console.log('[SignupOnboarding] Button pressed, currentStep:', currentStep, 'loading:', loading);
                if (!loading) {
                  try {
                    await handleNext();
                  } catch (error) {
                    console.error('[SignupOnboarding] Error in handleNext:', error);
                  }
                }
              }}
              disabled={loading}
            >
              <Text style={styles.nextButtonText}>
                {loading 
                  ? 'Creating Account...' 
                  : currentStep === totalSteps 
                    ? 'Create Account' 
                    : currentStep === 5 && pinStep === 'enter'
                    ? 'Continue'
                    : currentStep === 5 && pinStep === 'confirm'
                    ? 'Confirm'
                    : 'Continue'
                }
              </Text>
            </TouchableOpacity>
          </View>

          {currentStep === 1 && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.skipButtonText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 375;
const isLargeScreen = SCREEN_WIDTH > 414;

const createStyles = (colors: any) => StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: SCREEN_HEIGHT,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: isLargeScreen ? 450 : 400,
    alignSelf: 'center',
    paddingHorizontal: isSmallScreen ? 16 : 20,
    justifyContent: 'space-between',
  },
  progressWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: isSmallScreen ? 24 : 32,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: isSmallScreen ? 6 : 8,
    width: '100%',
  },
  progressDot: {
    width: isSmallScreen ? 6 : 8,
    height: isSmallScreen ? 6 : 8,
    borderRadius: isSmallScreen ? 3 : 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressDotActive: {
    width: isSmallScreen ? 20 : 24,
    height: isSmallScreen ? 6 : 8,
    borderRadius: isSmallScreen ? 3 : 4,
    backgroundColor: colors.primary,
    overflow: 'hidden',
  },
  progressDotCompleted: {
    backgroundColor: colors.primary,
    overflow: 'hidden',
  },
  stepWrapper: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
    flexShrink: 1,
  },
  stepContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: isSmallScreen ? 8 : 16,
    flexShrink: 1,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: isSmallScreen ? 140 : 160,
    height: isSmallScreen ? 140 : 160,
  },
  logoContainerSmall: {
    alignItems: 'center',
    marginBottom: isSmallScreen ? 20 : 24,
  },
  logoSmall: {
    width: isSmallScreen ? 120 : 140,
    height: isSmallScreen ? 120 : 140,
  },
  pennyText: {
    fontFamily: 'GulfsDisplay-Normal',
    fontSize: isSmallScreen ? 48 : 56,
    fontWeight: '400',
    color: colors.text,
    letterSpacing: -1,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: isSmallScreen ? 12 : 16,
    fontSize: isSmallScreen ? 28 : typography.h2.fontSize,
  },
  pennyTitleText: {
    fontFamily: 'GulfsDisplay-Normal',
    fontWeight: '500',
    letterSpacing: 1,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: isSmallScreen ? 24 : 32,
    lineHeight: 24,
    fontSize: isSmallScreen ? 14 : typography.body.fontSize,
    paddingHorizontal: isSmallScreen ? 8 : 0,
  },
  featuresList: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    ...typography.body,
    color: colors.text,
  },
  stepTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    fontSize: isSmallScreen ? 24 : typography.h2.fontSize,
  },
  stepDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: isSmallScreen ? 24 : 32,
    fontSize: isSmallScreen ? 14 : typography.body.fontSize,
    paddingHorizontal: isSmallScreen ? 8 : 0,
  },
  form: {
    width: '100%',
    alignItems: 'center',
    flexShrink: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: isSmallScreen ? 12 : 16,
    paddingHorizontal: isSmallScreen ? 12 : 16,
    minHeight: isSmallScreen ? 52 : 56,
  },
  inputContainerFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: 12,
  },
  inputRightIcon: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: isSmallScreen ? 15 : 16,
    color: colors.text,
    minHeight: isSmallScreen ? 52 : 56,
  },
  eyeIcon: {
    padding: 4,
  },
  dateButton: {
    flex: 1,
    justifyContent: 'center',
    minHeight: isSmallScreen ? 52 : 56,
  },
  dateButtonText: {
    fontSize: isSmallScreen ? 15 : 16,
    color: colors.text,
  },
  dateButtonPlaceholder: {
    color: colors.textLight,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  dateInputContainerFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  datePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  datePickerContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.6,
    minHeight: isSmallScreen ? 300 : 350,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isSmallScreen ? 16 : 20,
    paddingVertical: isSmallScreen ? 12 : 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    width: '100%',
  },
  datePickerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: -1,
  },
  datePickerTitle: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '600',
    fontSize: isSmallScreen ? 16 : typography.h3.fontSize,
    textAlign: 'center',
  },
  datePickerCancel: {
    paddingVertical: 8,
    paddingHorizontal: isSmallScreen ? 8 : 12,
    minWidth: 60,
    zIndex: 1,
  },
  datePickerCancelText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    fontSize: isSmallScreen ? 15 : typography.body.fontSize,
  },
  datePickerDone: {
    paddingVertical: 8,
    paddingHorizontal: isSmallScreen ? 8 : 12,
    minWidth: 60,
    alignItems: 'flex-end',
    zIndex: 1,
  },
  datePickerDoneText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    fontSize: isSmallScreen ? 15 : typography.body.fontSize,
  },
  datePickerContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isSmallScreen ? 8 : 16,
    paddingHorizontal: isSmallScreen ? 8 : 16,
  },
  datePickerIOS: {
    width: '100%',
    height: isSmallScreen ? 180 : 216,
    maxWidth: 400,
  },
  passwordHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -8,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: -12,
    marginBottom: 8,
    marginLeft: 4,
  },
  permissionsContainer: {
    gap: isSmallScreen ? 12 : 16,
    width: '100%',
  },
  permissionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: isSmallScreen ? 16 : 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  permissionTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  permissionTitleCompact: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    fontSize: isSmallScreen ? 15 : 16,
  },
  permissionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionDescriptionCompact: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: isSmallScreen ? 12 : 16,
    fontSize: isSmallScreen ? 12 : 13,
    lineHeight: 18,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 160,
  },
  permissionButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionButtonCompact: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: isSmallScreen ? 8 : 10,
    paddingHorizontal: isSmallScreen ? 20 : 24,
    width: '100%',
    alignItems: 'center',
  },
  permissionButtonTextCompact: {
    ...typography.bodySmall,
    color: colors.background,
    fontWeight: '600',
    fontSize: isSmallScreen ? 13 : 14,
  },
  permissionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permissionStatusText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  permissionStatusCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  permissionStatusTextCompact: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
    fontSize: isSmallScreen ? 13 : 14,
  },
  permissionUnavailable: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  permissionUnavailableCompact: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: isSmallScreen ? 12 : 13,
    fontStyle: 'italic',
  },
  pinInput: {
    flex: 1,
    fontSize: isSmallScreen ? 18 : 20,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? 4 : 2,
    fontWeight: '600',
    paddingVertical: 0,
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: isSmallScreen ? 10 : 12,
    marginTop: isSmallScreen ? 16 : 20,
    marginBottom: isSmallScreen ? 12 : 16,
  },
  pinDot: {
    width: isSmallScreen ? 10 : 12,
    height: isSmallScreen ? 10 : 12,
    borderRadius: isSmallScreen ? 5 : 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  backButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: isSmallScreen ? 12 : 16,
    padding: isSmallScreen ? 8 : 12,
    gap: 6,
  },
  backButtonTextInline: {
    fontSize: isSmallScreen ? 14 : 16,
    color: colors.primary,
    fontWeight: '600',
  },
  preferenceSection: {
    width: '100%',
    marginBottom: isSmallScreen ? 20 : 24,
  },
  preferenceLabel: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 8,
    fontSize: isSmallScreen ? 16 : 18,
  },
  preferenceDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 12,
    fontSize: isSmallScreen ? 13 : 14,
  },
  preferenceDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: isSmallScreen ? 12 : 16,
    paddingVertical: isSmallScreen ? 14 : 16,
    minHeight: isSmallScreen ? 50 : 56,
  },
  preferenceDropdownText: {
    ...typography.body,
    color: colors.text,
    fontSize: isSmallScreen ? 15 : 16,
  },
  preferenceDropdownList: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
    maxHeight: 250,
  },
  preferenceDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isSmallScreen ? 12 : 16,
    paddingVertical: isSmallScreen ? 12 : 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  preferenceDropdownItemLast: {
    borderBottomWidth: 0,
  },
  preferenceDropdownItemActive: {
    backgroundColor: colors.primary + '10',
  },
  preferenceDropdownItemText: {
    ...typography.body,
    color: colors.text,
    fontSize: isSmallScreen ? 14 : 15,
  },
  preferenceDropdownItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  swipeDirectionContainer: {
    gap: 12,
    marginTop: 8,
  },
  swipeDirectionOption: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: isSmallScreen ? 14 : 16,
  },
  swipeDirectionOptionActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '10',
  },
  swipeDirectionCard: {
    gap: 8,
  },
  swipeDirectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  swipeDirectionTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  swipeDirectionAction: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: isSmallScreen ? 12 : 13,
    marginBottom: 4,
  },
  swipeDirectionResult: {
    ...typography.body,
    color: colors.text,
    fontSize: isSmallScreen ? 15 : 16,
    fontWeight: '700',
  },
  swipeDirectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  thresholdButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  thresholdButtonOnboarding: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: isSmallScreen ? 10 : 12,
    paddingHorizontal: isSmallScreen ? 16 : 20,
    minWidth: 80,
    alignItems: 'center',
  },
  thresholdButtonOnboardingActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  thresholdButtonOnboardingText: {
    ...typography.body,
    color: colors.text,
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: '500',
  },
  thresholdButtonOnboardingTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  customThresholdContainer: {
    marginTop: 16,
    gap: 8,
  },
  customThresholdLabel: {
    ...typography.bodySmall,
    color: colors.text,
    fontSize: isSmallScreen ? 13 : 14,
    fontWeight: '500',
  },
  customThresholdInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: isSmallScreen ? 12 : 16,
    paddingVertical: isSmallScreen ? 14 : 16,
    fontSize: isSmallScreen ? 15 : 16,
    color: colors.text,
    minHeight: isSmallScreen ? 50 : 56,
  },
  customThresholdInputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  customThresholdError: {
    ...typography.bodySmall,
    color: colors.error,
    fontSize: isSmallScreen ? 12 : 13,
    marginTop: 4,
  },
  completeIcon: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: isSmallScreen ? 8 : 12,
    marginTop: isSmallScreen ? 24 : 32,
  },
  backButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: isSmallScreen ? 52 : 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    fontSize: isSmallScreen ? 15 : typography.body.fontSize,
  },
  nextButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: isSmallScreen ? 52 : 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '600',
    fontSize: isSmallScreen ? 16 : 18,
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  toneOptionsContainer: {
    width: '100%',
    gap: 8,
    marginBottom: isSmallScreen ? 16 : 20,
  },
  toneOptionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: isSmallScreen ? 16 : 20,
    borderWidth: 2,
    borderColor: colors.border,
  },
  toneOptionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  toneOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  toneOptionLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    fontSize: isSmallScreen ? 15 : 16,
  },
  toneOptionLabelSelected: {
    color: colors.primary,
  },
  toneOptionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: isSmallScreen ? 12 : 13,
    lineHeight: 18,
    marginLeft: 36,
  },
  toneOptionCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: isSmallScreen ? 12 : 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  toneOptionCardCompactSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '10',
  },
  toneOptionTextContainer: {
    flex: 1,
    gap: 2,
  },
  toneOptionLabelCompact: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    fontSize: isSmallScreen ? 14 : 15,
  },
  toneOptionLabelCompactSelected: {
    color: colors.primary,
  },
  toneOptionDescriptionCompact: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: isSmallScreen ? 11 : 12,
    lineHeight: 16,
  },
  toneNote: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: isSmallScreen ? 12 : 13,
    fontStyle: 'italic',
    marginTop: 8,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: isSmallScreen ? 12 : 16,
    width: '100%',
    paddingHorizontal: 8,
  },
  avatarGridItem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  avatarGridItemSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  avatarGridCheck: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
});

