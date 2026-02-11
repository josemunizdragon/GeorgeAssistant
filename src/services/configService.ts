import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/storageKeys';

export const DEFAULT_CONFIG = {
  baseUrl: 'http://187.189.239.4:9698/api',
  timeout: 30000,
  userAgent: 'GeorgeAssistant/1.0',
} as const;

export type ApiConfiguration = {
  baseUrl: string;
  timeout: number;
  userAgent: string;
  customInventoryConfigEnabled: boolean;
};

const defaultConfig: ApiConfiguration = {
  ...DEFAULT_CONFIG,
  customInventoryConfigEnabled: false,
};

let cachedConfig: ApiConfiguration | null = null;

export async function loadConfiguration(): Promise<ApiConfiguration> {
  if (cachedConfig) return cachedConfig;
  try {
    const [baseUrl, timeout, userAgent, customEnabled] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.api_base_url),
      AsyncStorage.getItem(STORAGE_KEYS.api_timeout),
      AsyncStorage.getItem(STORAGE_KEYS.api_user_agent),
      AsyncStorage.getItem(STORAGE_KEYS.api_custom_inventory_config_enabled),
    ]);
    cachedConfig = {
      baseUrl: baseUrl ?? defaultConfig.baseUrl,
      timeout: timeout != null ? parseInt(timeout, 10) || defaultConfig.timeout : defaultConfig.timeout,
      userAgent: userAgent ?? defaultConfig.userAgent,
      customInventoryConfigEnabled: customEnabled === 'true',
    };
    return cachedConfig;
  } catch {
    cachedConfig = { ...defaultConfig };
    return cachedConfig;
  }
}

export async function saveConfiguration(config: Partial<ApiConfiguration>): Promise<void> {
  const current = await loadConfiguration();
  const next: ApiConfiguration = {
    baseUrl: config.baseUrl ?? current.baseUrl,
    timeout: config.timeout ?? current.timeout,
    userAgent: config.userAgent ?? current.userAgent,
    customInventoryConfigEnabled: config.customInventoryConfigEnabled ?? current.customInventoryConfigEnabled,
  };
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.api_base_url, next.baseUrl),
    AsyncStorage.setItem(STORAGE_KEYS.api_timeout, String(next.timeout)),
    AsyncStorage.setItem(STORAGE_KEYS.api_user_agent, next.userAgent),
    AsyncStorage.setItem(STORAGE_KEYS.api_custom_inventory_config_enabled, String(next.customInventoryConfigEnabled)),
  ]);
  cachedConfig = next;
}

export function getEffectiveBaseUrl(): string {
  if (!cachedConfig) return DEFAULT_CONFIG.baseUrl;
  return cachedConfig.customInventoryConfigEnabled ? cachedConfig.baseUrl : DEFAULT_CONFIG.baseUrl;
}

export function getEffectiveTimeout(): number {
  if (!cachedConfig) return DEFAULT_CONFIG.timeout;
  return cachedConfig.customInventoryConfigEnabled ? cachedConfig.timeout : DEFAULT_CONFIG.timeout;
}

export function getEffectiveUserAgent(): string {
  if (!cachedConfig) return DEFAULT_CONFIG.userAgent;
  return cachedConfig.customInventoryConfigEnabled ? cachedConfig.userAgent : DEFAULT_CONFIG.userAgent;
}

export function getCachedConfig(): ApiConfiguration | null {
  return cachedConfig;
}

/** Invalida caché para forzar recarga desde storage (p. ej. tras save). */
export function invalidateConfigCache(): void {
  cachedConfig = null;
}
