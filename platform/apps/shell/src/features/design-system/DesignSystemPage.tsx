import { useState } from 'react';
import {
  Heart,
  Bell,
  Settings,
  Search,
  ChevronRight,
  Plus,
  Mail,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Info,
  Copy,
  Download,
  MoreHorizontal,
  Trash2,
  Pencil,
  User,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  FileText,
  Shield,
  Activity,
} from 'lucide-react';
import {
  cn,
  Button,
  Input,
  Textarea,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Progress,
  Separator,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  PageHeader,
  StatCard,
  EmptyState,
} from '@papaya/shared-ui';

/* ── Helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function ColorSwatch({ name, value, className }: { name: string; value: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn('h-16 w-16 rounded-xl border shadow-sm', className)} />
      <div className="text-center">
        <p className="text-xs font-medium">{name}</p>
        <p className="text-[10px] text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

/* ── Main ── */

export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progressValue] = useState(66);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Design System"
        subtitle="Papaya brand components and tokens — reference for all UI work"
      />

      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="typography">Typography</TabsTrigger>
          <TabsTrigger value="buttons">Buttons</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="data">Data Display</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="overlays">Overlays</TabsTrigger>
          <TabsTrigger value="navigation">Navigation</TabsTrigger>
          <TabsTrigger value="composites">Composites</TabsTrigger>
        </TabsList>

        {/* ── Colors ── */}
        <TabsContent value="colors" className="space-y-8 mt-6">
          <Section title="Brand Colors">
            <div className="flex flex-wrap gap-6">
              <ColorSwatch name="papaya" value="#ED1B55" className="bg-papaya" />
              <ColorSwatch name="papaya-light" value="#FAC8D6" className="bg-papaya-light" />
              <ColorSwatch name="papaya-lightest" value="#FEF3F6" className="bg-papaya-lightest" />
            </div>
          </Section>

          <Section title="Dark Panel Colors">
            <div className="flex flex-wrap gap-6">
              <ColorSwatch name="papaya-dark" value="#292D32" className="bg-papaya-dark" />
              <ColorSwatch name="papaya-darker" value="#1A1D21" className="bg-papaya-darker" />
              <ColorSwatch name="papaya-darkest" value="#111316" className="bg-papaya-darkest" />
            </div>
          </Section>

          <Section title="UI / Neutral Colors">
            <div className="flex flex-wrap gap-6">
              <ColorSwatch name="surface" value="#FFFFFF" className="bg-papaya-surface" />
              <ColorSwatch name="muted" value="#637381" className="bg-papaya-muted" />
              <ColorSwatch name="border" value="#DFE3E8" className="bg-papaya-border" />
            </div>
          </Section>

          <Section title="Semantic Colors (shadcn)">
            <div className="flex flex-wrap gap-6">
              <ColorSwatch name="primary" value="#ED1B55" className="bg-primary" />
              <ColorSwatch name="secondary" value="hsl(240 4.8% 95.9%)" className="bg-secondary" />
              <ColorSwatch name="accent" value="hsl(240 4.8% 95.9%)" className="bg-accent" />
              <ColorSwatch name="muted" value="hsl(240 4.8% 95.9%)" className="bg-muted" />
              <ColorSwatch name="destructive" value="hsl(0 84.2% 60.2%)" className="bg-destructive" />
            </div>
          </Section>

          <Section title="Brand Gradient Preview">
            <div className="flex gap-4">
              <div className="h-24 flex-1 rounded-xl bg-gradient-to-br from-papaya-dark via-papaya-darker to-papaya-darkest shadow-sm" />
              <div className="h-24 flex-1 rounded-xl bg-gradient-to-r from-papaya to-pink-400 shadow-sm" />
              <div className="h-24 flex-1 rounded-xl bg-gradient-to-r from-papaya-lightest to-white border shadow-sm" />
            </div>
          </Section>
        </TabsContent>

        {/* ── Typography ── */}
        <TabsContent value="typography" className="space-y-8 mt-6">
          <Section title="Headings">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h1 className="text-4xl font-bold tracking-tight">Heading 1 — Bold 4xl</h1>
                <h2 className="text-3xl font-bold tracking-tight">Heading 2 — Bold 3xl</h2>
                <h3 className="text-2xl font-semibold">Heading 3 — Semibold 2xl</h3>
                <h4 className="text-xl font-semibold">Heading 4 — Semibold xl</h4>
                <h5 className="text-lg font-medium">Heading 5 — Medium lg</h5>
                <h6 className="text-base font-medium">Heading 6 — Medium base</h6>
              </CardContent>
            </Card>
          </Section>

          <Section title="Body Text">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-base text-foreground">
                  Body (base) — The quick brown fox jumps over the lazy dog. Insurance operations find clarity in the Oasis.
                </p>
                <p className="text-sm text-foreground">
                  Small (sm) — The quick brown fox jumps over the lazy dog. Insurance operations find clarity.
                </p>
                <p className="text-xs text-muted-foreground">
                  Caption (xs, muted) — The quick brown fox jumps over the lazy dog.
                </p>
              </CardContent>
            </Card>
          </Section>

          <Section title="Text Colors">
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-foreground">text-foreground — Primary text</p>
                <p className="text-muted-foreground">text-muted-foreground — Secondary text</p>
                <p className="text-papaya-muted">text-papaya-muted — Papaya muted (#637381)</p>
                <p className="text-papaya">text-papaya — Brand accent (#ED1B55)</p>
                <p className="text-destructive">text-destructive — Error / danger</p>
              </CardContent>
            </Card>
          </Section>

          <Section title="Font Family">
            <Card>
              <CardContent className="pt-6">
                <p className="text-base">Plus Jakarta Sans (default) — ABCDEFGabcdefg 0123456789</p>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Buttons ── */}
        <TabsContent value="buttons" className="space-y-8 mt-6">
          <Section title="Button Variants">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="destructive">Destructive</Button>
              </CardContent>
            </Card>
          </Section>

          <Section title="Button Sizes">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon"><Heart className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          </Section>

          <Section title="Button States">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <Button>Active</Button>
                <Button disabled>Disabled</Button>
                <Button disabled><Loader2 className="h-4 w-4 animate-spin" /> Loading</Button>
              </CardContent>
            </Card>
          </Section>

          <Section title="Buttons with Icons">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <Button><Mail className="h-4 w-4" /> Send Email</Button>
                <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
                <Button variant="secondary"><Plus className="h-4 w-4" /> Add Item</Button>
                <Button variant="ghost"><Copy className="h-4 w-4" /> Copy</Button>
              </CardContent>
            </Card>
          </Section>

          <Section title="Brand-colored Buttons (manual)">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-papaya px-4 py-2.5 text-sm font-semibold text-white hover:bg-papaya/85 transition-colors">
                  Papaya CTA
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-papaya-border bg-white px-4 py-2.5 text-sm font-medium text-foreground hover:border-papaya/25 transition-colors">
                  Outline
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-papaya-lightest px-4 py-2.5 text-sm font-medium text-papaya hover:bg-papaya-light/40 transition-colors">
                  Soft Pink
                </button>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Inputs ── */}
        <TabsContent value="inputs" className="space-y-8 mt-6">
          <Section title="Text Input">
            <Card>
              <CardContent className="space-y-4 pt-6 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default</label>
                  <Input placeholder="Enter your email..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">With value</label>
                  <Input defaultValue="user@papaya.asia" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Disabled</label>
                  <Input disabled placeholder="Disabled input" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">With icon</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-10" placeholder="Search..." />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Section>

          <Section title="Textarea">
            <Card>
              <CardContent className="space-y-4 pt-6 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea placeholder="Enter a description..." rows={3} />
                </div>
              </CardContent>
            </Card>
          </Section>

          <Section title="Select">
            <Card>
              <CardContent className="space-y-4 pt-6 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Country</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="th">Thailand</SelectItem>
                      <SelectItem value="sg">Singapore</SelectItem>
                      <SelectItem value="my">Malaysia</SelectItem>
                      <SelectItem value="id">Indonesia</SelectItem>
                      <SelectItem value="ph">Philippines</SelectItem>
                      <SelectItem value="vn">Vietnam</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Cards ── */}
        <TabsContent value="cards" className="space-y-8 mt-6">
          <Section title="Basic Card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>A short description of the card content goes here.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This is the card body content. It can contain any elements.
                  </p>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="ghost">Cancel</Button>
                  <Button>Save</Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>With Brand Accent</CardTitle>
                  <CardDescription>Using the papaya brand color as accent.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 rounded-lg bg-papaya-lightest p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-papaya text-white">
                      <Heart className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Highlighted Item</p>
                      <p className="text-xs text-muted-foreground">Brand-accented card section</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          <Section title="Stat Cards">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Claims</p>
                      <p className="text-2xl font-bold">1,234</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-papaya-lightest text-papaya">
                      <FileText className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">+12.5%</span>
                    <span className="text-muted-foreground">from last month</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Policies</p>
                      <p className="text-2xl font-bold">8,567</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                      <Shield className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">+3.2%</span>
                    <span className="text-muted-foreground">from last month</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Fraud Alerts</p>
                      <p className="text-2xl font-bold">23</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    <span className="text-red-500 font-medium">-8.1%</span>
                    <span className="text-muted-foreground">from last month</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Processing</p>
                      <p className="text-2xl font-bold">142</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
                      <Activity className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Avg. 2.3 days</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>
        </TabsContent>

        {/* ── Data Display ── */}
        <TabsContent value="data" className="space-y-8 mt-6">
          <Section title="Table">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim ID</TableHead>
                      <TableHead>Policyholder</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">CLM-001</TableCell>
                      <TableCell>Somchai Jaidee</TableCell>
                      <TableCell>Health</TableCell>
                      <TableCell><Badge>Approved</Badge></TableCell>
                      <TableCell className="text-right">฿45,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">CLM-002</TableCell>
                      <TableCell>Amara Srisuk</TableCell>
                      <TableCell>Motor</TableCell>
                      <TableCell><Badge variant="secondary">Pending</Badge></TableCell>
                      <TableCell className="text-right">฿120,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">CLM-003</TableCell>
                      <TableCell>Narong Wongsawat</TableCell>
                      <TableCell>Property</TableCell>
                      <TableCell><Badge variant="destructive">Rejected</Badge></TableCell>
                      <TableCell className="text-right">฿250,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">CLM-004</TableCell>
                      <TableCell>Ploy Chaiyaporn</TableCell>
                      <TableCell>Health</TableCell>
                      <TableCell><Badge variant="outline">In Review</Badge></TableCell>
                      <TableCell className="text-right">฿18,500</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Section>

          <Section title="Badges">
            <Card>
              <CardContent className="pt-6">
                <SubSection title="Variants">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                  </div>
                </SubSection>
                <SubSection title="Custom brand badges">
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span className="inline-flex items-center rounded-full bg-papaya-lightest px-2.5 py-0.5 text-xs font-medium text-papaya">
                      Brand
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      Approved
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      Pending
                    </span>
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      Rejected
                    </span>
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      Info
                    </span>
                  </div>
                </SubSection>
              </CardContent>
            </Card>
          </Section>

          <Section title="Avatar">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 pt-6">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">SC</AvatarFallback>
                </Avatar>
                <Avatar className="h-10 w-10">
                  <AvatarFallback>AS</AvatarFallback>
                </Avatar>
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="text-lg">NW</AvatarFallback>
                </Avatar>
                <Avatar className="h-10 w-10">
                  <AvatarImage src="https://github.com/shadcn.png" alt="User" />
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>
              </CardContent>
            </Card>
          </Section>

          <Section title="Progress">
            <Card>
              <CardContent className="space-y-4 pt-6 max-w-md">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Claims processed</span>
                    <span className="text-muted-foreground">{progressValue}%</span>
                  </div>
                  <Progress value={progressValue} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Empty</span>
                    <span className="text-muted-foreground">0%</span>
                  </div>
                  <Progress value={0} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Complete</span>
                    <span className="text-muted-foreground">100%</span>
                  </div>
                  <Progress value={100} />
                </div>
              </CardContent>
            </Card>
          </Section>

          <Section title="Skeleton (Loading States)">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-3 w-[150px]" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </CardContent>
            </Card>
          </Section>

          <Section title="Separator">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm">Content above</p>
                <Separator className="my-4" />
                <p className="text-sm">Content below</p>
                <div className="mt-4 flex h-8 items-center gap-4">
                  <span className="text-sm">Item 1</span>
                  <Separator orientation="vertical" />
                  <span className="text-sm">Item 2</span>
                  <Separator orientation="vertical" />
                  <span className="text-sm">Item 3</span>
                </div>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Feedback ── */}
        <TabsContent value="feedback" className="space-y-8 mt-6">
          <Section title="Alert Patterns">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-papaya/15 bg-papaya-lightest p-4">
                <Heart className="h-5 w-5 text-papaya mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Brand Info</p>
                  <p className="text-sm text-muted-foreground">This is a brand-colored informational alert using papaya tokens.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Information</p>
                  <p className="text-sm text-muted-foreground">A neutral informational message for the user.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Warning</p>
                  <p className="text-sm text-muted-foreground">Something needs attention but is not critical.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <X className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Error</p>
                  <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <Check className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Success</p>
                  <p className="text-sm text-muted-foreground">Operation completed successfully.</p>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Empty State">
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  title="No claims found"
                  description="There are no claims matching your search criteria. Try adjusting your filters."
                  action={<Button>Create New Claim</Button>}
                />
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Overlays ── */}
        <TabsContent value="overlays" className="space-y-8 mt-6">
          <Section title="Dialog">
            <Card>
              <CardContent className="pt-6">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>Open Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Claim</DialogTitle>
                      <DialogDescription>
                        Make changes to the claim details below. Click save when done.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Claim ID</label>
                        <Input defaultValue="CLM-001" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Notes</label>
                        <Textarea placeholder="Add notes..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                      <Button onClick={() => setDialogOpen(false)}>Save Changes</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </Section>

          <Section title="Alert Dialog">
            <Card>
              <CardContent className="pt-6">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Delete Claim</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete claim CLM-001. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </Section>

          <Section title="Dropdown Menu">
            <Card>
              <CardContent className="pt-6">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline"><MoreHorizontal className="h-4 w-4" /> Actions</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Claim Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
                    <DropdownMenuItem><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>
                    <DropdownMenuItem><Download className="h-4 w-4" /> Export PDF</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive"><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          </Section>

          <Section title="Popover">
            <Card>
              <CardContent className="pt-6">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline"><Bell className="h-4 w-4" /> Notifications</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Notifications</h4>
                      <div className="space-y-2">
                        <div className="flex gap-3 rounded-md p-2 hover:bg-accent">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-papaya-lightest text-papaya">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm">New claim submitted</p>
                            <p className="text-xs text-muted-foreground">2 minutes ago</p>
                          </div>
                        </div>
                        <div className="flex gap-3 rounded-md p-2 hover:bg-accent">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                            <Check className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm">CLM-042 approved</p>
                            <p className="text-xs text-muted-foreground">1 hour ago</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </CardContent>
            </Card>
          </Section>

          <Section title="Tooltip">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 pt-6">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon"><Heart className="h-4 w-4" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add to favorites</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Settings</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon"><Bell className="h-4 w-4" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Notifications</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Navigation ── */}
        <TabsContent value="navigation" className="space-y-8 mt-6">
          <Section title="Breadcrumb">
            <Card>
              <CardContent className="pt-6">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/">Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/claims">Claims</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>CLM-001</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </CardContent>
            </Card>
          </Section>

          <Section title="Tabs">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="mt-4">
                    <p className="text-sm text-muted-foreground">Overview content goes here.</p>
                  </TabsContent>
                  <TabsContent value="documents" className="mt-4">
                    <p className="text-sm text-muted-foreground">Documents content goes here.</p>
                  </TabsContent>
                  <TabsContent value="history" className="mt-4">
                    <p className="text-sm text-muted-foreground">History content goes here.</p>
                  </TabsContent>
                  <TabsContent value="settings" className="mt-4">
                    <p className="text-sm text-muted-foreground">Settings content goes here.</p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </Section>

          <Section title="Links & Actions">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <a href="#" className="inline-flex items-center gap-1 text-sm font-medium text-papaya hover:underline">
                  View claim details <ArrowUpRight className="h-3 w-3" />
                </a>
                <br />
                <a href="#" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  Learn more <ChevronRight className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        {/* ── Composites ── */}
        <TabsContent value="composites" className="space-y-8 mt-6">
          <Section title="PageHeader">
            <Card>
              <CardContent className="pt-6">
                <PageHeader
                  title="Claims Management"
                  subtitle="Review and process insurance claims"
                  action={<Button><Plus className="h-4 w-4" /> New Claim</Button>}
                />
              </CardContent>
            </Card>
          </Section>

          <Section title="StatCard">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Total Revenue" value="฿2.4M" icon={<Activity className="h-5 w-5" />} trend={{ value: 15.3, label: "from last month" }} />
              <StatCard label="Active Users" value="892" icon={<User className="h-5 w-5" />} trend={{ value: 4.1, label: "from last week" }} />
              <StatCard label="Open Claims" value="156" icon={<FileText className="h-5 w-5" />} trend={{ value: -2.8, label: "from last month" }} />
            </div>
          </Section>

          <Section title="EmptyState">
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  title="No policies found"
                  description="Get started by creating your first insurance policy."
                  action={<Button><Plus className="h-4 w-4" /> Create Policy</Button>}
                />
              </CardContent>
            </Card>
          </Section>

          <Section title="Brand Panel (Login-style)">
            <div className="rounded-xl overflow-hidden h-64 relative bg-gradient-to-br from-papaya-dark via-papaya-darker to-papaya-darkest">
              <div className="absolute top-[20%] -left-10 w-[200px] h-[200px] rounded-full bg-papaya/10 blur-[80px]" />
              <div className="absolute bottom-[25%] -right-5 w-[150px] h-[150px] rounded-full bg-papaya-light/15 blur-[60px]" />
              <div className="relative z-10 p-8 flex flex-col justify-between h-full">
                <div>
                  <h2 className="text-2xl font-bold text-white">Oasis</h2>
                  <p className="text-xs font-light tracking-[0.2em] uppercase text-white/30 mt-1">by Papaya</p>
                </div>
                <div>
                  <p className="text-base text-white/55">Where insurance operations<br />find clarity.</p>
                  <div className="mt-4 h-px w-12 bg-gradient-to-r from-papaya/50 to-transparent" />
                </div>
              </div>
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
