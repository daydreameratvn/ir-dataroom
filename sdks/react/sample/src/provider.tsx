import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PapayaClient, type PapayaConfig } from '@papaya/sample';

const PapayaContext = createContext<PapayaClient | null>(null);

export interface PapayaProviderProps {
  config: PapayaConfig;
  children: ReactNode;
}

export function PapayaProvider({ config, children }: PapayaProviderProps) {
  const client = useMemo(() => new PapayaClient(config), [config.apiKey, config.baseUrl]);
  return <PapayaContext.Provider value={client}>{children}</PapayaContext.Provider>;
}

export function usePapaya(): PapayaClient {
  const client = useContext(PapayaContext);
  if (!client) {
    throw new Error('usePapaya must be used within a <PapayaProvider>');
  }
  return client;
}
