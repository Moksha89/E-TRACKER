import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import hi from './locales/hi.json';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
} as const;

export type SupportedLocale = keyof typeof resources;

const fallback: SupportedLocale = 'en';

function detectInitialLocale(): SupportedLocale {
  const code = Localization.getLocales()[0]?.languageCode ?? fallback;
  if (code === 'hi') return 'hi';
  return 'en';
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: detectInitialLocale(),
      fallbackLng: fallback,
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v4',
    });
}

export async function setAppLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}

export default i18n;
