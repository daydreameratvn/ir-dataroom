import { useTranslation } from 'react-i18next';
import { Paintbrush, Sun, Moon, Monitor, Check, RotateCcw } from 'lucide-react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

      <SheetContent className="w-72 overflow-y-auto">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-base">{t('theme.customize')}</SheetTitle>
          <SheetDescription className="text-xs">
            {t('theme.customizeDesc')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-5">
          {/* ── Color theme ── */}
          <section>
            <h4 className="mb-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('theme.color')}
            </h4>
            <TooltipProvider delayDuration={300}>
            <div className="flex flex-wrap gap-2">
              {colorThemes.map((ct) => {
                const isActive = colorTheme === ct.name;
                const swatch =
                  resolvedTheme === 'dark' ? ct.activeColor.dark : ct.activeColor.light;

                return (
                  <Tooltip key={ct.name}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setColorTheme(ct.name)}
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                          isActive
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                            : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: swatch }}
                      >
                        {isActive && <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {t(ct.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            </TooltipProvider>
          </section>

          {/* ── Border radius ── */}
          <section>
            <h4 className="mb-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('theme.radius')}
            </h4>
            <div className="flex gap-1.5">
              {radiusOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-md border py-1.5 text-[11px] transition-colors ${
                    radius === r
                      ? 'border-primary bg-primary/5 font-medium text-primary'
                      : 'border-border hover:border-foreground/20'
                  }`}
                >
                  <span
                    className={`h-4 w-4 border-2 ${radius === r ? 'border-primary' : 'border-foreground/30'}`}
                    style={{ borderRadius: `${r * 6}px` }}
                  />
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Mode (light / dark / system) ── */}
          <section>
            <h4 className="mb-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('theme.mode')}
            </h4>
            <div className="flex gap-1.5">
              {modeOptions.map((option) => {
                const isActive = theme === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-md border py-2 text-xs transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/5 font-medium text-primary'
                        : 'border-border hover:border-foreground/20'
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
