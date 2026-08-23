import { create } from 'zustand';
import { api } from '../config/axios';
import { AuditLog } from '../types';

interface AuditMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AuditFilters {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

interface AuditState {
  logs: AuditLog[];
  meta: AuditMeta | null;
  isLoading: boolean;
  error: string | null;
  fetchLogs: (filters?: AuditFilters) => Promise<void>;
  addLog: (log: Omit<AuditLog, 'id' | 'fecha'>) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  logs: [],
  meta: null,
  isLoading: false,
  error: null,
  
  fetchLogs: async (filters?: AuditFilters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);

      const queryString = params.toString();
      const url = queryString ? `/audit?${queryString}` : '/audit';
      const response = await api.get(url);
      
      set({ 
        logs: response.data.data || response.data, 
        meta: response.data.meta || null,
        isLoading: false 
      });
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