import { useTranslation } from 'react-i18next';
import { Paintbrush, Sun, Moon, Monitor, Check, RotateCcw } from 'lucide-react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@papaya/shared-ui';
import {
  colorThemes,
  radiusOptions,
  DEFAULT_COLOR_THEME,
  DEFAULT_RADIUS,
} from '@papaya/shared-ui/lib/themes';
import { useTheme, type Theme } from '@/providers/ThemeProvider';

const modeOptions: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
];

export default function ThemeCustomizer() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme, colorTheme, setColorTheme, radius, setRadius } =
    useTheme();

  function handleReset() {
    setTheme('system');
    setColorTheme(DEFAULT_COLOR_THEME);
    setRadius(DEFAULT_RADIUS);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded-md h-8 w-8 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t('theme.customize')}
        >
          <Paintbrush className="h-4 w-4" />
        </button>
      </SheetTrigger>

      <SheetContent className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('theme.customize')}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4 flex flex-col gap-5">
          {/* ── Color theme ── */}
          <section>
            <h4 className="mb-2 text-[13px] font-medium">{t('theme.color')}</h4>
            <div className="grid grid-cols-2 gap-2">
              {colorThemes.map((ct) => {
                const isActive = colorTheme === ct.name;
                const swatch =
                  resolvedTheme === 'dark' ? ct.activeColor.dark : ct.activeColor.light;

                return (
                  <button
                    key={ct.name}
                    onClick={() => setColorTheme(ct.name)}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: swatch }}
                    >
                      {isActive && (
                        <Check className="h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
                      )}
                    </span>
                    {t(ct.labelKey)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Border radius ── */}
          <section>
            <h4 className="mb-2 text-[13px] font-medium">{t('theme.radius')}</h4>
            <div className="grid grid-cols-5 gap-1.5">
              {radiusOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs transition-colors ${
                    radius === r
                      ? 'border-primary bg-primary/5 font-medium text-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <span
                    className={`h-4 w-4 border-2 ${radius === r ? 'border-primary' : 'border-muted-foreground/40'}`}
                    style={{ borderRadius: `${r * 6}px` }}
                  />
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Mode (light / dark / system) ── */}
          <section>
            <h4 className="mb-2 text-[13px] font-medium">{t('theme.mode')}</h4>
            <div className="grid grid-cols-3 gap-1.5">
              {modeOptions.map((option) => {
                const isActive = theme === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 text-xs transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/5 font-medium text-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <option.icon className="h-4 w-4" />
                    <span>{t(option.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Reset ── */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            {t('theme.reset')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
