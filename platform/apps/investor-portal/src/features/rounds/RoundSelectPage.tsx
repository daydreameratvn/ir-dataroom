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
  Skeleton,
  cn,
} from '@papaya/shared-ui';
import { Briefcase, Calendar, ChevronRight } from 'lucide-react';
import { listRounds, type Round } from '@/lib/api';
import { getStatusStyle } from '@/lib/file-utils';

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
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="border-l-4 border-l-muted">
              <CardHeader>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
        <Briefcase className="size-12 text-muted-foreground/30" />
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No rounds available
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Investment rounds will appear here when you are invited.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Your Rounds
        </h1>
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
  const statusStyle = getStatusStyle(round.status);

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
      className="group cursor-pointer border-l-4 border-l-primary transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      onClick={() => navigate(`/rounds/${round.slug}`)}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{round.name}</CardTitle>
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 rounded-full capitalize',
              statusStyle.bgClass,
              statusStyle.textClass,
            )}
          >
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
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {round.closedAt && (
              <div className="flex items-center gap-1.5">
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
          <ChevronRight className="size-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
