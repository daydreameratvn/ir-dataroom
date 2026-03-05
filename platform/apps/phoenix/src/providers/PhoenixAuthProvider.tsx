import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PolicyInfo } from '@/lib/api';

const TOKEN_PREFIX = 'phoenix_token_';
const POLICIES_KEY = 'phoenix_policies';
const ACTIVE_POLICY_KEY = 'phoenix_active_policy';

interface PhoenixAuthContextValue {
  isAuthenticated: boolean;
  policies: PolicyInfo[];
  activePolicy: PolicyInfo | null;
  login: (policies: PolicyInfo[], tokens: Record<string, string>) => void;
  switchPolicy: (policyNumber: string) => void;
  logout: () => void;
  getToken: () => string | null;
}

const PhoenixAuthContext = createContext<PhoenixAuthContextValue | null>(null);

interface PhoenixAuthProviderProps {
  children: ReactNode;
}

export function PhoenixAuthProvider({ children }: PhoenixAuthProviderProps) {
  const [policies, setPolicies] = useState<PolicyInfo[]>(() => {
    const stored = localStorage.getItem(POLICIES_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as PolicyInfo[];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [activePolicyNumber, setActivePolicyNumber] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_POLICY_KEY),
  );

  const activePolicy =
    policies.find((p) => p.policyNumber === activePolicyNumber) ?? null;
  const isAuthenticated = activePolicy !== null;

  const login = useCallback(
    (newPolicies: PolicyInfo[], tokens: Record<string, string>) => {
      localStorage.setItem(POLICIES_KEY, JSON.stringify(newPolicies));
      for (const [policyNumber, token] of Object.entries(tokens)) {
        localStorage.setItem(`${TOKEN_PREFIX}${policyNumber}`, token);
      }
      setPolicies(newPolicies);

      if (newPolicies.length > 0) {
        const first = newPolicies[0]!;
        localStorage.setItem(ACTIVE_POLICY_KEY, first.policyNumber);
        setActivePolicyNumber(first.policyNumber);
      }
    },
    [],
  );

  const switchPolicy = useCallback(
    (policyNumber: string) => {
      const exists = policies.some((p) => p.policyNumber === policyNumber);
      if (exists) {
        localStorage.setItem(ACTIVE_POLICY_KEY, policyNumber);
        setActivePolicyNumber(policyNumber);
      }
    },
    [policies],
  );

  const logout = useCallback(() => {
    for (const p of policies) {
      localStorage.removeItem(`${TOKEN_PREFIX}${p.policyNumber}`);
    }
    localStorage.removeItem(POLICIES_KEY);
    localStorage.removeItem(ACTIVE_POLICY_KEY);
    setPolicies([]);
    setActivePolicyNumber(null);
  }, [policies]);

  const getToken = useCallback(() => {
    const active = localStorage.getItem(ACTIVE_POLICY_KEY);
    if (!active) return null;
    return localStorage.getItem(`${TOKEN_PREFIX}${active}`);
  }, []);

  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === POLICIES_KEY) {
        if (e.newValue) {
          try {
            setPolicies(JSON.parse(e.newValue) as PolicyInfo[]);
          } catch {
            setPolicies([]);
          }
        } else {
          setPolicies([]);
        }
      }
      if (e.key === ACTIVE_POLICY_KEY) {
        setActivePolicyNumber(e.newValue);
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      policies,
      activePolicy,
      login,
      switchPolicy,
      logout,
      getToken,
    }),
    [isAuthenticated, policies, activePolicy, login, switchPolicy, logout, getToken],
  );

  return (
    <PhoenixAuthContext.Provider value={value}>
      {children}
    </PhoenixAuthContext.Provider>
  );
}

export function usePhoenixAuth(): PhoenixAuthContextValue {
  const ctx = useContext(PhoenixAuthContext);
  if (!ctx) {
    throw new Error('usePhoenixAuth must be used within PhoenixAuthProvider');
  }
  return ctx;
}
