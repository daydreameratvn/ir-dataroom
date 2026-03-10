export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'pie';
  title?: string;
  data: Record<string, string | number>[];
  xKey?: string;
  series: { dataKey: string; name?: string; color?: string }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}
