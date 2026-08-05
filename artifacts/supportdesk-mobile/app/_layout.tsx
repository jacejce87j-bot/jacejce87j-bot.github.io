import React, { useEffect, useState } from 'react';
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
  clearLegacyTokenCache,
  createProductionTokenCache,
  productionConfig,
} from '@/lib/environment';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function LegacyCacheCleanup({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void clearLegacyTokenCache().finally(() => setReady(true));
  }, []);

  return ready ? <>{children}</> : null;
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
  useEffect(() => {
    setBaseUrl(productionConfig.apiDomain ? `https://${productionConfig.apiDomain}` : null);
  }, []);

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
    <LegacyCacheCleanup>
      <ProductionAuthBoundary />
    </LegacyCacheCleanup>
  );
}

function ProductionAuthBoundary() {
  const [tokenCache] = useState(createProductionTokenCache);

  if (!productionConfig.clerkPublishableKey) {
    throw new Error('Missing Production Clerk publishable key');
  }

  return (
    <ClerkProvider
      publishableKey={productionConfig.clerkPublishableKey}
      tokenCache={tokenCache}
      proxyUrl={productionConfig.clerkProxyUrl}
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