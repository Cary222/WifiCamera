import { useMMKVBoolean } from 'react-native-mmkv';

import { storage } from '../storage';
import { STORAGE_KEYS } from '../storage-keys';

export function useIsFirstTime() {
  const [isFirstTime, setIsFirstTime] = useMMKVBoolean(STORAGE_KEYS.IS_FIRST_TIME, storage);
  if (isFirstTime === undefined) {
    return [true, setIsFirstTime] as const;
  }
  return [isFirstTime, setIsFirstTime] as const;
}
