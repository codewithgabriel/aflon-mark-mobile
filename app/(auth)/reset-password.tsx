import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { APIError, fetchAPI } from '../../utils/api';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();
  const token = params.token as string;

  useEffect(() => {
    if (!token) {
      Alert.alert('Invalid Link', 'This password reset link is invalid or incomplete. Please request a new link.', [
        { text: 'Return to Sign In', onPress: () => router.replace('/(auth)/login') },
      ]);
    }
  }, [token]);

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Missing Input', 'Please fill in both password fields.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Password Length', 'Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match. Please verify and try again.');
      return;
    }

    setLoading(true);
    try {
      await fetchAPI('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      Alert.alert(
        'Password Updated',
        'Your password has been reset successfully. You can now sign in with your new credentials.',
        [
          {
            text: 'Sign In Now',
            onPress: () => router.replace('/(auth)/login'),
          },
        ]
      );
    } catch (err: any) {
      const title = err instanceof APIError && err.status === 0 ? 'Connection Error' : 'Reset Failed';
      let message = err.message || 'Unable to reset your password. Please try again.';

      if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        message = 'This reset link has expired or is invalid. Please request a new one.';
      }

      Alert.alert(title, message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ImageBackground
        source={require('../../assets/background.png')}
        style={{ flex: 1 }}
        imageStyle={{ top: -80 }}
        resizeMode="cover"
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 31, 63, 0.82)' }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: Platform.OS === 'ios' ? 56 : 36,
              paddingBottom: 48,
              justifyContent: 'center',
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Header / Back */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Sign In</Text>
              </TouchableOpacity>
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: 140, height: 55, resizeMode: 'contain' }}
              />
            </View>

            {/* Card */}
            <View style={styles.glassCard}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name="shield-key-outline" size={36} color="#001f3f" />
                </View>
                <Text style={styles.cardTitle}>Set New Password</Text>
                <Text style={styles.cardSubtitle}>
                  Choose a secure password with at least 8 characters.
                </Text>
              </View>

              {/* New Password */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="At least 8 characters"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={{ padding: 4 }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#718096"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock-check-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="Repeat new password"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ padding: 4 }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#718096"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.primaryButton, loading && { opacity: 0.75 }]}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.primaryButtonText}>Updating Password...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.primaryButtonText}>Save New Password</Text>
                    <MaterialCommunityIcons name="check" size={18} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 28,
    shadowColor: '#001f3f',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 119, 182, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#001f3f',
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4a5568',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
  },
  textInputField: {
    flex: 1,
    fontSize: 15,
    color: '#001f3f',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#001f3f',
    borderRadius: 18,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#001f3f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
});
