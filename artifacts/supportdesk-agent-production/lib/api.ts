import { fetchWithFallback as fetchApiWithFallback } from '@workspace/api-client-react';

export const PRIMARY_API =
  (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_PRIMARY_API_URL?.trim() : undefined) ||
  'https://orion-supportdesk-api.onrender.com';

export const BACKUP_API =
  (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_TAILSCALE_API_URL?.trim() : undefined) ||
  'http://100.116.75.63:5000';

export const fetchWithFallback = (path: string, options: RequestInit = {}) =>
  fetchApiWithFallback(path, options, {
    primaryApi: PRIMARY_API,
    backupApi: BACKUP_API,
  });
