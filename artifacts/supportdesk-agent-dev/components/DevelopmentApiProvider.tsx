import { useAuth } from '@clerk/expo';
import { configureDevelopmentApiTransport } from '@workspace/api-client-react';
import { PropsWithChildren, useEffect, useState } from 'react';

const developmentDomain = process.env.EXPO_PUBLIC_DOMAIN;

export function DevelopmentApiProvider({ children }: PropsWithChildren) {
  const { getToken } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (!developmentDomain) {
      throw new Error(
        'Missing EXPO_PUBLIC_DOMAIN. The development API boundary is not configured.',
      );
    }

    configureDevelopmentApiTransport({
      baseUrl: `https://${developmentDomain}`,
      getToken: () => getToken(),
    });
    setIsConfigured(true);
  }, [getToken]);

  return isConfigured ? children : null;
}