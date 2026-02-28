export { default as AuthProvider, useAuth } from './AuthProvider';
export type { AuthProviderProps } from './AuthProvider';
export { default as ProtectedRoute } from './ProtectedRoute';
export { default as LoginPage } from './LoginPage';
export {
  configureAuthClient,
  startImpersonation,
  endImpersonation,
  getPasskeyRegisterOptions,
  verifyPasskeyRegister,
} from './auth-client';
export {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  isTokenValid,
  onTokenChange,
} from './token-store';
export { reportError } from './error-reporter';
