import type { TokenType } from '@/lib/auth/utils';

import { create } from 'zustand';
import { getToken, setToken } from '@/lib/auth/utils';
import { createSelectors } from '@/lib/utils';

type AuthState = {
  token: TokenType | null;
  status: 'idle' | 'signIn';
  signIn: (data: TokenType) => void;
  hydrate: () => void;
};

const _useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  token: null,
  signIn: (token) => {
    setToken(token);
    set({ status: 'signIn', token });
  },
  hydrate: () => {
    try {
      const userToken = getToken();
      if (userToken !== null) {
        get().signIn(userToken);
      }
      else {
        // 无需登录，默认设为已登录状态
        set({ status: 'signIn', token: { access: 'auto-signin', refresh: 'auto-signin' } });
      }
    }
    catch (e) {
      console.error(e);
      // 即使出错也设为已登录
      set({ status: 'signIn', token: { access: 'auto-signin', refresh: 'auto-signin' } });
    }
  },
}));

export const useAuthStore = createSelectors(_useAuthStore);

export const signIn = (token: TokenType) => _useAuthStore.getState().signIn(token);
export const hydrateAuth = () => _useAuthStore.getState().hydrate();
