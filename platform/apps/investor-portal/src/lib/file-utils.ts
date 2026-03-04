import type { LucideIcon } from 'lucide-react';
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from 'lucide-react';

// ── File type info ──

export interface FileTypeInfo {
  Icon: LucideIcon;
  bgClass: string;
  iconColorClass: string;
  label: string;
}

export function getFileTypeInfo(mimeType: string | null): FileTypeInfo {
  const mt = mimeType ?? '';

  if (mt === 'application/pdf') {
    return { Icon: FileText, bgClass: 'bg-red-50', iconColorClass: 'text-red-600', label: 'PDF' };
  }
  if (mt.includes('spreadsheet') || mt.includes('excel') || mt === 'text/csv') {
    return { Icon: FileSpreadsheet, bgClass: 'bg-emerald-50', iconColorClass: 'text-emerald-600', label: 'Excel' };
  }
  if (mt.includes('presentation') || mt.includes('powerpoint')) {
    return { Icon: Presentation, bgClass: 'bg-orange-50', iconColorClass: 'text-orange-600', label: 'PPT' };
  }
  if (mt.startsWith('video/')) {
    return { Icon: FileVideo, bgClass: 'bg-purple-50', iconColorClass: 'text-purple-600', label: 'Video' };
  }
  if (mt.startsWith('image/')) {
    return { Icon: FileImage, bgClass: 'bg-sky-50', iconColorClass: 'text-sky-600', label: 'Image' };
  }
  if (mt.includes('word') || mt.includes('document')) {
    return { Icon: FileText, bgClass: 'bg-blue-50', iconColorClass: 'text-blue-600', label: 'Word' };
  }
  return { Icon: File, bgClass: 'bg-gray-100', iconColorClass: 'text-gray-500', label: 'File' };
}

// ── Category styling ──

export interface CategoryStyle {
  bgClass: string;
  textClass: string;
  dotColor: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  financials: { bgClass: 'bg-emerald-50', textClass: 'text-emerald-700', dotColor: 'bg-emerald-500' },
  strategy:   { bgClass: 'bg-blue-50',    textClass: 'text-blue-700',    dotColor: 'bg-blue-500' },
  product:    { bgClass: 'bg-violet-50',   textClass: 'text-violet-700',  dotColor: 'bg-violet-500' },
  legal:      { bgClass: 'bg-amber-50',    textClass: 'text-amber-700',   dotColor: 'bg-amber-500' },
  team:       { bgClass: 'bg-teal-50',     textClass: 'text-teal-700',    dotColor: 'bg-teal-500' },
};

const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  bgClass: 'bg-gray-100',
  textClass: 'text-gray-600',
  dotColor: 'bg-gray-400',
};

export function getCategoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category.toLowerCase()] ?? DEFAULT_CATEGORY_STYLE;
}

// ── Formatters ──

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRelativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Status styling ──

export function getStatusStyle(status: string): { bgClass: string; textClass: string } {
  switch (status.toLowerCase()) {
    case 'active':
    case 'open':
      return { bgClass: 'bg-emerald-50', textClass: 'text-emerald-700' };
    case 'draft':
      return { bgClass: 'bg-amber-50', textClass: 'text-amber-700' };
    case 'closed':
    case 'archived':
      return { bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
    default:
      return { bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
  }
}
