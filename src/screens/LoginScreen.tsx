import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDialog } from '../contexts/DialogContext';
import { loginUser, resetPassword, initFirebase } from '../services/firebase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  saveBiometricCredentials,
  isBiometricAvailable,
  hasBiometricCredentials,
  getBiometricType,
  performBiometricLogin,
} from '../services/biometricService';

export default function LoginScreen() {
  const router = useRouter();
  const dialog = useDialog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showBiometricLogin, setShowBiometricLogin] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');

  // Check if biometric login is available on mount
  useEffect(() => {
    const checkBiometricLogin = async () => {
      try {
        const available = await isBiometricAvailable();
        const hasCredentials = await hasBiometricCredentials();
        
        if (available && hasCredentials) {
          const type = await getBiometricType();
          setBiometricType(type);
          setShowBiometricLogin(true);
        }
      } catch (error) {
        console.error('Error checking biometric login:', error);
        // Don't show biometric login if check fails
        setShowBiometricLogin(false);
      }
    };
    
    checkBiometricLogin();
  }, []);

  const handleBiometricLogin = async () => {
    try {
      setLoading(true);
      await performBiometricLogin();
      // Navigation will be handled by auth state change listener
    } catch (error: any) {
      console.error('Biometric login error:', error);
      // Only show error if not cancelled by user
      if (!error.message?.includes('cancelled') && !error.message?.includes('Authentication cancelled')) {
        dialog.alert('Biometric Login Failed', 'Please use your email and password to sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      dialog.alert('Error', 'Please enter your email');
      return;
    }
    if (!password.trim()) {
      dialog.alert('Error', 'Please enter your password');
      return;
    }

    try {
      setLoading(true);
      await initFirebase();
      await loginUser(email.trim(), password);
      
      // Ask user if they want to enable biometric login (security best practice)
      // Don't auto-save credentials - require user consent
      const biometricAvailable = await isBiometricAvailable();
      const hasCredentials = await hasBiometricCredentials();
      
      if (biometricAvailable && !hasCredentials) {
        // Ask user for consent to save credentials for biometric login
        dialog.showDialog(
          'Enable Biometric Login?',
          `You can use ${await getBiometricType()} to sign in quickly next time. Your credentials are stored securely on this device only.`,
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => {
                // User declined - that's fine, continue without saving
              }
            },
            {
              text: 'Enable',
              onPress: async () => {
                try {
                  await saveBiometricCredentials(email.trim(), password);
                  console.log('Biometric credentials saved with user consent');
                } catch (error) {
                  console.error('Error saving biometric credentials:', error);
                  // Don't show error to user - login was successful, just biometric save failed
                }
              }
            }
          ]
        );
      }
      
      // Check if PIN is set - if not, PIN setup screen will be shown by _layout.tsx
      // Navigation will be handled by auth state listener and _layout.tsx PIN check
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
      
      dialog.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      dialog.alert('Error', 'Please enter your email address first');
      return;
    }

    try {
      await initFirebase();
      await resetPassword(email.trim());
      dialog.alert('Password Reset', 'Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Password reset error:', error);
      let errorMessage = 'Failed to send reset email.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      }
      
      dialog.alert('Error', errorMessage);
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

            {/* Biometric Login Button - Show if credentials are saved */}
            {showBiometricLogin && (
              <TouchableOpacity
                style={[styles.biometricButton, loading && styles.biometricButtonDisabled]}
                onPress={handleBiometricLogin}
                disabled={loading}
              >
                <Ionicons 
                  name={Platform.OS === 'ios' ? 'finger-print-outline' : 'finger-print'} 
                  size={24} 
                  color={colors.primary} 
                />
                <Text style={styles.biometricButtonText}>
                  {loading ? 'Signing in...' : `Use ${biometricType}`}
                </Text>
              </TouchableOpacity>
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
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    height: 48,
    gap: 8,
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  biometricButtonDisabled: {
    opacity: 0.6,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
});








