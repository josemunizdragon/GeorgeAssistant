import React from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSession } from '../contexts/SessionContext';
import { AuthScreen } from '../screens/AuthScreen';
import { GeorgeAvatarScreen } from '../screens/GeorgeAvatarScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type RootStackParamList = {
  Auth: undefined;
  Assistant: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

export function AppNavigator() {
  const { token, isHydrated } = useSession();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  if (!token) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: '#0A1929' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#0A1929' },
        }}
      >
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={({ navigation }) => ({
            title: 'Iniciar sesión',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>Ajustes</Text>
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ajustes' }} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0A1929' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: '#0A1929' },
      }}
    >
      <Stack.Screen
        name="Assistant"
        component={GeorgeAvatarScreen}
        options={({ navigation }) => ({
          title: 'George',
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Ajustes</Text>
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Ajustes' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1929',
  },
  headerButton: {
    marginRight: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
