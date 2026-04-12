import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.primaryDark }}>
        <ActivityIndicator size="large" color={Colors.light.accent} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(staff)/scanner" />;
  }

  return <Redirect href="/(auth)/login" />;
}
