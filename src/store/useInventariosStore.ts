import { create } from 'zustand';
import { api } from '../config/axios';
import { Inventario } from '../types';

interface InventariosState {
  inventarios: Inventario[];
  isLoading: boolean;
  error: string | null;
  fetchInventarios: () => Promise<void>;
  addInventario: (nombre: string, empresaId?: string) => Promise<void>;
  updateInventario: (id: string, nombre: string) => Promise<void>;
  deleteInventario: (id: string) => Promise<void>;
}

export const useInventariosStore = create<InventariosState>((set, get) => ({
  inventarios: [],
  isLoading: false,
  error: null,

  fetchInventarios: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/inventarios');
      
      const dataArray = Array.isArray(response.data)
        ? response.data
        : (Array.isArray(response.data?.data) ? response.data.data : []);

      set({ inventarios: dataArray, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addInventario: async (nombre: string, empresaId?: string) => {
    try {
      const response = await api.post('/inventarios', { nombre, empresaId });
      set((state) => ({ inventarios: [...state.inventarios, response.data] }));
    } catch (error: any) {
      console.error('Error adding inventario:', error);
      throw error;
    }
  },

  updateInventario: async (id: string, nombre: string) => {
    try {
      const response = await api.put(`/inventarios/${id}`, { nombre });
      set((state) => ({
        inventarios: state.inventarios.map((inv) => (inv.id === id ? response.data : inv))
      }));
    } catch (error: any) {
      console.error('Error updating inventario:', error);
      throw error;
    }
  },

  deleteInventario: async (id: string) => {
    try {
      await api.delete(`/inventarios/${id}`);
      set((state) => ({
        inventarios: state.inventarios.filter((inv) => inv.id !== id)
      }));
    } catch (error: any) {
      console.error('Error deleting inventario:', error);
      throw error;
    }
  }
}));