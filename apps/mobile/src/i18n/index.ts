import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

const resources = {
  en: { translation: en },
} as const;

export type SupportedLocale = keyof typeof resources;

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v4',
    });
}

export async function setAppLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}

export default i18n;
