import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@papaya/shared-ui';
import { useTheme, type Theme } from '@/providers/ThemeProvider';

const themeOptions: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
];

export default function ThemeChooser() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-center rounded-md h-8 w-8 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
          <CurrentIcon className="h-4 w-4" />
          <span className="sr-only">{t('theme.switchTheme')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1">
        {themeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent ${
              theme === option.value ? 'bg-accent font-medium' : ''
            }`}
          >
            <option.icon className="h-4 w-4" />
            {t(option.labelKey)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
