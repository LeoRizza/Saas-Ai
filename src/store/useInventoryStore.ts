import { create } from 'zustand';
import { api } from '../config/axios';
import { Articulo, ProduccionLogFrontend, AccionAudit, TablaAudit } from '../types';
import { useAuditStore } from './useAuditStore';
import toast from 'react-hot-toast';

interface InventoryState {
  articulos: Articulo[];
  historialProduccion: ProduccionLogFrontend[];
  isLoading: boolean;
  error: string | null;
  fetchInventory: () => Promise<void>;
  registrarProduccion: (
    productoNombre: string,
    unidades: number,
    peso: number,
    insumos: { articuloId: string; kilos: number; unidades: number }[],
    inventarioOrigenId: string,
    inventarioDestinoId: string
  ) => Promise<void>;
  addArticulo: (data: FormData) => Promise<void>;
  updateArticulo: (id: string, data: FormData) => Promise<void>;
  deleteArticulo: (id: string) => Promise<void>;
  fetchHistorialProduccion: () => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  articulos: [],
  historialProduccion: [],
  isLoading: false,
  error: null,
  
  fetchInventory: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/inventory');
      set({ articulos: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Error fetching inventory', isLoading: false });
    }
  },

  fetchHistorialProduccion: async () => {
    try {
      const response = await api.get('/produccion');
      set({ historialProduccion: response.data });
    } catch (error) {
      console.error('Error fetching historial de producción', error);
    }
  },

  registrarProduccion: async (productoNombre, unidades, peso, insumos, inventarioOrigenId, inventarioDestinoId) => {
    try {
      await api.post('/produccion', {
        productoNombre,
        unidades,
        peso,
        insumos,
        inventarioOrigenId,
        inventarioDestinoId
      });
      
      await get().fetchInventory();
      await get().fetchHistorialProduccion();
    } catch (error: any) {
      console.error('Error registrando producción', error);
      toast.error(error.response?.data?.message || 'Error al registrar la producción');
      throw error;
    }
  },

  addArticulo: async (data: FormData) => {
    try {
      const response = await api.post('/inventory', data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      set((state) => ({ articulos: [response.data, ...state.articulos] }));
    } catch (error) {
      console.error('Error adding articulo', error);
      throw error;
    }
  },

  updateArticulo: async (id: string, data: FormData) => {
    try {
      const response = await api.put(`/inventory/${id}`, data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      set((state) => ({
        articulos: state.articulos.map(a => a.id === id ? response.data : a)
      }));
    } catch (error) {
      console.error('Error updating articulo', error);
      throw error;
    }
  },

  deleteArticulo: async (id: string) => {
    try {
      await api.delete(`/inventory/${id}`);
      set((state) => ({
        articulos: state.articulos.filter(a => a.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting articulo', error);
      throw error;
    }
  }
}));