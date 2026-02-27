import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from '@papaya/shared-ui';
import { Briefcase, Calendar, Loader2 } from 'lucide-react';
import { listRounds, type Round } from '@/lib/api';

export default function RoundSelectPage() {
  const navigate = useNavigate();

  const { data: rounds, isLoading, error } = useQuery({
    queryKey: ['rounds'],
    queryFn: listRounds,
  });

  // Auto-redirect if only one round
  useEffect(() => {
    if (rounds && rounds.length === 1) {
      const round = rounds[0]!;
      navigate(`/rounds/${round.slug}`, { replace: true });
    }
  }, [rounds, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-destructive">
          Failed to load rounds. Please try again later.
        </p>
      </div>
    );
  }

  if (!rounds || rounds.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <Briefcase className="size-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No investment rounds are available at this time.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Your Rounds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a round to access its data room.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {rounds.map((round) => (
          <RoundCard key={round.id} round={round} />
        ))}
      </div>
    </div>
  );
}

interface RoundCardProps {
  round: Round;
}

function RoundCard({ round }: RoundCardProps) {
  const navigate = useNavigate();

  function formatDate(iso: string | null): string {
    if (!iso) return '--';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/rounds/${round.slug}`)}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{round.name}</CardTitle>
          <Badge variant="secondary" className="shrink-0 capitalize">
            {round.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        {round.description && (
          <CardDescription className="line-clamp-2">
            {round.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Briefcase className="size-3.5" />
            <span className="capitalize">{round.status.replace(/_/g, ' ')}</span>
          </div>
          {round.closedAt && (
            <div className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              <span>Closes {formatDate(round.closedAt)}</span>
            </div>
          )}
          {round.targetRaise != null && round.currency && (
            <div className="font-medium text-foreground">
              {round.currency} {round.targetRaise.toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
