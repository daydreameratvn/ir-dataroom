import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
}

export default function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border bg-card p-6 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="mt-2">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {trend && (
          <p className={cn(
            'mt-1 text-xs font-medium',
            trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
          )}>
            {trend.value >= 0 ? '\u2191' : '\u2193'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
    </div>
  );
}
