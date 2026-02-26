import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User, AuthSession } from '@papaya/shared-types';

interface AuthContextValue {
  user: User | null;
  session: AuthSession | null;
  signIn: (user: User) => void;
  signOut: () => void;
}

const mockUser: User = {
  id: 'user-001',
  email: 'admin@papaya.insure',
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(mockSession);

  function signIn(user: User) {
    setSession({
      user,
      accessToken: 'mock-token',
      expiresAt: '2099-12-31T23:59:59Z',
    });
  }

  function signOut() {
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
