import { configureNativeApiTransport } from '@workspace/api-client-react';
import { PropsWithChildren, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const configuredProductionDomain =
  process.env.EXPO_PUBLIC_PRODUCTION_API_DOMAIN?.trim();

const TAILSCALE_FALLBACK_URL = 'http://100.116.75.63:5000';

export function getProductionApiBaseUrl(): string {
  const isDev =
    typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

  // If a production domain is explicitly set in env vars, use it
  if (configuredProductionDomain) {
    const value = /^https?:\/\//i.test(configuredProductionDomain)
      ? configuredProductionDomain
      : (isDev ? `http://${configuredProductionDomain}` : `https://${configuredProductionDomain}`);
    try {
      const url = new URL(value);
      return url.origin;
    } catch (e) {
      console.warn('Invalid EXPO_PUBLIC_PRODUCTION_API_DOMAIN URL:', value);
    }
  }

  // In local development mode, route based on device platform
  if (isDev) {
    return Platform.select({
      // Standard Android Emulator IP mapping to host machine localhost
      android: 'http://10.0.2.2:5000',
      // iOS Simulator / Web
      ios: 'http://localhost:5000',
      default: 'http://localhost:5000',
    });
  }

  // Production fallback to Tailscale mesh IP
  return TAILSCALE_FALLBACK_URL;
}

export function ProductionApiProvider({ children }: PropsWithChildren) {
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const baseUrl = getProductionApiBaseUrl();
    if (baseUrl) {
      console.log('[API Transport] Configured Base URL:', baseUrl);
      configureNativeApiTransport(baseUrl);
    }
    setIsConfigured(true);
  }, []);

  return isConfigured ? <>{children}</> : null;
}