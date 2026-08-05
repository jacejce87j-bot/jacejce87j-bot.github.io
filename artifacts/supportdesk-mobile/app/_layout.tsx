import React, { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkLoaded, ClerkProvider, useAuth } from '@clerk/expo';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  type AppEnvironment,
  clearEnvironmentTokenCache,
  createEnvironmentTokenCache,
  getEnvironmentConfig,
  loadSavedEnvironment,
  saveEnvironment,
} from '@/lib/environment';
import {
  EnvironmentContext,
} from '@/lib/environment-context';
import { useAppEnvironment } from '@/lib/environment-context';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environment, setEnvironment] = useState<AppEnvironment | null>(null);

  useEffect(() => {
    void loadSavedEnvironment().then(setEnvironment);
  }, []);

  const switchEnvironment = async (nextEnvironment: AppEnvironment) => {
    if (nextEnvironment === environment) return;

    setAuthTokenGetter(null);
    queryClient.clear();
    if (environment) await clearEnvironmentTokenCache(environment);
    await clearEnvironmentTokenCache(nextEnvironment);
    await saveEnvironment(nextEnvironment);
    setEnvironment(nextEnvironment);
  };

  if (!environment) return null;

  return (
    <EnvironmentContext.Provider value={{ environment, switchEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

function ApiAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

function RootLayoutNav() {
  const { environment } = useAppEnvironment();
  const config = getEnvironmentConfig(environment);

  useEffect(() => {
    setBaseUrl(config.apiDomain ? `https://${config.apiDomain}` : null);
  }, [config.apiDomain]);

  return (
    <>
      <ApiAuthBridge />
      <Stack screenOptions={{ headerBackTitle: 'Back', headerTintColor: '#2459d6' }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ticket/[id]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <EnvironmentProvider>
      <EnvironmentAuthBoundary />
    </EnvironmentProvider>
  );
}

function EnvironmentAuthBoundary() {
  const { environment } = useAppEnvironment();
  const config = useMemo(() => getEnvironmentConfig(environment), [environment]);
  const tokenCache = useMemo(
    () => createEnvironmentTokenCache(environment),
    [environment],
  );

  if (!config.clerkPublishableKey) {
    throw new Error(`Missing Clerk publishable key for ${config.label}`);
  }

  return (
    <ClerkProvider
      key={environment}
      publishableKey={config.clerkPublishableKey}
      tokenCache={tokenCache}
      proxyUrl={config.clerkProxyUrl}
    >
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}