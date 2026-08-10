import * as React from 'react';
import { useMMKVString } from 'react-native-mmkv';
import { Uniwind, useUniwind } from 'uniwind';

import { storage } from '../storage';
import { STORAGE_KEYS } from '../storage-keys';

export type ColorSchemeType = 'light' | 'dark' | 'system';

const DEFAULT_THEME: ColorSchemeType = 'dark';

function readPersistedTheme(): ColorSchemeType {
  const raw = storage.getString(STORAGE_KEYS.SELECTED_THEME);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return DEFAULT_THEME;
}

/**
 * this hooks should only be used while selecting the theme
 * This hooks will return the selected theme which is stored in MMKV
 * selectedTheme should be one of the following values 'light', 'dark' or 'system'
 * don't use this hooks if you want to use it to style your component based on the theme use useUniwind from uniwind instead
 *
 */
export function useSelectedTheme() {
  const { theme: _theme } = useUniwind();
  const [theme, _setTheme] = useMMKVString(STORAGE_KEYS.SELECTED_THEME, storage);

  const setSelectedTheme = React.useCallback(
    (t: ColorSchemeType) => {
      Uniwind.setTheme(t);
      _setTheme(t);
    },
    [_setTheme],
  );

  const selectedTheme = ((theme as ColorSchemeType | undefined) ?? DEFAULT_THEME);
  return { selectedTheme, setSelectedTheme } as const;
}
// to be used in the root file to load the selected theme from MMKV
export function loadSelectedTheme() {
  // Restore the user's previously selected theme so it survives app restarts.
  const persisted = readPersistedTheme();
  Uniwind.setTheme(persisted);
}
