import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User, AuthSession } from '@papaya/shared-types';
import {
  refreshAccessToken,
  revokeToken,
  startImpersonation as startImpersonationApi,
  endImpersonation as endImpersonationApi,
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
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonation: { impersonatorId: string; impersonatorName: string } | null;
  signIn: (user: User, accessToken: string, expiresAt: string) => void;
  signOut: () => Promise<void>;
  startImpersonation: (userId: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalSessionRef = useRef<AuthSession | null>(null);

  const scheduleRefresh = useCallback((expiresAt: string) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Refresh 1 minute before expiry
    const delay = Math.max(0, getTimeUntilExpiry() - 60 * 1000);
    refreshTimerRef.current = setTimeout(async () => {
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
      } catch {
        // Refresh failed — user needs to re-login
        clearAccessToken();
        setSession(null);
        originalSessionRef.current = null;
      }
    }, delay);
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
      } catch {
        // No valid session — user needs to login
      }
      setIsLoading(false);
    }

    bootstrap();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleRefresh]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        isLoading,
        isAuthenticated: session !== null,
        isImpersonating,
        impersonation,
        signIn,
        signOut,
        startImpersonation,
        endImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
