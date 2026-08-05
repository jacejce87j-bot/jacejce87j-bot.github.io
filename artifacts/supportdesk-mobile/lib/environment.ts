import * as SecureStore from 'expo-secure-store';

type TokenCache = {
  getToken: (key: string) => Promise<string | undefined | null>;
  saveToken: (key: string, token: string) => Promise<void>;
  clearToken?: (key: string) => void | Promise<void>;
};

export type ProductionConfig = {
  apiDomain: string;
  clerkPublishableKey: string;
  clerkProxyUrl?: string;
};

const CLERK_CLIENT_JWT_KEY = '__clerk_client_jwt';

function cleanDomain(value: string | undefined): string {
  return (value || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export const productionConfig: ProductionConfig = {
  apiDomain: cleanDomain(process.env.EXPO_PUBLIC_API_DOMAIN),
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
  clerkProxyUrl: process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined,
};

export function createProductionTokenCache(): TokenCache {
  return {
    getToken: async (key) => {
      return SecureStore.getItemAsync(`${key}.production`);
    },
    saveToken: async (key, token) => {
      await SecureStore.setItemAsync(`${key}.production`, token);
    },
    clearToken: async (key) => {
      await SecureStore.deleteItemAsync(`${key}.production`);
    },
  };
}

export async function clearLegacyTokenCache(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(`${CLERK_CLIENT_JWT_KEY}.development`),
    SecureStore.deleteItemAsync(CLERK_CLIENT_JWT_KEY),
  ]);
}