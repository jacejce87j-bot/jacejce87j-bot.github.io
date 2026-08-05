import { createContext, useContext } from 'react';
import type { AppEnvironment } from '@/lib/environment';

export type EnvironmentContextValue = {
  environment: AppEnvironment;
  switchEnvironment: (environment: AppEnvironment) => Promise<void>;
};

export const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function useAppEnvironment(): EnvironmentContextValue {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useAppEnvironment must be used inside EnvironmentProvider');
  }
  return context;
}