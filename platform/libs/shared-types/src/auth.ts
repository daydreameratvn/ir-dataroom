export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'claims_processor' | 'fwa_analyst' | 'viewer';
  avatarUrl?: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  expiresAt: string;
}
