import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Styles } from '../../constants/Styles';
import { fetchAPI, APIError } from '../../utils/api';

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
      Alert.alert('Error', 'Invalid reset link. Please request a new password reset.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    }
  }, [token]);

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await fetchAPI('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      Alert.alert(
        'Success',
        'Your password has been reset successfully. You can now sign in with your new password.',
        [
          {
            text: 'OK',
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
            onPress={() => router.replace('/(auth)/login')}
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
                <Ionicons name="key-outline" size={32} color={Colors.light.primary} />
              </View>
              <Text style={[Styles.title, { textAlign: 'center' }]}>Reset Password</Text>
              <Text style={[Styles.subtitle, { textAlign: 'center', marginTop: 8 }]}>
                Enter your new password below.
              </Text>
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>New Password</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[Styles.input, { paddingRight: 48 }]}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={Colors.light.textLight}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.light.textLight}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Confirm Password</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[Styles.input, { paddingRight: 48 }]}
                  placeholder="Re-enter password"
                  placeholderTextColor={Colors.light.textLight}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.light.textLight}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[Styles.btnPrimary, { marginTop: 16 }]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={Styles.btnPrimaryText}>Reset Password</Text>
              )}
            </TouchableOpacity>

            <View style={{ marginTop: 24, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
                <Text style={{ color: Colors.light.primary, fontWeight: '700', fontSize: 16 }}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
