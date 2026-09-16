import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAPI('/auth/forgot-password', {
        method: 'POST',
        headers: {
          'x-mobile-app': 'true',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      setSuccess(true);
      Alert.alert(
        'Link Dispatched',
        response.message || 'Password reset link has been sent to your email. Please check your inbox.',
        [
          {
            text: 'Return to Sign In',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      if (err instanceof APIError) {
        if (err.status === 0) {
          Alert.alert('Connection Error', 'Unable to connect to the server. Please check your internet connection.');
        } else if (err.status === 404) {
          Alert.alert('Email Not Found', 'No account exists with this email address. Please check and try again.');
        } else if (err.status === 429) {
          Alert.alert('Too Many Requests', err.message || 'Please wait a moment before trying again.');
        } else {
          Alert.alert('Request Failed', err.message || 'Unable to process your request. Please try again.');
        }
      } else {
        Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      }
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
                onPress={() => router.back()}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Back</Text>
              </TouchableOpacity>
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: 140, height: 55, resizeMode: 'contain' }}
              />
            </View>

            {/* Card */}
            <View style={styles.glassCard}>
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name="lock-reset" size={36} color="#001f3f" />
                </View>
                <Text style={styles.cardTitle}>Forgot Password?</Text>
                <Text style={styles.cardSubtitle}>
                  {"Enter your registered email address and we'll send you instructions to reset your account password."}
                </Text>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="email-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="staff@aflon.edu.ng"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    editable={!loading && !success}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, (loading || success) && { opacity: 0.75 }]}
                onPress={handleForgotPassword}
                disabled={loading || success}
                activeOpacity={0.88}
              >
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.primaryButtonText}>Sending Instructions...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                    <MaterialCommunityIcons name="send" size={16} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>

              <View style={{ marginTop: 24, alignItems: 'center' }}>
                <Text style={{ color: '#718096', fontSize: 13, fontWeight: '500' }}>
                  Remembered your password?
                </Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 6 }} activeOpacity={0.7}>
                  <Text style={{ color: '#0077b6', fontWeight: '800', fontSize: 15 }}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
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
    marginBottom: 8,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
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
