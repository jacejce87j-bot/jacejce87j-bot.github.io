import { configureNativeApiTransport } from '@workspace/api-client-react';
import { PropsWithChildren, useEffect, useState } from 'react';
import { tokenStorage } from '@/lib/storage';
import { BACKUP_API, PRIMARY_API } from '@/lib/api';

export function getProductionApiBaseUrl(): string {
  return PRIMARY_API.replace(/\/+$/, '');
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
            configureNativeApiTransport(baseUrl, storedToken, BACKUP_API);
          } else {
            configureNativeApiTransport(baseUrl, undefined, BACKUP_API);
          }
        } catch (_e) {
          configureNativeApiTransport(baseUrl, undefined, BACKUP_API);
        }
      }
      setIsConfigured(true);
    })();
  }, []);

  return isConfigured ? <>{children}</> : null;
}
