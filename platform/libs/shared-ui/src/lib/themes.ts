/**
 * Oasis color theme presets following shadcn/ui conventions.
 *
 * Each theme defines CSS custom property overrides for both light and dark modes.
 * The "papaya" theme matches the defaults in globals.css — selecting it means
 * no overrides are injected (the CSS cascade handles it).
 */

export interface ColorTheme {
  /** Unique identifier stored in localStorage */
  name: string;
  /** i18n label key */
  labelKey: string;
  /** Swatch preview color per mode */
  activeColor: { light: string; dark: string };
  /** CSS variable overrides — keys WITHOUT the `--color-` prefix */
  cssVars: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

// ── Theme presets ───────────────────────────────────────────────────────────

export const colorThemes: ColorTheme[] = [
  {
    name: 'papaya',
    labelKey: 'theme.colors.papaya',
    activeColor: { light: '#ED1B55', dark: '#ED1B55' },
    cssVars: { light: {}, dark: {} }, // default — no overrides needed
  },
  {
    name: 'blue',
    labelKey: 'theme.colors.blue',
    activeColor: { light: '#2563EB', dark: '#3B82F6' },
    cssVars: {
      light: {
        primary: '#2563EB',
        'primary-foreground': '#FFFFFF',
        ring: '#2563EB',
      },
      dark: {
        primary: '#3B82F6',
        'primary-foreground': '#FFFFFF',
        ring: '#3B82F6',
      },
    },
  },
  {
    name: 'green',
    labelKey: 'theme.colors.green',
    activeColor: { light: '#16A34A', dark: '#22C55E' },
    cssVars: {
      light: {
        primary: '#16A34A',
        'primary-foreground': '#FFFFFF',
        ring: '#16A34A',
      },
      dark: {
        primary: '#22C55E',
        'primary-foreground': '#052E16',
        ring: '#22C55E',
      },
    },
  },
  {
    name: 'orange',
    labelKey: 'theme.colors.orange',
    activeColor: { light: '#EA580C', dark: '#F97316' },
    cssVars: {
      light: {
        primary: '#EA580C',
        'primary-foreground': '#FFFFFF',
        ring: '#EA580C',
      },
      dark: {
        primary: '#F97316',
        'primary-foreground': '#431407',
        ring: '#F97316',
      },
    },
  },
  {
    name: 'violet',
    labelKey: 'theme.colors.violet',
    activeColor: { light: '#7C3AED', dark: '#8B5CF6' },
    cssVars: {
      light: {
        primary: '#7C3AED',
        'primary-foreground': '#FFFFFF',
        ring: '#7C3AED',
      },
      dark: {
        primary: '#8B5CF6',
        'primary-foreground': '#FFFFFF',
        ring: '#8B5CF6',
      },
    },
  },
  {
    name: 'rose',
    labelKey: 'theme.colors.rose',
    activeColor: { light: '#E11D48', dark: '#FB7185' },
    cssVars: {
      light: {
        primary: '#E11D48',
        'primary-foreground': '#FFFFFF',
        ring: '#E11D48',
      },
      dark: {
        primary: '#FB7185',
        'primary-foreground': '#1C0A10',
        ring: '#FB7185',
      },
    },
  },
  {
    name: 'zinc',
    labelKey: 'theme.colors.zinc',
    activeColor: { light: '#18181B', dark: '#FAFAFA' },
    cssVars: {
      light: {
        primary: 'hsl(240 5.9% 10%)',
        'primary-foreground': 'hsl(0 0% 98%)',
        ring: 'hsl(240 5.9% 10%)',
      },
      dark: {
        primary: 'hsl(0 0% 98%)',
        'primary-foreground': 'hsl(240 5.9% 10%)',
        ring: 'hsl(240 3.7% 15.9%)',
      },
    },
  },
];

// ── Radius presets ──────────────────────────────────────────────────────────

export const radiusOptions = [0, 0.25, 0.5, 0.75, 1.0] as const;

export const DEFAULT_COLOR_THEME = 'papaya';
export const DEFAULT_RADIUS = 0.5; // matches current --radius: 0.5rem

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getColorTheme(name: string): ColorTheme | undefined {
  return colorThemes.find((t) => t.name === name);
}

/**
 * Generates a CSS string that sets custom properties on :root and .dark.
 * Returns empty string for the default theme (papaya) since globals.css
 * already has the correct values.
 */
export function buildThemeCss(theme: ColorTheme, radius?: number): string {
  const lines: string[] = [];

  const lightVars = Object.entries(theme.cssVars.light);
  const darkVars = Object.entries(theme.cssVars.dark);
  const hasRadius = radius !== undefined && radius !== DEFAULT_RADIUS;

  if (lightVars.length === 0 && darkVars.length === 0 && !hasRadius) {
    return '';
  }

  // Light mode overrides on :root
  if (lightVars.length > 0 || hasRadius) {
    lines.push(':root {');
    for (const [key, value] of lightVars) {
      lines.push(`  --color-${key}: ${value};`);
    }
    if (hasRadius) {
      lines.push(`  --radius: ${radius}rem;`);
    }
    lines.push('}');
  }

  // Dark mode overrides
  if (darkVars.length > 0) {
    lines.push('.dark {');
    for (const [key, value] of darkVars) {
      lines.push(`  --color-${key}: ${value};`);
    }
    lines.push('}');
  }

  return lines.join('\n');
}
