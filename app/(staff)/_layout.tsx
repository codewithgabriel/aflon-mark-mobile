import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { getPendingOfflineScans } from '../../utils/offlineSync';

export default function StaffLayout() {
  const { user, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const checkQueue = async () => {
      const queue = await getPendingOfflineScans();
      setPendingCount(queue.length);
    };
    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = () => {
    if (pendingCount > 0) {
      Alert.alert(
        'Pending Offline Scans',
        `You have ${pendingCount} offline attendance record(s) queued. If you sign out before connecting to the internet, these records will remain saved on this device but won't be synced until someone logs back in. Do you still want to sign out?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ]
      );
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]);
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#00e5ff',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.45)',
        tabBarStyle: {
          backgroundColor: '#00172e',
          borderTopColor: 'rgba(255, 255, 255, 0.08)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 66,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
        headerStyle: {
          backgroundColor: '#001f3f',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        },
        headerTitleStyle: {
          fontWeight: '900',
          color: '#ffffff',
          fontSize: 18,
          letterSpacing: -0.3,
        },
        headerLeft: () => (
          <View style={{ marginLeft: 16 }}>
            <Text style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
              {user?.department || 'AFLON'}
            </Text>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>
              {user?.name?.split(' ')[0] || 'Staff'}
            </Text>
          </View>
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={handleSignOut}
            style={{
              marginRight: 16,
              padding: 8,
              borderRadius: 12,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="logout" size={20} color="#f87171" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Station Scan',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'qrcode-scan' : 'qrcode'}
              size={22}
              color={color}
            />
          ),
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#f59e0b',
            color: '#001f3f',
            fontSize: 10,
            fontWeight: '900',
          },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'My History',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'clock-check' : 'clock-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'chart-box' : 'chart-box-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
