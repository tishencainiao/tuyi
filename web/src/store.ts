import { create } from 'zustand';
import { api, User } from './api';

interface AppState {
  user: User | null;
  booted: boolean;
  fetchUser: () => Promise<User | null>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  booted: false,
  fetchUser: async () => {
    if (get().booted) return get().user;
    try {
      const data = await api.me();
      set({ user: data.user, booted: true });
      return data.user;
    } catch {
      set({ user: null, booted: true });
      return null;
    }
  },
  setUser: (user) => set({ user, booted: true }),
  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* 忽略网络错误，本地照常清空 */
    }
    set({ user: null });
  },
}));
