import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LogOut, UserIcon, Settings, Paintbrush, Sun, Moon, Monitor, Check, RotateCcw } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@papaya/shared-ui';
import {
  colorThemes,
  radiusOptions,
  DEFAULT_COLOR_THEME,
  DEFAULT_RADIUS,
} from '@papaya/shared-ui/lib/themes';
import { useAuth } from '@papaya/auth';
import { useTheme, type Theme } from '@/providers/ThemeProvider';

const modeOptions: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
];

export default function UserMenu() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { theme, setTheme, resolvedTheme, colorTheme, setColorTheme, radius, setRadius } =
    useTheme();
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function handleReset() {
    setTheme('system');
    setColorTheme(DEFAULT_COLOR_THEME);
    setRadius(DEFAULT_RADIUS);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-accent">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
              {user.title && (
                <span className="mt-0.5 text-xs text-muted-foreground">{user.title}</span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <UserIcon className="mr-2 h-4 w-4" />
              {t('auth.profile')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <Settings className="mr-2 h-4 w-4" />
              {t('auth.settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setThemeSheetOpen(true)}>
            <Paintbrush className="mr-2 h-4 w-4" />
            {t('theme.customize')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOut} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {t('auth.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={themeSheetOpen} onOpenChange={setThemeSheetOpen}>
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
    </>
  );
}
