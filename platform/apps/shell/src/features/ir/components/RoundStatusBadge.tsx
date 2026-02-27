import { Badge } from '@papaya/shared-ui';
import type { RoundStatus } from '../types';

interface RoundStatusBadgeProps {
  status: RoundStatus;
}

export default function RoundStatusBadge({ status }: RoundStatusBadgeProps) {
  switch (status) {
    case 'draft':
      return (
        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
          Draft
        </Badge>
      );
    case 'active':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          Active
        </Badge>
      );
    case 'paused':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          Paused
        </Badge>
      );
    case 'closed':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          Closed
        </Badge>
      );
    case 'archived':
      return (
        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
