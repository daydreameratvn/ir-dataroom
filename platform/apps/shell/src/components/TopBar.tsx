import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Separator } from '@papaya/shared-ui';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeChooser from './ThemeChooser';
import UserMenu from './UserMenu';

export interface TopBarProps {
  onOpenCommandPalette?: () => void;
}

export default function TopBar({ onOpenCommandPalette }: TopBarProps) {
  const { t } = useTranslation();
  const location = useLocation();

  // Build breadcrumb from path
  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbItems = segments.map((segment) => {
    // Try to get a nav translation, fallback to capitalized segment
    const navKey = `nav.${segment}`;
    const translated = t(navKey);
    return translated !== navKey ? translated : segment.charAt(0).toUpperCase() + segment.slice(1);
  });

  function handleSearchClick() {
    // Trigger ⌘K programmatically
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      })
    );
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{breadcrumbItems.length === 0 ? t('nav.dashboard') : breadcrumbItems.join(' / ')}</span>
      </div>

      {/* Right: Search + Language + User */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSearchClick}
          className="relative hidden items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-muted-foreground/70">{t('common.search')}...</span>
          <kbd className="pointer-events-none ml-4 inline-flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ThemeChooser />
        <LanguageSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
