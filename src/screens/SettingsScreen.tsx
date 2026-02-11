import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useSession } from '../contexts/SessionContext';

/**
 * Ajustes: user.email, user.role, Logout, Test backend (placeholder).
 */
export function SettingsScreen() {
  const { user, signOut } = useSession();
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const handleTestBackend = () => {
    setTestMessage('Test backend: placeholder');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Ajustes</Text>
        <View style={styles.info}>
          <Text style={styles.label}>Email</Text>
          <Text style={user?.email ? styles.value : styles.valueMuted}>
            {user?.email ?? '—'}
          </Text>
          <Text style={styles.label}>Rol</Text>
          <Text style={styles.value}>{user?.role ?? '—'}</Text>
        </View>
        <TouchableOpacity style={styles.buttonSecondary} onPress={handleTestBackend}>
          <Text style={styles.buttonSecondaryText}>Test backend</Text>
        </TouchableOpacity>
        {testMessage ? (
          <Text style={styles.testMessage}>{testMessage}</Text>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A1929',
  },
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  info: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginTop: 12,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#fff',
  },
  valueMuted: {
    fontSize: 16,
    color: '#666',
  },
  buttonSecondary: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSecondaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testMessage: {
    fontSize: 12,
    color: '#888',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
