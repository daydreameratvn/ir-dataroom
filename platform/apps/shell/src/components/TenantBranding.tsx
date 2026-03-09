import { useState } from 'react';
import { cn } from '@papaya/shared-ui';
import { useTenant } from '@/providers/TenantProvider';

export interface TenantBrandingProps {
  /** Override the logo URL from tenant context */
  logoUrl?: string;
  /** Override the tenant name from context */
  tenantName?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

export default function TenantBranding({
  logoUrl: propLogoUrl,
  tenantName: propTenantName,
  size = 'sm',
  className,
}: TenantBrandingProps) {
  const { tenant } = useTenant();
  const [imageError, setImageError] = useState(false);

  const logoUrl = propLogoUrl ?? tenant.logoUrl;
  const tenantName = propTenantName ?? tenant.name;
  const initial = tenantName?.charAt(0).toUpperCase() || 'O';

  const handleImageError = () => {
    setImageError(true);
  };

  // Show logo if URL exists and hasn't errored
  const showLogo = logoUrl && !imageError;

  return (
    <div
      data-testid="tenant-branding"
      className={cn(
        'flex items-center justify-center rounded-lg bg-papaya text-white font-bold shadow-sm overflow-hidden',
        sizeClasses[size],
        className,
      )}
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt={tenantName}
          onError={handleImageError}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
