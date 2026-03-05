import { useState, type ReactNode } from 'react';
import type { User, AuthSession } from '@papaya/shared-types';
import { AuthContext } from '@papaya/auth';

const mockUser: User = {
  id: 'user-001',
  email: 'admin@papaya.asia',
  name: 'Sarah Chen',
  avatarUrl: undefined,
  userType: 'insurer',
  userLevel: 'admin',
  tenantId: 'papaya-demo',
  title: 'VP of Claims',
  department: 'Claims Operations',
  locale: 'en',
};

const mockSession: AuthSession = {
  user: mockUser,
  accessToken: 'mock-token',
  expiresAt: '2099-12-31T23:59:59Z',
};

export interface AuthProviderProps {
  children: ReactNode;
}

export default function MockAuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(mockSession);

  function signIn(user: User, accessToken: string, expiresAt: string) {
    setSession({ user, accessToken, expiresAt });
  }

  function signOut() {
    setSession(null);
    return Promise.resolve();
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: session !== null,
        isImpersonating: false,
        impersonation: null,
        signIn,
        signOut,
        startImpersonation: async () => {},
        endImpersonation: async () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
