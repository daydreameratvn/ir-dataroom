import { Clock, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@papaya/shared-ui';
import usePendingAssessments from '../hooks/usePendingAssessments';
import NewDataBanner from '../../../components/NewDataBanner';

interface PendingTabProps {
  onSelectChat: (chatId: string, claimCode: string) => void;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function PendingTab({ onSelectChat }: PendingTabProps) {
  const { pending, isLoading, error, hasNewData, refetch } = usePendingAssessments();

  return (
    <div className="space-y-4">
      {hasNewData && (
        <NewDataBanner message="New pending assessments are available." onRefresh={refetch} />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {pending.length} pending approval{pending.length !== 1 ? 's' : ''}
        </h3>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading pending assessments...
        </div>
      ) : pending.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-8 w-8 text-gray-300" />
          <span>No pending approvals</span>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((item) => (
                <TableRow key={item.chatId}>
                  <TableCell className="font-mono text-xs">
                    {item.claimCode}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      Awaiting Approval
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatTime(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onSelectChat(item.chatId, item.claimCode)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
