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

  const activeColorTheme = colorThemes.find((ct) => ct.name === colorTheme);

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
        <SheetHeader className="pb-0">
          <SheetTitle className="text-base">{t('theme.customize')}</SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            {t('theme.customizeDesc')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-5">
          {/* ── Color theme ── */}
          <section>
            <h4 className="mb-3 text-xs font-medium text-muted-foreground">
              {t('theme.color')}
            </h4>
            <div className="flex items-center justify-between px-1">
              {colorThemes.map((ct) => {
                const isActive = colorTheme === ct.name;
                const swatch =
                  resolvedTheme === 'dark' ? ct.activeColor.dark : ct.activeColor.light;

                return (
                  <button
                    key={ct.name}
                    onClick={() => setColorTheme(ct.name)}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-transform group-hover:scale-110 ${
                        isActive ? 'ring-2 ring-offset-2 ring-offset-background' : ''
                      }`}
                      style={{
                        backgroundColor: swatch,
                        ...(isActive ? { ['--tw-ring-color' as string]: swatch } : {}),
                      }}
                    >
                      {isActive && (
                        <Check className="h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {activeColorTheme && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t(activeColorTheme.labelKey)}
              </p>
            )}
          </section>

          {/* ── Border radius ── */}
          <section>
            <h4 className="mb-3 text-xs font-medium text-muted-foreground">
              {t('theme.radius')}
            </h4>
            <div className="grid grid-cols-5 gap-1.5">
              {radiusOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] transition-colors ${
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
            <h4 className="mb-3 text-xs font-medium text-muted-foreground">
              {t('theme.mode')}
            </h4>
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
