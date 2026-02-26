export type UserType = 'insurer' | 'broker' | 'provider' | 'papaya';

export type UserLevel = 'admin' | 'executive' | 'manager' | 'staff' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  userType: UserType;
  userLevel: UserLevel;
  tenantId: string;
  title?: string;
  department?: string;
  locale?: string;
  isImpersonatable?: boolean;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  impersonation?: {
    impersonatorId: string;
    impersonatorName: string;
  };
}
