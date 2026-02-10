import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSession } from '../contexts/SessionContext';

/**
 * Pantalla de ajustes. Placeholder con cerrar sesión.
 */
export function SettingsScreen() {
  const { user, signOut } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ajustes</Text>
      {user?.email ? (
        <Text style={styles.email}>{user.email}</Text>
      ) : null}
      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1929',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  email: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 32,
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
