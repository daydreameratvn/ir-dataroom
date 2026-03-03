import { useState, useCallback } from 'react';
import { PhoenixProvider, usePhoenix, type PhoenixProviderProps } from '../provider';
import { ClaimsList } from './ClaimsList';
import { ClaimDetail } from './ClaimDetail';
import { ClaimSubmission } from './ClaimSubmission';
import { AdditionalDocs } from './AdditionalDocs';
import type { PhoenixTheme } from '../styles/theme';
import type { Locale } from '../i18n';
import type { Claim } from '@papaya/phoenix';

export interface PhoenixPortalProps {
  policyNumbers: string[];
  baseUrl: string;
  tenantId?: string;
  theme?: PhoenixTheme;
  locale?: Locale;
  onClaimSubmitted?: (claim: { id: string; claimNumber: string }) => void;
  className?: string;
}

type PortalView =
  | { type: 'list' }
  | { type: 'detail'; claimId: string }
  | { type: 'submit' }
  | { type: 'additional-docs'; claimId: string };

export function PhoenixPortal({
  policyNumbers,
  baseUrl,
  tenantId,
  theme,
  locale,
  onClaimSubmitted,
  className,
}: PhoenixPortalProps) {
  const config: PhoenixProviderProps['config'] = { baseUrl };

  return (
    <PhoenixProvider
      config={config}
      tenantId={tenantId}
      policyNumbers={policyNumbers}
      theme={theme}
      locale={locale}
    >
      <div className={className} data-phoenix-portal>
        <PortalContent onClaimSubmitted={onClaimSubmitted} />
      </div>
    </PhoenixProvider>
  );
}

function PortalContent({
  onClaimSubmitted,
}: {
  onClaimSubmitted?: (claim: { id: string; claimNumber: string }) => void;
}) {
  const { loading, isAuthenticated } = usePhoenix();
  const [view, setView] = useState<PortalView>({ type: 'list' });

  const handleClaimSelect = useCallback((claim: Claim) => {
    setView({ type: 'detail', claimId: claim.id });
  }, []);

  const handleSubmitNew = useCallback(() => {
    setView({ type: 'submit' });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  const handleAdditionalDocs = useCallback((claimId: string) => {
    setView({ type: 'additional-docs', claimId });
  }, []);

  const handleSubmitComplete = useCallback((claim: { id: string; claimNumber: string }) => {
    onClaimSubmitted?.(claim);
    setView({ type: 'detail', claimId: claim.id });
  }, [onClaimSubmitted]);

  const handleAdditionalDocsComplete = useCallback(() => {
    if (view.type === 'additional-docs') {
      setView({ type: 'detail', claimId: view.claimId });
    } else {
      setView({ type: 'list' });
    }
  }, [view]);

  if (loading) {
    return (
      <div style={portalStyles.center}>
        <div style={portalStyles.spinner} />
        <p style={portalStyles.muted}>Authenticating...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={portalStyles.center}>
        <p style={portalStyles.muted}>Unable to authenticate. Please check your policy numbers.</p>
      </div>
    );
  }

  switch (view.type) {
    case 'list':
      return (
        <ClaimsList
          onClaimSelect={handleClaimSelect}
          onSubmitNew={handleSubmitNew}
        />
      );
    case 'detail':
      return (
        <ClaimDetail
          claimId={view.claimId}
          onBack={handleBack}
          onAdditionalDocs={handleAdditionalDocs}
        />
      );
    case 'submit':
      return (
        <ClaimSubmission
          onComplete={handleSubmitComplete}
          onCancel={handleBack}
        />
      );
    case 'additional-docs':
      return (
        <AdditionalDocs
          claimId={view.claimId}
          onComplete={handleAdditionalDocsComplete}
          onBack={() => setView({ type: 'detail', claimId: view.claimId })}
        />
      );
  }
}

const portalStyles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
    gap: '8px',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '3px solid var(--phoenix-color-border, #e5e7eb)',
    borderTopColor: 'var(--phoenix-color-primary, #E30613)',
    borderRadius: '50%',
    animation: 'phoenix-spin 0.6s linear infinite',
  },
  muted: {
    fontSize: '13px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: 0,
  },
};
