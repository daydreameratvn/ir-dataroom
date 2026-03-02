import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@papaya/shared-ui';
import { CheckCircle2, Download, Loader2, ShieldCheck } from 'lucide-react';
import { getRound, acceptNda, downloadNdaPdf } from '@/lib/api';

export default function NDAPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['round', slug],
    queryFn: () => getRound(slug!),
    enabled: !!slug,
  });

  const mutation = useMutation({
    mutationFn: () => acceptNda(slug!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round', slug] });
      navigate(`/rounds/${slug}/documents`, { replace: true });
    },
  });

  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownloadNda() {
    if (!slug) return;
    setIsDownloading(true);
    try {
      const blob = await downloadNdaPdf(slug);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NDA-${data?.round.name ?? slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // Could show error toast
    } finally {
      setIsDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If NDA is already accepted, show download option and redirect link
  if (data?.ndaAccepted) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              NDA Accepted
            </h1>
            <p className="text-sm text-muted-foreground">
              You have already signed the NDA for this round.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleDownloadNda}
            disabled={isDownloading}
          >
            <Download className="size-4" />
            {isDownloading ? 'Downloading...' : 'Download Signed NDA'}
          </Button>
          <Button onClick={() => navigate(`/rounds/${slug}/documents`, { replace: true })}>
            View Documents
          </Button>
        </div>
      </div>
    );
  }

  // If NDA is not required for this investor
  if (data && !data.ndaRequired) {
    navigate(`/rounds/${slug}/documents`, { replace: true });
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Non-Disclosure Agreement
          </h1>
          <p className="text-sm text-muted-foreground">
            Please review and accept the NDA before accessing the data room.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data?.round.name} — Confidentiality Agreement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* NDA Content */}
          <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6">
            {data?.ndaTemplate ? (
              <div
                className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
              >
                {data.ndaTemplate.content}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No NDA template has been provided for this round.
                Please contact your fund representative.
              </p>
            )}
          </div>

          {/* Acceptance */}
          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-foreground">
                I have read and understand this Non-Disclosure Agreement. I agree
                to be bound by its terms and conditions.
              </span>
            </label>

            {mutation.error && (
              <p className="text-sm text-destructive">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : 'Failed to accept NDA. Please try again.'}
              </p>
            )}

            <Button
              onClick={() => mutation.mutate()}
              disabled={!agreed || mutation.isPending || !data?.ndaTemplate}
              className="w-full sm:w-auto"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  I Accept
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
