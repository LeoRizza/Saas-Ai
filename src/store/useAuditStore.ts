import { create } from 'zustand';
import { api } from '../config/axios';
import { AuditLog } from '../types';

interface AuditState {
  logs: AuditLog[];
  isLoading: boolean;
  error: string | null;
  fetchLogs: () => Promise<void>;
  addLog: (log: Omit<AuditLog, 'id' | 'fecha'>) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  logs: [],
  isLoading: false,
  error: null,
  
  fetchLogs: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/audit');
      set({ logs: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Error fetching audit logs', isLoading: false });
    }
  },

  addLog: (log) => set((state) => ({
    logs: [
      {
        ...log,
        id: Math.random().toString(36).substring(2, 9),
        fecha: new Date().toISOString(),
      },
      ...state.logs
    ]
  })),
}));