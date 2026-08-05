import { useAuth } from '@clerk/expo';
import { configureNativeApiTransport } from '@workspace/api-client-react';
import { PropsWithChildren, useEffect, useState } from 'react';

const configuredProductionDomain =
  process.env.EXPO_PUBLIC_PRODUCTION_API_DOMAIN?.trim();

export function getProductionApiBaseUrl(): string {
  if (!configuredProductionDomain) {
    throw new Error(
      'Missing EXPO_PUBLIC_PRODUCTION_API_DOMAIN. This app requires an explicit production API domain.',
    );
  }

  const value = /^https?:\/\//i.test(configuredProductionDomain)
    ? configuredProductionDomain
    : `https://${configuredProductionDomain}`;
  const url = new URL(value);

  if (url.protocol !== 'https:') {
    throw new Error('The production API domain must use HTTPS.');
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('The production API domain must not include a path.');
  }

  return url.origin;
}

export function ProductionApiProvider({ children }: PropsWithChildren) {
  const { getToken } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    configureNativeApiTransport({
      baseUrl: getProductionApiBaseUrl(),
      getToken: () => getToken(),
    });
    setIsConfigured(true);
  }, [getToken]);

  return isConfigured ? children : null;
}