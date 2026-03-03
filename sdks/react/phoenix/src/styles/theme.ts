export interface PhoenixTheme {
  colors: {
    primary: string;
    primaryHover: string;
    success: string;
    warning: string;
    error: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    background: string;
    surface: string;
    border: string;
  };
  fontFamily: string;
  borderRadius: string;
}

export const defaultTheme: PhoenixTheme = {
  colors: {
    primary: '#E30613',
    primaryHover: '#B8050F',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    background: '#f9fafb',
    surface: '#ffffff',
    border: '#e5e7eb',
  },
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  borderRadius: '12px',
};

export function themeToCSS(theme: PhoenixTheme): Record<string, string> {
  return {
    '--phoenix-color-primary': theme.colors.primary,
    '--phoenix-color-primary-hover': theme.colors.primaryHover,
    '--phoenix-color-success': theme.colors.success,
    '--phoenix-color-warning': theme.colors.warning,
    '--phoenix-color-error': theme.colors.error,
    '--phoenix-color-text-primary': theme.colors.textPrimary,
    '--phoenix-color-text-secondary': theme.colors.textSecondary,
    '--phoenix-color-text-muted': theme.colors.textMuted,
    '--phoenix-color-background': theme.colors.background,
    '--phoenix-color-surface': theme.colors.surface,
    '--phoenix-color-border': theme.colors.border,
    '--phoenix-font-family': theme.fontFamily,
    '--phoenix-border-radius': theme.borderRadius,
  };
}
