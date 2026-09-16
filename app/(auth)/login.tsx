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
import { Colors } from '../../constants/Colors';
import { Styles } from '../../constants/Styles';
import { useAuth } from '../../context/AuthContext';
import { APIError, fetchAPI } from '../../utils/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Information', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
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
              paddingTop: Platform.OS === 'ios' ? 60 : 40,
              paddingBottom: 48,
              justifyContent: 'center',
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* School Branding */}
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: 190, height: 74, resizeMode: 'contain', marginBottom: 12 }}
              />
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>AFLON DIGITAL ACADEMY</Text>
              </View>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 8 }}>
                Smart Attendance Management
              </Text>
            </View>

            {/* Login Card */}
            <View style={styles.glassCard}>
              <View style={{ marginBottom: 24 }}>
                <Text style={styles.cardTitle}>Sign In</Text>
                <Text style={styles.cardSubtitle}>Enter your credentials to access campus</Text>
              </View>

              {/* Email */}
              <View style={Styles.inputGroup}>
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
                    textContentType="emailAddress"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={Styles.inputGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.inputLabel}>PASSWORD</Text>
                  <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: '#0077b6', fontSize: 12, fontWeight: '700' }}>
                      Forgot?
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="••••••••••••"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    autoComplete="password"
                    textContentType="password"
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

              {/* Sign In Button */}
              <TouchableOpacity
                style={[styles.primaryButton, loading && { opacity: 0.75 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.primaryButtonText}>Signing In...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Create account link */}
              <View style={{ marginTop: 24, alignItems: 'center' }}>
                <Text style={{ color: Colors.light.textMuted, fontSize: 13, fontWeight: '500' }}>
                  {"Don't have an account yet?"}
                </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={{ marginTop: 6 }} activeOpacity={0.7}>
                  <Text style={{ color: '#0077b6', fontWeight: '800', fontSize: 15 }}>Create Staff Account</Text>
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
  badgePill: {
    backgroundColor: 'rgba(0, 168, 204, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 204, 0.4)',
  },
  badgePillText: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
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
  cardTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#001f3f',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
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
    marginTop: 18,
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
});
