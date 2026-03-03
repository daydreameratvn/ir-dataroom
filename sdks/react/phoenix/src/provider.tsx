import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { PhoenixClient, type PhoenixConfig, type LoginResult, type PolicyInfo } from '@papaya/phoenix';
import { PhoenixEventEmitter } from './events';
import { type PhoenixTheme, defaultTheme, themeToCSS } from './styles/theme';
import type { Locale } from './i18n';

interface PhoenixContextValue {
  client: PhoenixClient;
  events: PhoenixEventEmitter;
  policies: PolicyInfo[];
  activePolicy: PolicyInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  locale: Locale;
  login: (policyNumbers: string[]) => Promise<LoginResult[]>;
  switchPolicy: (policyNumber: string) => void;
  logout: () => void;
}

const PhoenixContext = createContext<PhoenixContextValue | null>(null);

export interface PhoenixProviderProps {
  config: PhoenixConfig;
  tenantId?: string;
  policyNumbers?: string[];
  theme?: PhoenixTheme;
  locale?: Locale;
  children: ReactNode;
}

export function PhoenixProvider({
  config,
  tenantId,
  policyNumbers,
  theme,
  locale = 'en',
  children,
}: PhoenixProviderProps) {
  const client = useMemo(() => {
    const c = new PhoenixClient(config);
    if (tenantId) c.setTenantId(tenantId);
    return c;
  }, [config.baseUrl, tenantId]);

  const eventsRef = useRef(new PhoenixEventEmitter());
  const events = eventsRef.current;

  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [activePolicyNumber, setActivePolicyNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activePolicy = policies.find(p => p.policyNumber === activePolicyNumber) ?? null;
  const isAuthenticated = activePolicy !== null;

  const login = useCallback(async (nums: string[]) => {
    setLoading(true);
    try {
      const results = await client.login(nums);
      const newPolicies: PolicyInfo[] = [];
      const newTokens: Record<string, string> = {};

      for (const r of results) {
        if (r.success && r.token && r.policy) {
          newPolicies.push(r.policy);
          newTokens[r.policyNumber] = r.token;
        }
      }

      setPolicies(newPolicies);
      setTokens(newTokens);

      if (newPolicies.length > 0) {
        const first = newPolicies[0]!;
        setActivePolicyNumber(first.policyNumber);
        client.setToken(newTokens[first.policyNumber]!);
      }

      return results;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const switchPolicy = useCallback((policyNumber: string) => {
    const token = tokens[policyNumber];
    if (token) {
      setActivePolicyNumber(policyNumber);
      client.setToken(token);
    }
  }, [client, tokens]);

  const logout = useCallback(() => {
    setPolicies([]);
    setTokens({});
    setActivePolicyNumber(null);
  }, []);

  // Auto-login on mount if policyNumbers provided
  const autoLoginRef = useRef(false);
  useEffect(() => {
    if (policyNumbers && policyNumbers.length > 0 && !autoLoginRef.current) {
      autoLoginRef.current = true;
      void login(policyNumbers);
    }
  }, [policyNumbers, login]);

  const value = useMemo(() => ({
    client,
    events,
    policies,
    activePolicy,
    isAuthenticated,
    loading,
    locale,
    login,
    switchPolicy,
    logout,
  }), [client, events, policies, activePolicy, isAuthenticated, loading, locale, login, switchPolicy, logout]);

  const resolvedTheme = theme ?? defaultTheme;
  const cssVars = themeToCSS(resolvedTheme);

  return (
    <PhoenixContext.Provider value={value}>
      <div
        style={{ ...cssVars, fontFamily: resolvedTheme.fontFamily } as CSSProperties}
        data-phoenix-root
      >
        {children}
      </div>
    </PhoenixContext.Provider>
  );
}

export function usePhoenix(): PhoenixContextValue {
  const ctx = useContext(PhoenixContext);
  if (!ctx) {
    throw new Error('usePhoenix must be used within a <PhoenixProvider>');
  }
  return ctx;
}
