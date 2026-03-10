import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@papaya/shared-ui';
import type { ChartSpec } from '../types';

const PALETTE = ['#ED1B55', '#637381', '#FAC8D6', '#292D32', '#3B82F6', '#10B981'];

interface ChartBlockProps {
  content: string;
}

export default function ChartBlock({ content }: ChartBlockProps) {
  const spec = useMemo(() => {
    try {
      return JSON.parse(content) as ChartSpec;
    } catch {
      return null;
    }
  }, [content]);

  if (!spec) {
    return (
      <Card className="my-4">
        <CardContent className="p-4">
          <Skeleton className="h-[200px] w-full rounded-lg" />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Loading chart...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="my-4">
      {spec.title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{spec.title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="pb-4">
        <ResponsiveContainer width="100%" height={300}>
          {renderChart(spec)}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function getColor(index: number, series?: { color?: string }): string {
  return series?.color ?? PALETTE[index % PALETTE.length]!;
}

function renderChart(spec: ChartSpec): React.ReactElement {
  const { type, data, xKey, series } = spec;

  switch (type) {
    case 'bar':
      return (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey={xKey}
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '12px',
            }}
          />
          {series.length > 1 && <Legend />}
          {series.map((s, i) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name ?? s.dataKey}
              fill={getColor(i, s)}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      );

    case 'line':
      return (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey={xKey}
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '12px',
            }}
          />
          {series.length > 1 && <Legend />}
          {series.map((s, i) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name ?? s.dataKey}
              stroke={getColor(i, s)}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      );

    case 'area':
      return (
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey={xKey}
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '12px',
            }}
          />
          {series.length > 1 && <Legend />}
          {series.map((s, i) => (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name ?? s.dataKey}
              stroke={getColor(i, s)}
              fill={getColor(i, s)}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      );

    case 'pie':
      return (
        <PieChart>
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              fontSize: '12px',
            }}
          />
          <Legend />
          <Pie
            data={data}
            dataKey={series[0]?.dataKey ?? 'value'}
            nameKey={xKey ?? 'name'}
            cx="50%"
            cy="50%"
            outerRadius={100}
            label
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      );

    default:
      return (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          {series.map((s, i) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} fill={getColor(i, s)} />
          ))}
        </BarChart>
      );
  }
}
