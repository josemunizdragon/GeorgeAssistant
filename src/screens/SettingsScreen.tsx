import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Switch,
} from 'react-native';
import { useSession } from '../contexts/SessionContext';
import { updateApiConfig, logout as apiLogout } from '../services/api/Api';
import {
  loadConfiguration,
  saveConfiguration,
  getCachedConfig,
  DEFAULT_CONFIG,
} from '../services/configService';

/**
 * Ajustes: bloque API (baseUrl, custom enabled) antes del login; user info + Logout si hay sesión.
 */
export function SettingsScreen() {
  const { user, token, signOut } = useSession();
  const [baseUrl, setBaseUrl] = useState<string>(DEFAULT_CONFIG.baseUrl);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState<string>(String(DEFAULT_CONFIG.timeout));
  const [userAgent, setUserAgent] = useState<string>(DEFAULT_CONFIG.userAgent);
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await loadConfiguration();
      const config = getCachedConfig();
      if (config) {
        setBaseUrl(config.baseUrl);
        setCustomEnabled(config.customInventoryConfigEnabled);
        setTimeoutMs(String(config.timeout));
        setUserAgent(config.userAgent);
      }
    })();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const timeout = parseInt(timeoutMs, 10) || DEFAULT_CONFIG.timeout;
      await saveConfiguration({
        baseUrl: baseUrl.trim() || DEFAULT_CONFIG.baseUrl,
        timeout,
        userAgent: userAgent.trim() || DEFAULT_CONFIG.userAgent,
        customInventoryConfigEnabled: customEnabled,
      });
      await updateApiConfig();
      Alert.alert('Saved', 'Configuración guardada.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTestBackend = () => {
    setTestMessage('Test backend: placeholder');
  };

  const handleLogout = async () => {
    await apiLogout();
    await signOut();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>API (configurable antes del login)</Text>
        <View style={styles.configRow}>
          <Text style={styles.label}>Usar URL personalizada</Text>
          <Switch value={customEnabled} onValueChange={setCustomEnabled} />
        </View>
        <Text style={styles.label}>Base URL</Text>
        <TextInput
          style={styles.input}
          placeholder={DEFAULT_CONFIG.baseUrl}
          placeholderTextColor="#888"
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.label}>Timeout (ms)</Text>
        <TextInput
          style={styles.input}
          placeholder={String(DEFAULT_CONFIG.timeout)}
          placeholderTextColor="#888"
          value={timeoutMs}
          onChangeText={setTimeoutMs}
          keyboardType="number-pad"
        />
        <Text style={styles.label}>User-Agent</Text>
        <TextInput
          style={styles.input}
          placeholder={DEFAULT_CONFIG.userAgent}
          placeholderTextColor="#888"
          value={userAgent}
          onChangeText={setUserAgent}
        />
        <TouchableOpacity
          style={[styles.buttonSecondary, saving && styles.buttonDisabled]}
          onPress={handleSaveConfig}
          disabled={saving}
        >
          <Text style={styles.buttonSecondaryText}>{saving ? 'Guardando…' : 'Guardar configuración'}</Text>
        </TouchableOpacity>

        {token ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionTop]}>Sesión</Text>
            <View style={styles.info}>
              <Text style={styles.label}>Email / Usuario</Text>
              <Text style={styles.value}>{user?.email ?? '—'}</Text>
              <Text style={styles.label}>Rol</Text>
              <Text style={styles.value}>{user?.role ?? '—'}</Text>
            </View>
            <TouchableOpacity style={styles.buttonSecondary} onPress={handleTestBackend}>
              <Text style={styles.buttonSecondaryText}>Test backend</Text>
            </TouchableOpacity>
            {testMessage ? <Text style={styles.testMessage}>{testMessage}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleLogout}>
              <Text style={styles.buttonText}>Logout</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hint}>Inicia sesión para ver datos de sesión y cerrar sesión.</Text>
        )}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  sectionTop: {
    marginTop: 24,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
  },
  buttonSecondary: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testMessage: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  info: {
    marginBottom: 8,
  },
  value: {
    fontSize: 16,
    color: '#fff',
  },
  button: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    color: '#888',
    marginTop: 24,
  },
});
