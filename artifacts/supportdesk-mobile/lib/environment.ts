import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

type TokenCache = {
  getToken: (key: string) => Promise<string | undefined | null>;
  saveToken: (key: string, token: string) => Promise<void>;
  clearToken?: (key: string) => void | Promise<void>;
};

export type AppEnvironment = 'development' | 'production';

export type AppEnvironmentConfig = {
  id: AppEnvironment;
  label: string;
  apiDomain: string;
  clerkPublishableKey: string;
  clerkProxyUrl?: string;
};

const ENVIRONMENT_STORAGE_KEY = 'supportdesk.mobile.environment.v1';
const tokenKeysByEnvironment = new Map<AppEnvironment, Set<string>>();

function cleanDomain(value: string | undefined): string {
  return (value || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

const developmentConfig: AppEnvironmentConfig = {
  id: 'development',
  label: 'Development',
  apiDomain: cleanDomain(
    process.env.EXPO_PUBLIC_DEV_API_DOMAIN || process.env.REPLIT_DEV_DOMAIN,
  ),
  clerkPublishableKey: process.env.EXPO_PUBLIC_DEV_CLERK_PUBLISHABLE_KEY || '',
};

const productionConfig: AppEnvironmentConfig = {
  id: 'production',
  label: 'Production',
  apiDomain: cleanDomain(
    process.env.EXPO_PUBLIC_PROD_API_DOMAIN || process.env.EXPO_PUBLIC_API_DOMAIN,
  ),
  clerkPublishableKey: process.env.EXPO_PUBLIC_PROD_CLERK_PUBLISHABLE_KEY || '',
  clerkProxyUrl: process.env.EXPO_PUBLIC_PROD_CLERK_PROXY_URL || undefined,
};

export const environmentConfigs: Record<AppEnvironment, AppEnvironmentConfig> = {
  development: developmentConfig,
  production: productionConfig,
};

export function getEnvironmentConfig(environment: AppEnvironment): AppEnvironmentConfig {
  return environmentConfigs[environment];
}

export async function loadSavedEnvironment(): Promise<AppEnvironment> {
  const saved = await AsyncStorage.getItem(ENVIRONMENT_STORAGE_KEY);
  return saved === 'development' ? 'development' : 'production';
}

export async function saveEnvironment(environment: AppEnvironment): Promise<void> {
  await AsyncStorage.setItem(ENVIRONMENT_STORAGE_KEY, environment);
}

function getTokenKeys(environment: AppEnvironment): Set<string> {
  let keys = tokenKeysByEnvironment.get(environment);
  if (!keys) {
    keys = new Set<string>();
    tokenKeysByEnvironment.set(environment, keys);
  }
  return keys;
}

export function createEnvironmentTokenCache(environment: AppEnvironment): TokenCache | undefined {
  return {
    getToken: async (key) => {
      const namespacedKey = `${key}.${environment}`;
      getTokenKeys(environment).add(namespacedKey);
      return SecureStore.getItemAsync(namespacedKey);
    },
    saveToken: async (key, token) => {
      const namespacedKey = `${key}.${environment}`;
      getTokenKeys(environment).add(namespacedKey);
      await SecureStore.setItemAsync(namespacedKey, token);
    },
    clearToken: async (key) => {
      const namespacedKey = `${key}.${environment}`;
      getTokenKeys(environment).delete(namespacedKey);
      await SecureStore.deleteItemAsync(namespacedKey);
    },
  };
}

export async function clearEnvironmentTokenCache(
  environment: AppEnvironment,
): Promise<void> {
  const keys = [...getTokenKeys(environment)];
  await Promise.all(keys.map((key) => SecureStore.deleteItemAsync(key)));
  getTokenKeys(environment).clear();
}