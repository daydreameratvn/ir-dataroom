import '@testing-library/jest-dom/vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../../libs/i18n/src/locales/en';

// Initialize i18n using the shell's own i18next + react-i18next instances.
// The @papaya/i18n lib uses i18next@24/react-i18next@15, while the shell uses
// i18next@25/react-i18next@16. Directly initializing here ensures the correct
// singleton is used by useTranslation() in shell components.
if (!i18n.isInitialized) {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

// jsdom doesn't have ResizeObserver — cmdk needs it
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement scrollIntoView — cmdk calls it on items
Element.prototype.scrollIntoView = function () {};
