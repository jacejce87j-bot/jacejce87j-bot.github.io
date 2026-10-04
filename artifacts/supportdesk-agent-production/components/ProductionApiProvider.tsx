import { configureNativeApiTransport } from '@workspace/api-client-react';
import { PropsWithChildren, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { tokenStorage } from '@/lib/storage';

const configuredProductionDomain =
  process.env.EXPO_PUBLIC_PRODUCTION_API_DOMAIN?.trim();

const TAILSCALE_FALLBACK_URL = 'http://100.116.75.63:5000';

export function getProductionApiBaseUrl(): string {
  const isDev =
    typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

  if (configuredProductionDomain) {
    const value = /^https?:\/\//i.test(configuredProductionDomain)
      ? configuredProductionDomain
      : (isDev ? `http://${configuredProductionDomain}` : `https://${configuredProductionDomain}`);
    try {
      const url = new URL(value);
      return url.origin;
    } catch (_e) {
      // Ignore invalid env values and fall back to the standard local/mesh config.
    }
  }

  if (isDev) {
    return Platform.select({
      android: 'http://10.0.2.2:5000',
      ios: 'http://localhost:5000',
      default: 'http://localhost:5000',
    });
  }

  return TAILSCALE_FALLBACK_URL;
}

export function ProductionApiProvider({ children }: PropsWithChildren) {
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    (async () => {
      const baseUrl = getProductionApiBaseUrl();
      if (baseUrl) {
        try {
          const storedToken = await tokenStorage.getItem('userToken');
          if (storedToken) {
            configureNativeApiTransport(baseUrl, storedToken);
          } else {
            configureNativeApiTransport(baseUrl);
          }
        } catch (_e) {
          configureNativeApiTransport(baseUrl);
        }
      }
      setIsConfigured(true);
    })();
  }, []);

  return isConfigured ? <>{children}</> : null;
}
