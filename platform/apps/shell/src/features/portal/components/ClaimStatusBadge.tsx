import { Badge } from '@papaya/shared-ui';
import { CLAIM_STATUS_CONFIG, CLAIM_TYPE_CONFIG } from '../types';

interface ClaimStatusBadgeProps {
  status: string;
}

export default function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const config = CLAIM_STATUS_CONFIG[status];
  if (!config) return <Badge variant="secondary">{status}</Badge>;

  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  );
}

interface ClaimTypeBadgeProps {
  type: string | null;
}

export function ClaimTypeBadge({ type }: ClaimTypeBadgeProps) {
  if (!type) return <span className="text-muted-foreground">—</span>;

  const config = CLAIM_TYPE_CONFIG[type];
  if (!config) return <Badge variant="secondary">{type}</Badge>;

  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  );
}
