import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@papaya/shared-ui';
import { supportedLanguages, languageNames } from '@papaya/i18n';
import type { SupportedLanguage } from '@papaya/i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en') as SupportedLanguage;

  function handleLanguageChange(lang: SupportedLanguage) {
    i18n.changeLanguage(lang);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-medium">{languageNames[currentLang] ?? 'EN'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        {supportedLanguages.map((lang) => (
          <button
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            className={`flex w-full items-center rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent ${
              currentLang === lang ? 'bg-accent font-medium' : ''
            }`}
          >
            {languageNames[lang]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
