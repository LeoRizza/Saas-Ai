import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Usuario, Empresa } from '../types';

interface AuthState {
  user: Usuario | null;
  empresa: Empresa | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: Usuario, empresa: Empresa | null, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      empresa: null,
      token: null,
      isAuthenticated: false,
      
      login: (user, empresa, token) => set({ user, empresa, token, isAuthenticated: true }),
      logout: () => set({ user: null, empresa: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage', // Nombre clave en el localStorage
    }
  )
);