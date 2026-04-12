import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
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
  const [loading, setLoading] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<RegisteredUser | null>(null);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Error', 'Full Name, Email and Password are required.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
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
      imageStyle={{ top: -100 }}
      resizeMode="cover"
    >
      <View style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 51, 102, 0.75)' }} />
      </View>
    </ImageBackground>
  );

  if (registeredUser) {
    return (
      <View style={{ flex: 1 }}>
        {background}
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', padding: 24 }]}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 150, height: 60, resizeMode: 'contain' }}
            />
          </View>

          <View style={[Styles.card, { padding: 28, alignItems: 'center' }]}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: Colors.light.success + '1A',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <MaterialCommunityIcons name="check-circle" size={48} color={Colors.light.success} />
            </View>

            <Text style={[Styles.title, { textAlign: 'center', marginBottom: 4 }]}>
              Registration Successful!
            </Text>
            <Text style={[Styles.subtitle, { textAlign: 'center', marginBottom: 20 }]}>
              Welcome, {registeredUser.name}
            </Text>

            <Text style={{ fontSize: 13, color: Colors.light.textMuted, marginBottom: 8 }}>
              Your Staff ID
            </Text>
            <View style={{
              backgroundColor: Colors.light.secondary,
              borderWidth: 1.5,
              borderColor: Colors.light.border,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 24,
              marginBottom: 24,
              width: '100%',
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 22,
                fontWeight: '700',
                color: Colors.light.primaryDark,
                letterSpacing: 2,
              }}>
                {registeredUser.staffId}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.light.textLight, marginTop: 4 }}>
                Keep this ID safe — you'll need it to sign in
              </Text>
            </View>

            <TouchableOpacity
              style={[Styles.btnPrimary, { width: '100%' }]}
              onPress={() => signIn(registeredUser)}
            >
              <Text style={Styles.btnPrimaryText}>Continue to App</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 150, height: 60, resizeMode: 'contain' }}
            />
          </View>

          <TouchableOpacity style={{ marginBottom: 24, flexDirection: 'row', alignItems: 'center' }} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.light.surface} />
            <Text style={{ color: Colors.light.surface, marginLeft: 8, fontSize: 16 }}>Back to Login</Text>
          </TouchableOpacity>

          <View style={[Styles.card, { padding: 24 }]}>
            <Text style={Styles.title}>Create Account</Text>
            <Text style={Styles.subtitle}>Register as a new staff member</Text>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Full Name</Text>
              <TextInput
                style={Styles.input}
                placeholder="John Doe"
                placeholderTextColor={Colors.light.textLight}
                value={form.name}
                onChangeText={(t) => setForm({ ...form, name: t })}
              />
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Email Address</Text>
              <TextInput
                style={Styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.light.textLight}
                value={form.email}
                onChangeText={(t) => setForm({ ...form, email: t })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Department (Optional)</Text>
              <TextInput
                style={Styles.input}
                placeholder="e.g. Sales, IT"
                placeholderTextColor={Colors.light.textLight}
                value={form.department}
                onChangeText={(t) => setForm({ ...form, department: t })}
              />
            </View>

            <View style={Styles.inputGroup}>
              <Text style={Styles.label}>Password</Text>
              <TextInput
                style={Styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.light.textLight}
                secureTextEntry
                value={form.password}
                onChangeText={(t) => setForm({ ...form, password: t })}
              />
            </View>

            <TouchableOpacity
              style={[Styles.btnPrimary, { marginTop: 16 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={Styles.btnPrimaryText}>Register</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
