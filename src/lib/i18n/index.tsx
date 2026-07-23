/* eslint-disable react-refresh/only-export-components */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import { resources } from './resources';
import { getLanguage } from './utils';

export * from './utils';

i18n.use(initReactI18next).init({
  resources,
  // First-time launch: default to Chinese.
  // After the user picks a language in Settings, getLanguage() returns it from MMKV.
  lng: getLanguage() || 'zh',
  fallbackLng: 'en',
  supportedLngs: ['en', 'ar', 'zh'],
  compatibilityJSON: 'v4', // Updated to v4 for i18next compatibility

  // allows integrating dynamic values into translations.
  interpolation: {
    escapeValue: false, // escape passed in values to avoid XSS injections
  },
});

// Is it a RTL language?
export const isRTL: boolean = i18n.dir() === 'rtl';

I18nManager.allowRTL(isRTL);
I18nManager.forceRTL(isRTL);

export default i18n;
