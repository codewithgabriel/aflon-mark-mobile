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
import { Styles } from '../../constants/Styles';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';

type RegisteredUser = {
  name: string;
  staffId: string;
  [key: string]: any;
};

export default function RegisterScreen() {
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<RegisteredUser | null>(null);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      Alert.alert('Missing Fields', 'Full Name, Email and Password are required.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          department: form.department.trim(),
        }),
      });

      if (response && response.user) {
        setRegisteredUser(response.user);
      }
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || 'Error creating account');
    } finally {
      setLoading(false);
    }
  };

  const background = (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={{ flex: 1 }}
      imageStyle={{ top: -80 }}
      resizeMode="cover"
    >
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 31, 63, 0.82)' }} />
      </View>
    </ImageBackground>
  );

  if (registeredUser) {
    return (
      <View style={{ flex: 1 }}>
        {background}
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', padding: 24 }]}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 170, height: 68, resizeMode: 'contain' }}
            />
          </View>

          <View style={[styles.glassCard, { alignItems: 'center', padding: 32 }]}>
            <View style={styles.successIconRing}>
              <MaterialCommunityIcons name="check-decagram" size={54} color="#38a169" />
            </View>

            <Text style={[styles.cardTitle, { textAlign: 'center', marginBottom: 4 }]}>
              Account Created!
            </Text>
            <Text style={[styles.cardSubtitle, { textAlign: 'center', marginBottom: 20 }]}>
              Welcome to Aflon Digital Academy, {registeredUser.name}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '800', color: '#718096', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Assigned Staff ID
            </Text>
            <View style={styles.staffIdPill}>
              <Text style={styles.staffIdText}>
                {registeredUser.staffId}
              </Text>
              <Text style={{ fontSize: 11, color: '#718096', marginTop: 4, fontWeight: '500' }}>
                Keep this ID safe — it identifies you across campus
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { width: '100%', marginTop: 8 }]}
              onPress={() => signIn(registeredUser as any)}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryButtonText}>Continue to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

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
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Header / Back */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
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
                style={{ width: 130, height: 50, resizeMode: 'contain' }}
              />
            </View>

            <View style={styles.glassCard}>
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.cardTitle}>Create Account</Text>
                <Text style={styles.cardSubtitle}>Register as school faculty or administrative staff</Text>
              </View>

              {/* Full Name */}
              <View style={Styles.inputGroup}>
                <Text style={styles.inputLabel}>FULL NAME</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="account-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="e.g. Samuel Adebayo"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    value={form.name}
                    onChangeText={(t) => setForm({ ...form, name: t })}
                    autoCapitalize="words"
                  />
                </View>
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
                    value={form.email}
                    onChangeText={(t) => setForm({ ...form, email: t })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Department */}
              <View style={Styles.inputGroup}>
                <Text style={styles.inputLabel}>DEPARTMENT / UNIT</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="briefcase-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="e.g. Science, ICT, Humanities"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    value={form.department}
                    onChangeText={(t) => setForm({ ...form, department: t })}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={Styles.inputGroup}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color="#0077b6" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInputField}
                    placeholder="••••••••••••"
                    placeholderTextColor="rgba(0, 31, 63, 0.35)"
                    secureTextEntry={!showPassword}
                    value={form.password}
                    onChangeText={(t) => setForm({ ...form, password: t })}
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

              {/* Submit */}
              <TouchableOpacity
                style={[styles.primaryButton, loading && { opacity: 0.75 }]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.primaryButtonText}>Registering...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.primaryButtonText}>Complete Registration</Text>
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
    padding: 26,
    shadowColor: '#001f3f',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  cardTitle: {
    fontSize: 22,
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
    height: 50,
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
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#001f3f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
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
  successIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(56, 161, 105, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  staffIdPill: {
    backgroundColor: '#f0f4f8',
    borderWidth: 1.5,
    borderColor: '#cbd5e0',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  staffIdText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#001f3f',
    letterSpacing: 2,
  },
});
