import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Styles } from '../../constants/Styles';
import { fetchAPI, APIError } from '../../utils/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAPI('/auth/forgot-password', {
        method: 'POST',
        headers: {
          'x-mobile-app': 'true', // Indicate this is from mobile app
        },
        body: JSON.stringify({ email }),
      });

      setSuccess(true);
      Alert.alert(
        'Success!',
        response.message || 'Password reset link has been sent to your email. Please check your inbox.',
        [
          {
            text: 'OK',
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
          // Rate limit error
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
    <ImageBackground
      source={require('../../assets/background.png')}
      style={{ flex: 1 }}
      imageStyle={{ top: -100 }}
      resizeMode="cover"
    >
      <View style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 51, 102, 0.75)' }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 60 : 40,
              left: 24,
              zIndex: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginBottom: 48 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 200, height: 80, resizeMode: 'contain', marginBottom: 16 }}
            />
            <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', fontWeight: '500', textAlign: 'center' }}>
              Attendance Management System
            </Text>
          </View>

          <View style={[Styles.card, { padding: 32 }]}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: Colors.light.primary + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Ionicons name="lock-closed-outline" size={32} color={Colors.light.primary} />
              </View>
              <Text style={[Styles.title, { textAlign: 'center' }]}>Forgot Password?</Text>
              <Text style={[Styles.subtitle, { textAlign: 'center', marginTop: 8 }]}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Email Address</Text>
              <TextInput
                style={Styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.light.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading && !success}
              />
            </View>

            <TouchableOpacity
              style={[Styles.btnPrimary, { marginTop: 16 }]}
              onPress={handleForgotPassword}
              disabled={loading || success}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={Styles.btnPrimaryText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>

            <View style={{ marginTop: 24, alignItems: 'center' }}>
              <Text style={{ color: Colors.light.textMuted }}>Remember your password?</Text>
              <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
                <Text style={{ color: Colors.light.primary, fontWeight: '700', fontSize: 16 }}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
