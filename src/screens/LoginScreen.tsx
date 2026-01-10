import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loginUser, resetPassword, initFirebase } from '../services/firebase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  isBiometricAvailable,
  getBiometricType,
  performBiometricLogin,
  saveBiometricCredentials,
  hasBiometricCredentials,
} from '../services/biometricService';
import { getSettings, waitForFirebase } from '../services/settingsService';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

  // Check biometric availability and settings on mount
  useEffect(() => {
    const checkBiometric = async () => {
      try {
        const available = await isBiometricAvailable();
        setBiometricAvailable(available);
        
        if (available) {
          const type = await getBiometricType();
          setBiometricType(type);
          
          // Check if user has enabled biometric in settings
          try {
            await waitForFirebase();
            const settings = await getSettings();
            setBiometricEnabled(settings.enableBiometric);
            
            // Check if credentials are saved
            const hasCredentials = await hasBiometricCredentials();
            setHasSavedCredentials(hasCredentials);
            
            // Auto-trigger biometric login if enabled and credentials exist
            if (settings.enableBiometric && hasCredentials) {
              // Small delay to let UI render first
              setTimeout(() => {
                handleBiometricLogin();
              }, 500);
            }
          } catch (error) {
            console.error('Error checking biometric settings:', error);
          }
        }
      } catch (error) {
        console.error('Error checking biometric availability:', error);
      }
    };
    
    checkBiometric();
  }, []);

  const handleBiometricLogin = async () => {
    try {
      setLoading(true);
      await performBiometricLogin();
      // Navigation will be handled by App.tsx auth state listener
    } catch (error: any) {
      console.error('Biometric login error:', error);
      if (error.message !== 'Authentication cancelled') {
        Alert.alert('Biometric Login Failed', error.message || 'Failed to authenticate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    try {
      setLoading(true);
      await initFirebase();
      await loginUser(email.trim(), password);
      
      // Save credentials for biometric login if biometric is enabled
      if (biometricEnabled && biometricAvailable) {
        try {
          await saveBiometricCredentials(email.trim(), password);
          setHasSavedCredentials(true);
        } catch (error) {
          console.error('Error saving biometric credentials:', error);
          // Don't show error to user, login was successful
        }
      }
      
      // Navigation will be handled by App.tsx auth state listener
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Failed to login. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address first');
      return;
    }

    try {
      await initFirebase();
      await resetPassword(email.trim());
      Alert.alert('Password Reset', 'Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Password reset error:', error);
      let errorMessage = 'Failed to send reset email.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      }
      
      Alert.alert('Error', errorMessage);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Logo/Icon */}
          <View style={styles.iconContainer}>
            {/* #region agent log */}
            {(() => {
              fetch('http://127.0.0.1:7242/ingest/aceffbfb-b340-43b7-8241-940342337900',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/screens/LoginScreen.tsx:90',message:'Loading logo asset',data:{assetPath:'../../assets/Penny Logo RD.png',component:'LoginScreen'},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
              return null;
            })()}
            {/* #endregion */}
            <Image 
              source={require('../../assets/Penny Logo RD.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textLight}
                value={password}
                onChangeText={setPassword}
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

            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            {/* Biometric Login Button */}
            {biometricAvailable && biometricEnabled && hasSavedCredentials && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TouchableOpacity
                  style={[styles.biometricButton, loading && styles.biometricButtonDisabled]}
                  onPress={handleBiometricLogin}
                  disabled={loading}
                >
                  <Ionicons 
                    name={Platform.OS === 'ios' ? 'finger-print-outline' : 'finger-print'} 
                    size={24} 
                    color={colors.background} 
                  />
                  <Text style={styles.biometricButtonText}>
                    {loading ? 'Authenticating...' : `Sign in with ${biometricType}`}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 160,
    height: 160,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    fontWeight: '500',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: colors.text,
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  signupLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    gap: 12,
    marginBottom: 24,
  },
  biometricButtonDisabled: {
    opacity: 0.6,
  },
  biometricButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
});








