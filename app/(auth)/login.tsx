import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Styles } from '../../constants/Styles';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI, APIError } from '../../utils/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response && response.user) {
        await signIn(response.user);
      }
    } catch (err: any) {
      const title = err instanceof APIError && err.status === 0 ? 'Connection Error' : 'Login Failed';
      Alert.alert(title, err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={{ flex: 1 }}
      imageStyle={{ top: -100 }} // Shift image up to show the school name
      resizeMode="cover"
    >
      <View style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 51, 102, 0.75)' }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
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
            <Text style={Styles.title}>Sign In</Text>
            <Text style={Styles.subtitle}>Enter your credentials to continue</Text>

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
              />
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Password</Text>
              <TextInput
                style={Styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.light.textLight}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              style={[Styles.btnPrimary, { marginTop: 16 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={Styles.btnPrimaryText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={{ marginTop: 24, alignItems: 'center' }}>
              <Text style={{ color: Colors.light.textMuted }}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={{ marginTop: 8 }}>
                <Text style={{ color: Colors.light.primary, fontWeight: '700', fontSize: 16 }}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
