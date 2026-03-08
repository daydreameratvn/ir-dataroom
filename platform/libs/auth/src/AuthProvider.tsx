import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User, AuthSession, UserPreferences } from '@papaya/shared-types';
import {
  refreshAccessToken,
  revokeToken,
  startImpersonation as startImpersonationApi,
  endImpersonation as endImpersonationApi,
  getPreferences,
  updatePreferences as updatePreferencesApi,
} from './auth-client';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  extractTokenFromHash,
  getTimeUntilExpiry,
} from './token-store';

interface AuthContextValue {
  user: User | null;
  session: AuthSession | null;
  preferences: UserPreferences | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonation: { impersonatorId: string; impersonatorName: string } | null;
  signIn: (user: User, accessToken: string, expiresAt: string) => void;
  signOut: () => Promise<void>;
  startImpersonation: (userId: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalSessionRef = useRef<AuthSession | null>(null);

  const doRefresh = useCallback(async (): Promise<boolean> => {
    // Retry up to 3 times with exponential backoff before giving up
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await refreshAccessToken();
        setAccessToken(result.accessToken, result.expiresAt);
        setSession({
          user: result.user,
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
          impersonation: result.impersonation,
        });
        return true;
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
    // All retries exhausted — user needs to re-login
    clearAccessToken();
    setSession(null);
    originalSessionRef.current = null;
    return false;
  }, []);

  const scheduleRefresh = useCallback((_expiresAt?: string) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Refresh 2 minutes before expiry
    const delay = Math.max(0, getTimeUntilExpiry() - 2 * 60 * 1000);
    refreshTimerRef.current = setTimeout(async () => {
      const ok = await doRefresh();
      if (ok) {
        scheduleRefresh();
      }
    }, delay);
  }, [doRefresh]);

  const fetchAndSetPreferences = useCallback(async (accessToken: string) => {
    try {
      const prefs = await getPreferences(accessToken);
      setPreferences(prefs);
    } catch {
      // Non-critical — use defaults
    }
  }, []);

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const updated = await updatePreferencesApi(patch, token);
      setPreferences(updated);
    } catch {
      // Best effort
    }
  }, []);

  const signIn = useCallback(
    (user: User, accessToken: string, expiresAt: string) => {
      setAccessToken(accessToken, expiresAt);
      setSession({ user, accessToken, expiresAt });
      scheduleRefresh(expiresAt);
    },
    [scheduleRefresh],
  );

  const signOut = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      try {
        await revokeToken(token);
      } catch {
        // Best effort revocation
      }
    }
    clearAccessToken();
    setSession(null);
    setPreferences(null);
    originalSessionRef.current = null;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const startImpersonation = useCallback(
    async (userId: string) => {
      const token = getAccessToken();
      if (!token || !session) return;

      // Save the admin's current session before impersonating
      originalSessionRef.current = session;

      const result = await startImpersonationApi(userId, token);
      setAccessToken(result.accessToken, result.expiresAt);
      setSession({
        user: result.user,
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
        impersonation: result.impersonation,
      });
      scheduleRefresh(result.expiresAt);
    },
    [session, scheduleRefresh],
  );

  const endImpersonation = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      try {
        await endImpersonationApi(token);
      } catch {
        // Best effort
      }
    }

    // Restore the admin's original session
    const original = originalSessionRef.current;
    originalSessionRef.current = null;

    if (original) {
      // Refresh the admin's session to get a fresh token
      try {
        const result = await refreshAccessToken();
        setAccessToken(result.accessToken, result.expiresAt);
        setSession({
          user: result.user,
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
        });
        scheduleRefresh(result.expiresAt);
      } catch {
        // Fallback: restore from saved session
        setAccessToken(original.accessToken, original.expiresAt);
        setSession(original);
        scheduleRefresh(original.expiresAt);
      }
    } else {
      clearAccessToken();
      setSession(null);
    }
  }, [scheduleRefresh]);

  const isImpersonating = originalSessionRef.current !== null || (session?.impersonation != null);
  const impersonation = session?.impersonation ?? null;

  // Bootstrap: check for token in URL fragment (SSO redirect) or try refresh
  useEffect(() => {
    async function bootstrap() {
      // Check for SSO redirect token
      const hashToken = extractTokenFromHash();
      if (hashToken) {
        // We have a token from SSO — refresh to get full user info
        try {
          const result = await refreshAccessToken();
          setAccessToken(result.accessToken, result.expiresAt);
          setSession({
            user: result.user,
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
            impersonation: result.impersonation,
          });
          scheduleRefresh(result.expiresAt);
          await fetchAndSetPreferences(result.accessToken);
        } catch {
          // Token from hash was invalid
        }
        setIsLoading(false);
        return;
      }

      // Try to refresh using httpOnly cookie (may be impersonation or regular)
      try {
        const result = await refreshAccessToken();
        setAccessToken(result.accessToken, result.expiresAt);
        setSession({
          user: result.user,
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
          impersonation: result.impersonation,
        });
        scheduleRefresh(result.expiresAt);
        await fetchAndSetPreferences(result.accessToken);
      } catch {
        // No valid session — user needs to login
      }
      setIsLoading(false);
    }

    bootstrap();

    // When the tab becomes visible or gains focus, check if the token
    // is expired or about to expire and refresh proactively.
    // Browsers throttle setTimeout in background tabs, so the scheduled
    // refresh may have been delayed past the token's expiry.
    function handleReactivation() {
      if (document.visibilityState === 'hidden') return;
      const remaining = getTimeUntilExpiry();
      if (remaining > 2 * 60 * 1000) return; // still plenty of time
      doRefresh().then((ok) => {
        if (ok) scheduleRefresh();
      });
    }

    document.addEventListener('visibilitychange', handleReactivation);
    window.addEventListener('focus', handleReactivation);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
    };
  }, [scheduleRefresh, doRefresh]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        preferences,
        isLoading,
        isAuthenticated: session !== null,
        isImpersonating,
        impersonation,
        signIn,
        signOut,
        startImpersonation,
        endImpersonation,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
