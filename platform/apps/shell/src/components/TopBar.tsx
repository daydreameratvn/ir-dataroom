import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input, Separator } from '@papaya/shared-ui';
import LanguageSwitcher from './LanguageSwitcher';
import UserMenu from './UserMenu';

export default function TopBar() {
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

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{breadcrumbItems.length === 0 ? t('nav.dashboard') : breadcrumbItems.join(' / ')}</span>
      </div>

      {/* Right: Search + Language + User */}
      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`${t('common.search')}...`}
            className="h-8 w-48 pl-8 text-sm lg:w-64"
          />
        </div>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <LanguageSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
