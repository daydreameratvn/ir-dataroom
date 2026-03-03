// Provider
export { PhoenixProvider, usePhoenix } from './provider';
export type { PhoenixProviderProps } from './provider';

// Events
export { PhoenixEventEmitter } from './events';
export type { PhoenixEventType, PhoenixEventMap } from './events';

// Hooks
export { useClaims } from './hooks/useClaims';
export { useClaim } from './hooks/useClaim';
export { usePhoenixEvent } from './hooks/usePhoenixEvent';

// Theme
export { defaultTheme, themeToCSS } from './styles/theme';
export type { PhoenixTheme } from './styles/theme';

// i18n
export { t, getStatusLabel, getDocTypeLabel } from './i18n';
export type { Locale } from './i18n';

// Components
export { PhoenixPortal } from './components/PhoenixPortal';
export type { PhoenixPortalProps } from './components/PhoenixPortal';
export { StatusBadge } from './components/StatusBadge';
export type { StatusBadgeProps } from './components/StatusBadge';
export { ClaimsList } from './components/ClaimsList';
export type { ClaimsListProps } from './components/ClaimsList';
export { ClaimDetail } from './components/ClaimDetail';
export type { ClaimDetailProps } from './components/ClaimDetail';
export { ClaimSubmission } from './components/ClaimSubmission';
export type { ClaimSubmissionProps } from './components/ClaimSubmission';
export { AdditionalDocs } from './components/AdditionalDocs';
export type { AdditionalDocsProps } from './components/AdditionalDocs';
