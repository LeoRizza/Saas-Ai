import { create } from 'zustand';
import { api } from '../config/axios';
import { Venta, VentaItem } from '../types';

interface SalesState {
  ventas: Venta[];
  isLoading: boolean;
  error: string | null;
  fetchVentas: () => Promise<void>;
  addVenta: (venta: Omit<Venta, 'id' | 'fecha'>) => void;
}

export const useSalesStore = create<SalesState>((set) => ({
  ventas: [],
  isLoading: false,
  error: null,

  fetchVentas: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/ventas');
      set({ ventas: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Error fetching ventas', isLoading: false });
    }
  },

  addVenta: (ventaData) => set((state) => {
    const newVenta: Venta = {
      ...ventaData,
      id: Math.random().toString(36).substr(2, 9),
      fecha: new Date().toISOString(),
    };
    return { ventas: [newVenta, ...state.ventas] };
  }),
}));