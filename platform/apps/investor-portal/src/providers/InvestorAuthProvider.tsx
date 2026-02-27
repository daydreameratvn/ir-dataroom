import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const TOKEN_KEY = 'investor_token';
const INVESTOR_KEY = 'investor_info';

export interface Investor {
  id: string;
  email: string;
  name: string;
  firm: string | null;
}

interface InvestorAuthContextValue {
  isAuthenticated: boolean;
  investor: Investor | null;
  token: string | null;
  login: (token: string, investor: Investor) => void;
  logout: () => void;
  getToken: () => string | null;
}

const InvestorAuthContext = createContext<InvestorAuthContextValue | null>(null);

interface InvestorAuthProviderProps {
  children: ReactNode;
}

export function InvestorAuthProvider({ children }: InvestorAuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  const [investor, setInvestor] = useState<Investor | null>(() => {
    const stored = localStorage.getItem(INVESTOR_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as Investor;
      } catch {
        return null;
      }
    }
    return null;
  });

  const isAuthenticated = token !== null && investor !== null;

  const login = useCallback((newToken: string, newInvestor: Investor) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(INVESTOR_KEY, JSON.stringify(newInvestor));
    setToken(newToken);
    setInvestor(newInvestor);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(INVESTOR_KEY);
    setToken(null);
    setInvestor(null);
  }, []);

  const getToken = useCallback(() => {
    return localStorage.getItem(TOKEN_KEY);
  }, []);

  // Listen for storage changes from other tabs
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === TOKEN_KEY) {
        setToken(e.newValue);
      }
      if (e.key === INVESTOR_KEY) {
        if (e.newValue) {
          try {
            setInvestor(JSON.parse(e.newValue) as Investor);
          } catch {
            setInvestor(null);
          }
        } else {
          setInvestor(null);
        }
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, investor, token, login, logout, getToken }),
    [isAuthenticated, investor, token, login, logout, getToken],
  );

  return (
    <InvestorAuthContext.Provider value={value}>
      {children}
    </InvestorAuthContext.Provider>
  );
}

export function useInvestorAuth(): InvestorAuthContextValue {
  const ctx = useContext(InvestorAuthContext);
  if (!ctx) {
    throw new Error('useInvestorAuth must be used within InvestorAuthProvider');
  }
  return ctx;
}
