import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadConfiguration,
  DEFAULT_CONFIG,
  getEffectiveBaseUrl,
  getEffectiveTimeout,
  getEffectiveUserAgent,
} from '../configService';
import { STORAGE_KEYS } from '../../config/storageKeys';
import type { SessionUser } from '../../contexts/SessionContext';

/** Instancia sin Authorization para login y refresh */
function createCleanInstance(): AxiosInstance {
  return axios.create({
    timeout: DEFAULT_CONFIG.timeout,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Instancia principal con interceptores */
let api: AxiosInstance;
let cleanApi: AxiosInstance;

let isRefreshing = false;
let waitQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}> = [];

async function getStoredUniqueGuid(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.unique_guid);
}

async function setStoredToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.access_token, token);
}

async function clearAuthStorage(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEYS.access_token),
    AsyncStorage.removeItem(STORAGE_KEYS.username),
    AsyncStorage.removeItem(STORAGE_KEYS.unique_guid),
  ]);
}

function createApiInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: DEFAULT_CONFIG.baseUrl,
    timeout: DEFAULT_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_CONFIG.userAgent,
    },
  });

  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.access_token);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        delete config.headers.Authorization;
      }
      return config;
    },
    (err) => Promise.reject(err)
  );

  instance.interceptors.response.use(
    (response) => response,
    async (err: AxiosError) => {
      const originalRequest = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
      if (err.response?.status !== 401 || originalRequest._retry) {
        return Promise.reject(err);
      }
      const guid = await getStoredUniqueGuid();
      if (!guid) {
        await clearAuthStorage();
        return Promise.reject(err);
      }
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          waitQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve();
            },
            reject,
          });
        }).then(() => instance(originalRequest));
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const baseURL = getEffectiveBaseUrl();
        const { data } = await cleanApi.post<{ token?: string; access_token?: string }>(
          `${baseURL}/auth/token`,
          { uniqueGUID: guid }
        );
        const newToken = data?.token ?? data?.access_token;
        if (!newToken) throw new Error('No token in refresh response');
        await setStoredToken(newToken);
        waitQueue.forEach(({ resolve }) => resolve(newToken));
        waitQueue = [];
        if (originalRequest.headers) originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return instance(originalRequest);
      } catch (refreshErr) {
        waitQueue.forEach(({ reject: r }) => r(refreshErr as Error));
        waitQueue = [];
        await clearAuthStorage();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
  );

  return instance;
}

cleanApi = createCleanInstance();
api = createApiInstance();

export async function updateApiConfig(): Promise<void> {
  await loadConfiguration();
  const baseUrl = getEffectiveBaseUrl();
  const timeout = getEffectiveTimeout();
  const userAgent = getEffectiveUserAgent();
  api.defaults.baseURL = baseUrl;
  api.defaults.timeout = timeout;
  api.defaults.headers['User-Agent'] = userAgent;
  cleanApi.defaults.baseURL = baseUrl;
  cleanApi.defaults.timeout = timeout;
  cleanApi.defaults.headers['User-Agent'] = userAgent;
}

/** Inicializar config y api al arranque (llamar desde app). */
export async function initApi(): Promise<void> {
  await loadConfiguration();
  await updateApiConfig();
}

export { api, cleanApi };

// --- authService (en Api.ts) ---

export type LoginResponse = {
  token?: string;
  access_token?: string;
  unique_guid?: string;
  uniqueGUID?: string;
  username?: string;
  role?: string;
};

export async function login(username: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const baseURL = getEffectiveBaseUrl();
  const { data } = await cleanApi.post<LoginResponse>(`${baseURL}/auth/login`, { username, password });
  const token = data?.token ?? data?.access_token;
  if (!token) throw new Error('No token in login response');
  const uniqueGuid = data?.unique_guid ?? data?.uniqueGUID ?? username;
  await AsyncStorage.setItem(STORAGE_KEYS.access_token, token);
  await AsyncStorage.setItem(STORAGE_KEYS.username, username);
  await AsyncStorage.setItem(STORAGE_KEYS.unique_guid, uniqueGuid);
  const user: SessionUser = {
    id: uniqueGuid,
    email: username,
    role: data?.role ?? 'user',
  };
  return { token, user };
}

export async function logout(): Promise<void> {
  await clearAuthStorage();
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.access_token);
}

export async function getStoredUser(): Promise<{ username: string } | null> {
  const username = await AsyncStorage.getItem(STORAGE_KEYS.username);
  if (!username) return null;
  return { username };
}
