import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import th from './locales/th';
import zh from './locales/zh';
import vi from './locales/vi';

export const supportedLanguages = ['en', 'th', 'zh', 'vi'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
  th: 'ไทย',
  zh: '中文',
  vi: 'Tiếng Việt',
};

export function initI18n() {
  return i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        th: { translation: th },
        zh: { translation: zh },
        vi: { translation: vi },
      },
      fallbackLng: 'en',
      supportedLngs: [...supportedLanguages],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
      },
    });
}
