import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Shield,
  ClipboardCheck,
  ShieldAlert,
  BarChart3,
  Building2,
  Settings,
  Bot,
  Plus,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Search,
  Square,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  MarkdownRenderer,
} from '@papaya/shared-ui';
import { simulateStream } from '../fatima/useFatimaChat';

interface CommandAction {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  section: 'navigation' | 'quick-actions' | 'ai';
  keywords?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  onOpenFatima: () => void;
}

export default function CommandPalette({ onOpenFatima }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fatimaMode, setFatimaMode] = useState(false);
  const [fatimaQuery, setFatimaQuery] = useState('');
  const [fatimaResponse, setFatimaResponse] = useState('');
  const [fatimaStreaming, setFatimaStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Global ⌘K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-scroll response area
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [fatimaResponse]);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      handleClose();
    },
    [navigate]
  );

  function askFatima(query: string) {
    if (!query.trim()) return;
    setFatimaMode(true);
    setFatimaQuery(query.trim());
    setFatimaResponse('');
    setFatimaStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    simulateStream(
      query.trim(),
      (delta) => setFatimaResponse((prev) => prev + delta),
      () => {
        setFatimaStreaming(false);
        abortRef.current = null;
      },
      controller.signal
    );
  }

  function exitFatimaMode() {
    abortRef.current?.abort();
    setFatimaMode(false);
    setFatimaQuery('');
    setFatimaResponse('');
    setFatimaStreaming(false);
  }

  function handleClose() {
    exitFatimaMode();
    setSearch('');
    setOpen(false);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      handleClose();
    } else {
      setOpen(true);
    }
  }

  function handleContinueInPanel() {
    handleClose();
    onOpenFatima();
  }

  const actions: CommandAction[] = useMemo(
    () => [
      // Navigation
      {
        id: 'nav-dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        section: 'navigation',
        keywords: 'home overview kpi',
        onSelect: () => go('/'),
      },
      {
        id: 'nav-claims-intake',
        label: 'Claims Intake',
        icon: FileText,
        section: 'navigation',
        keywords: 'new claim submit file',
        onSelect: () => go('/claims/intake'),
      },
      {
        id: 'nav-claims-review',
        label: 'Claims Review Queue',
        icon: FileText,
        section: 'navigation',
        keywords: 'pending review queue',
        onSelect: () => go('/claims/review'),
      },
      {
        id: 'nav-claims-adjudication',
        label: 'Claims Adjudication',
        icon: FileText,
        section: 'navigation',
        keywords: 'assess adjudicate decide',
        onSelect: () => go('/claims/adjudication'),
      },
      {
        id: 'nav-claims-history',
        label: 'Claims History',
        icon: FileText,
        section: 'navigation',
        keywords: 'past claims log archive',
        onSelect: () => go('/claims/history'),
      },
      {
        id: 'nav-policies-browse',
        label: 'Browse Policies',
        icon: Shield,
        section: 'navigation',
        keywords: 'policy list search',
        onSelect: () => go('/policies/browse'),
      },
      {
        id: 'nav-policies-endorsements',
        label: 'Policy Endorsements',
        icon: Shield,
        section: 'navigation',
        keywords: 'endorsement modify amend',
        onSelect: () => go('/policies/endorsements'),
      },
      {
        id: 'nav-policies-renewals',
        label: 'Policy Renewals',
        icon: Shield,
        section: 'navigation',
        keywords: 'renew renewal expiring',
        onSelect: () => go('/policies/renewals'),
      },
      {
        id: 'nav-policies-servicing',
        label: 'Policy Servicing',
        icon: Shield,
        section: 'navigation',
        keywords: 'service maintain update',
        onSelect: () => go('/policies/servicing'),
      },
      {
        id: 'nav-underwriting-applications',
        label: 'Underwriting Applications',
        icon: ClipboardCheck,
        section: 'navigation',
        keywords: 'application apply new policy',
        onSelect: () => go('/underwriting/applications'),
      },
      {
        id: 'nav-underwriting-risk',
        label: 'Risk Assessment',
        icon: ClipboardCheck,
        section: 'navigation',
        keywords: 'risk score evaluate',
        onSelect: () => go('/underwriting/risk'),
      },
      {
        id: 'nav-underwriting-pricing',
        label: 'Pricing',
        icon: ClipboardCheck,
        section: 'navigation',
        keywords: 'premium price quote',
        onSelect: () => go('/underwriting/pricing'),
      },
      {
        id: 'nav-fwa-alerts',
        label: 'FWA Alerts',
        icon: ShieldAlert,
        section: 'navigation',
        keywords: 'fraud waste abuse alert',
        onSelect: () => go('/fwa/alerts'),
      },
      {
        id: 'nav-fwa-investigations',
        label: 'FWA Investigations',
        icon: ShieldAlert,
        section: 'navigation',
        keywords: 'investigate fraud case',
        onSelect: () => go('/fwa/investigations'),
      },
      {
        id: 'nav-fwa-rules',
        label: 'FWA Rules Engine',
        icon: ShieldAlert,
        section: 'navigation',
        keywords: 'rules engine configure',
        onSelect: () => go('/fwa/rules'),
      },
      {
        id: 'nav-reporting-dashboards',
        label: 'Reporting Dashboards',
        icon: BarChart3,
        section: 'navigation',
        keywords: 'dashboard chart analytics',
        onSelect: () => go('/reporting/dashboards'),
      },
      {
        id: 'nav-reporting-reports',
        label: 'Reports',
        icon: BarChart3,
        section: 'navigation',
        keywords: 'report generate export',
        onSelect: () => go('/reporting/reports'),
      },
      {
        id: 'nav-reporting-analytics',
        label: 'Analytics',
        icon: BarChart3,
        section: 'navigation',
        keywords: 'analytics insights data',
        onSelect: () => go('/reporting/analytics'),
      },
      {
        id: 'nav-reporting-loss',
        label: 'Loss Management',
        icon: BarChart3,
        section: 'navigation',
        keywords: 'loss ratio management',
        onSelect: () => go('/reporting/loss'),
      },
      {
        id: 'nav-providers-directory',
        label: 'Provider Directory',
        icon: Building2,
        section: 'navigation',
        keywords: 'hospital clinic doctor provider',
        onSelect: () => go('/providers/directory'),
      },
      {
        id: 'nav-providers-contracts',
        label: 'Provider Contracts',
        icon: Building2,
        section: 'navigation',
        keywords: 'contract agreement',
        onSelect: () => go('/providers/contracts'),
      },
      {
        id: 'nav-providers-performance',
        label: 'Provider Performance',
        icon: Building2,
        section: 'navigation',
        keywords: 'performance metrics kpi',
        onSelect: () => go('/providers/performance'),
      },
      {
        id: 'nav-admin-users',
        label: 'Users & Roles',
        icon: Settings,
        section: 'navigation',
        keywords: 'user role permission',
        onSelect: () => go('/admin/users'),
      },
      {
        id: 'nav-admin-settings',
        label: 'System Settings',
        icon: Settings,
        section: 'navigation',
        keywords: 'settings configuration',
        onSelect: () => go('/admin/settings'),
      },
      {
        id: 'nav-admin-audit',
        label: 'Audit Log',
        icon: Settings,
        section: 'navigation',
        keywords: 'audit log trail history',
        onSelect: () => go('/admin/audit'),
      },
      {
        id: 'nav-ai-agents',
        label: 'AI Agents',
        icon: Bot,
        section: 'navigation',
        keywords: 'ai agent monitor',
        onSelect: () => go('/ai-agents'),
      },

      // Quick Actions
      {
        id: 'action-new-claim',
        label: 'New Claim',
        icon: Plus,
        section: 'quick-actions',
        keywords: 'create new claim submit',
        onSelect: () => go('/claims/intake'),
      },
      {
        id: 'action-new-policy',
        label: 'New Policy',
        icon: Plus,
        section: 'quick-actions',
        keywords: 'create new policy',
        onSelect: () => go('/policies/browse'),
      },
      {
        id: 'action-new-application',
        label: 'New Underwriting Application',
        icon: Plus,
        section: 'quick-actions',
        keywords: 'apply new application underwriting',
        onSelect: () => go('/underwriting/applications'),
      },

      // AI
      {
        id: 'ai-fatima',
        label: 'Ask Fatima',
        icon: Sparkles,
        shortcut: '⌘J',
        section: 'ai',
        keywords: 'ai assistant help fatima chat question',
        onSelect: () => {
          handleClose();
          onOpenFatima();
        },
      },
    ],
    [go, onOpenFatima]
  );

  const navigation = actions.filter((a) => a.section === 'navigation');
  const quickActions = actions.filter((a) => a.section === 'quick-actions');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Oasis Command Palette</DialogTitle>

        {fatimaMode ? (
          /* ── Fatima inline response mode ── */
          <div className="flex flex-col">
            {/* Header with query */}
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <button
                onClick={exitFatimaMode}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                <Sparkles className="h-2.5 w-2.5" />
              </div>
              <span className="flex-1 truncate text-sm">{fatimaQuery}</span>
              {fatimaStreaming && (
                <button
                  onClick={() => {
                    abortRef.current?.abort();
                    setFatimaStreaming(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Stop"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              )}
            </div>

            {/* Streaming response */}
            <div
              ref={responseRef}
              className="max-h-[400px] overflow-y-auto px-4 py-3"
            >
              {fatimaResponse ? (
                <MarkdownRenderer content={fatimaResponse} size="sm" />
              ) : (
                <div className="flex items-center gap-1.5 py-2 text-muted-foreground">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:0.2s]" />
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:0.4s]" />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground/60">
                  <kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    Esc
                  </kbd>
                  {' '}to go back
                </p>
                <button
                  onClick={handleContinueInPanel}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  Open in Fatima
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Normal command palette mode ── */
          <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <CommandInput
              placeholder="Type a command or ask Fatima..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-4">
                  <Search className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No results found.</p>
                  <button
                    className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    onClick={() => askFatima(search)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Ask Fatima: &ldquo;{search}&rdquo;
                  </button>
                </div>
              </CommandEmpty>

              {/* Always show "Ask Fatima" with current query when typing */}
              <CommandGroup heading="AI Assistant">
                <CommandItem
                  value="ask fatima ai assistant help chat question"
                  onSelect={() => {
                    if (search.trim()) {
                      askFatima(search);
                    } else {
                      handleClose();
                      onOpenFatima();
                    }
                  }}
                  className="gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="font-medium">
                      {search.trim() ? 'Ask Fatima' : 'Open Fatima'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {search.trim()
                        ? `"${search.trim()}"`
                        : 'Wise woman of the desert'}
                    </span>
                  </div>
                  <CommandShortcut>
                    {search.trim() ? '↵' : '⌘J'}
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Quick Actions">
                {quickActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={`${action.label} ${action.keywords ?? ''}`}
                    onSelect={action.onSelect}
                    className="gap-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <action.icon className="h-4 w-4" />
                    </div>
                    <span>{action.label}</span>
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Go to">
                {navigation.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={`${action.label} ${action.keywords ?? ''}`}
                    onSelect={action.onSelect}
                    className="gap-3"
                  >
                    <action.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{action.label}</span>
                    {action.shortcut && (
                      <CommandShortcut>{action.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              <div className="border-t px-3 py-2">
                <p className="text-[11px] text-muted-foreground/60 text-center">
                  <kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                  {' '}to open{' · '}
                  type anything to ask Fatima
                </p>
              </div>
            </CommandList>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}
