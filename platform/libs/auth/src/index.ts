export { default as AuthProvider, useAuth, AuthContext } from './AuthProvider';
export type { AuthProviderProps } from './AuthProvider';
export { default as ProtectedRoute } from './ProtectedRoute';
export { default as LoginPage } from './LoginPage';
export { default as WorkOSLoginPage } from './WorkOSLoginPage';
export {
  configureAuthClient,
  AuthError,
  getWorkOSLoginUrl,
  startImpersonation,
  endImpersonation,
  getPasskeyRegisterOptions,
  verifyPasskeyRegister,
  listPasskeys,
  deletePasskey,
  renamePasskey,
} from './auth-client';
export type { PasskeyInfo } from './auth-client';
export {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  isTokenValid,
  onTokenChange,
} from './token-store';
export { reportError } from './error-reporter';
