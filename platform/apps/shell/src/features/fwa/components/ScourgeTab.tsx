import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@papaya/shared-ui';
import type { ScourgeJob, ScourgeJobDetail, ScourgePhase, ScourgeSSEEvent } from '../types';
import { getScourgeJob, listScourgeJobs, startScourgeJob } from '../api';

// ── Phase Indicator ──

const PHASE_ORDER: ScourgePhase[] = ['fetching', 'querying', 'extracting', 'editing', 'completed'];

function PhaseIndicator({ currentPhase }: { currentPhase: ScourgePhase }) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={phase} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${
                isDone
                  ? 'bg-emerald-500'
                  : isCurrent
                    ? 'bg-blue-500'
                    : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
            <span
              className={`text-xs ${
                isDone
                  ? 'text-emerald-600'
                  : isCurrent
                    ? 'font-medium text-blue-600'
                    : 'text-gray-400'
              }`}
            >
              {phase}
            </span>
            {i < PHASE_ORDER.length - 1 && (
              <span className="text-gray-300">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Status Badge ──

function JobStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ── Main Component ──

export default function ScourgeTab() {
  const [claimCode, setClaimCode] = useState('');
  const [jobs, setJobs] = useState<ScourgeJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  // Active job streaming state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScourgePhase>('fetching');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  // Detail view state
  const [detailJob, setDetailJob] = useState<ScourgeJobDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await listScourgeJobs();
      setJobs(data);
    } catch {
      // Silent
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function handleStart() {
    if (!claimCode.trim()) return;

    setIsStarting(true);
    try {
      const response = await startScourgeJob(claimCode.trim());
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      // Read the SSE stream for progress
      async function readStream() {
        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const event = JSON.parse(line.slice(6)) as ScourgeSSEEvent;
                handleScourgeEvent(event);
              } catch {
                // Skip
              }
            }
          }
        }
      }

      readStream().finally(() => {
        setActiveJobId(null);
        fetchJobs();
        setIsStarting(false);
      });
    } catch {
      setIsStarting(false);
    }
  }

  function handleScourgeEvent(event: ScourgeSSEEvent) {
    switch (event.type) {
      case 'job_started':
        setActiveJobId(event.jobId);
        setPhase('fetching');
        setProgressMessage('Starting...');
        setProgressPercent(0);
        break;
      case 'progress':
        setPhase(event.phase);
        setProgressMessage(event.message);
        if (event.totalDocs && event.currentDoc) {
          setProgressPercent(Math.round((event.currentDoc / event.totalDocs) * 100));
        }
        break;
      case 'job_completed':
        setPhase('completed');
        setProgressMessage('Processing complete');
        setProgressPercent(100);
        break;
      case 'job_failed':
        setPhase('failed');
        setProgressMessage(event.error);
        break;
    }
  }

  async function handleViewDetail(jobId: string) {
    setIsLoadingDetail(true);
    try {
      const detail = await getScourgeJob(jobId);
      setDetailJob(detail);
    } catch {
      // Silent
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function handleBackFromDetail() {
    setDetailJob(null);
  }

  // Detail view
  if (detailJob) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackFromDetail} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-medium">
            Scourge Job: <span className="font-mono">{detailJob.claimCode}</span>
          </span>
          <JobStatusBadge status={detailJob.status} />
        </div>

        {detailJob.result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Documents</div>
                  <div className="text-2xl font-bold">{detailJob.result.documents.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Processed</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {detailJob.result.documents.filter((d) => !d.skipped).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Skipped</div>
                  <div className="text-2xl font-bold text-amber-600">
                    {detailJob.result.documents.filter((d) => d.skipped).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-2xl font-bold">{detailJob.result.status}</div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Replaced Fields</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailJob.result.documents.map((doc, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">
                        {doc.original.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {doc.skipped ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                            Skipped
                          </Badge>
                        ) : doc.modified ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            Modified
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
                            No Changes
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {doc.replacedFields?.join(', ') ?? '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {doc.reason ?? '-'}
                      </TableCell>
                      <TableCell>
                        {doc.modified && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                            <Download className="h-3 w-3" />
                            Download
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No results available yet.
          </div>
        )}
      </div>
    );
  }

  // Landing view: job list + start form
  return (
    <div className="space-y-6">
      {/* Start form */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Claim Code</label>
              <Input
                placeholder="Enter claim code for PII replacement..."
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStart();
                }}
                disabled={isStarting}
              />
            </div>
            <Button
              onClick={handleStart}
              disabled={!claimCode.trim() || isStarting}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {isStarting ? 'Processing...' : 'Start Scourge'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active job progress */}
      {activeJobId && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Processing Job</span>
              <PhaseIndicator currentPhase={phase} />
            </div>
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">{progressMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Job list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </h3>
          <Button variant="outline" size="sm" onClick={fetchJobs} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {isLoadingJobs ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Loading jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-8 w-8 text-gray-300" />
            <span>No scourge jobs yet</span>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.claimCode}</TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-sm">{job.documentCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(job.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleViewDetail(job.id)}
                        disabled={isLoadingDetail}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
