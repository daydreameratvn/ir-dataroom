import { Link } from 'react-router-dom';
import { BookOpen, Flame, Package, ArrowRight } from 'lucide-react';
import { Badge, Card, CardHeader, CardTitle, CardDescription } from '@papaya/shared-ui';
import docs from './content';

const iconMap: Record<string, React.ReactNode> = {
  Flame: <Flame className="h-5 w-5" />,
};

export default function DocsIndex() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
            <p className="text-sm text-muted-foreground">SDK guides, API references, and integration docs</p>
          </div>
        </div>
      </div>

      {/* SDK Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">SDKs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {docs.map((doc) => (
            <Link key={doc.slug} to={doc.slug} className="group">
              <Card className="h-full transition-all hover:border-primary/30 hover:shadow-md">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {iconMap[doc.icon] ?? <Package className="h-5 w-5" />}
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      v{doc.version}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {doc.title}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {doc.description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {doc.packages.map((pkg) => (
                      <Badge key={pkg} variant="secondary" className="font-mono text-[11px]">
                        {pkg}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
