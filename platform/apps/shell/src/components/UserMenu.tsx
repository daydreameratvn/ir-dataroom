import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  LogOut,
  UserIcon,
  Settings,
  Paintbrush,
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  const [themeExpanded, setThemeExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
    <DropdownMenu onOpenChange={(open) => { if (!open) setThemeExpanded(false); }}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-accent">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 transition-[height] duration-200">
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

        {/* Theme toggle row */}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setThemeExpanded((v) => !v);
          }}
        >
          <Paintbrush className="mr-2 h-4 w-4" />
          {t('theme.customize')}
          <ChevronDown
            className={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${themeExpanded ? 'rotate-180' : ''}`}
          />
        </DropdownMenuItem>

        {/* Collapsible theme panel */}
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: themeExpanded ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden" ref={contentRef}>
            <div className="flex flex-col gap-3 px-2 py-2">
              {/* ── Color theme ── */}
              <section>
                <h4 className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {t('theme.color')}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {colorThemes.map((ct) => {
                    const isActive = colorTheme === ct.name;
                    const swatch =
                      resolvedTheme === 'dark' ? ct.activeColor.dark : ct.activeColor.light;

                    return (
                      <button
                        key={ct.name}
                        onClick={() => setColorTheme(ct.name)}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[12px] transition-colors ${
                          isActive
                            ? 'border-primary bg-primary/5 font-medium'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: swatch }}
                        >
                          {isActive && (
                            <Check className="h-2.5 w-2.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
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
                <h4 className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {t('theme.radius')}
                </h4>
                <div className="grid grid-cols-5 gap-1">
                  {radiusOptions.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRadius(r)}
                      className={`flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[11px] transition-colors ${
                        radius === r
                          ? 'border-primary bg-primary/5 font-medium text-primary'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      <span
                        className={`h-3 w-3 border-2 ${radius === r ? 'border-primary' : 'border-muted-foreground/40'}`}
                        style={{ borderRadius: `${r * 6}px` }}
                      />
                      <span>{r}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Mode ── */}
              <section>
                <h4 className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {t('theme.mode')}
                </h4>
                <div className="grid grid-cols-3 gap-1">
                  {modeOptions.map((option) => {
                    const isActive = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className={`flex flex-col items-center gap-0.5 rounded-md border py-2 text-[11px] transition-colors ${
                          isActive
                            ? 'border-primary bg-primary/5 font-medium text-primary'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <option.icon className="h-3.5 w-3.5" />
                        <span>{t(option.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── Reset ── */}
              <button
                onClick={handleReset}
                className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                {t('theme.reset')}
              </button>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t('auth.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
