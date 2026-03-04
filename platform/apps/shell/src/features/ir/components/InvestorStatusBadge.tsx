import { Badge } from '@papaya/shared-ui';
import type { InvestorRoundStatus } from '../types';

interface InvestorStatusBadgeProps {
  status: InvestorRoundStatus;
}

export default function InvestorStatusBadge({ status }: InvestorStatusBadgeProps) {
  switch (status) {
    case 'invited':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          Invited
        </Badge>
      );
    case 'nda_signed':
      return (
        <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">
          NDA Signed
        </Badge>
      );
    case 'viewing':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          View/Download
        </Badge>
      );
    case 'termsheet_sent':
      return (
        <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
          Termsheet Sent
        </Badge>
      );
    case 'termsheet_signed':
      return (
        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
          Termsheet Signed
        </Badge>
      );
    case 'docs_out':
      return (
        <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">
          Docs Out
        </Badge>
      );
    case 'docs_signed':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Docs Signed
        </Badge>
      );
    case 'dropped':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          Dropped
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
