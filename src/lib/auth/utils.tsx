import { getItem, removeItem, setItem } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export type TokenType = {
  access: string;
  refresh: string;
};

export const getToken = () => getItem<TokenType>(STORAGE_KEYS.AUTH_TOKEN);
export const removeToken = () => removeItem(STORAGE_KEYS.AUTH_TOKEN);
export const setToken = (value: TokenType) => setItem<TokenType>(STORAGE_KEYS.AUTH_TOKEN, value);
