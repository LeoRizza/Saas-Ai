import { create } from 'zustand';
import { api } from '../config/axios';
import { Cliente, AccionAudit, TablaAudit } from '../types';
import { useAuditStore } from './useAuditStore';
import { useAuthStore } from './useAuthStore';
import toast from 'react-hot-toast';

interface ClientState {
  clientes: Cliente[];
  isLoading: boolean;
  error: string | null;
  fetchClientes: () => Promise<void>;
  addCliente: (cliente: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateCliente: (id: string, data: Partial<Cliente>) => Promise<void>;
  deleteCliente: (id: string) => Promise<void>;
}

export const useClientStore = create<ClientState>((set) => ({
  clientes: [],
  isLoading: false,
  error: null,

  fetchClientes: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/clientes');
      set({ clientes: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Error fetching clientes', isLoading: false });
    }
  },

  addCliente: async (data) => {
    try {
      const response = await api.post('/clientes', data);
      const newCliente = response.data;

      set((state) => ({ clientes: [newCliente, ...state.clientes] }));

      useAuditStore.getState().addLog({
        usuarioId: useAuthStore.getState().user?.nombre || 'Desconocido',
        empresaId: data.empresaId || 'empresa-1',
        accion: AccionAudit.MODIFICACION_CLIENTE,
        tablaAfectada: TablaAudit.CLIENTE,
        registroId: newCliente.id,
        valorAnterior: null,
        valorNuevo: newCliente,
        motivo: 'Creación de cliente'
      });
    } catch (error) {
      console.error('Error adding cliente:', error);
    }
  },

  updateCliente: async (id, data) => {
    try {
      const response = await api.put(`/clientes/${id}`, data);
      const updatedCliente = response.data;

      set((state) => {
        const oldCliente = state.clientes.find(c => c.id === id);
        const newClientes = state.clientes.map(c => c.id === id ? updatedCliente : c);

        useAuditStore.getState().addLog({
          usuarioId: useAuthStore.getState().user?.nombre || 'Desconocido',
          empresaId: oldCliente?.empresaId || 'empresa-1',
          accion: AccionAudit.MODIFICACION_CLIENTE,
          tablaAfectada: TablaAudit.CLIENTE,
          registroId: id,
          valorAnterior: oldCliente,
          valorNuevo: updatedCliente,
          motivo: 'Actualización de cliente'
        });

        return { clientes: newClientes };
      });
    } catch (error) {
      console.error('Error updating cliente:', error);
    }
  },

  deleteCliente: async (id) => {
    try {
      await api.delete(`/clientes/${id}`);
      set((state) => {
        const oldCliente = state.clientes.find(c => c.id === id);
        useAuditStore.getState().addLog({
          usuarioId: useAuthStore.getState().user?.nombre || 'Desconocido',
          empresaId: oldCliente?.empresaId || 'empresa-1',
          accion: AccionAudit.MODIFICACION_CLIENTE,
          tablaAfectada: TablaAudit.CLIENTE,
          registroId: id,
          valorAnterior: oldCliente,
          valorNuevo: null,
          motivo: 'Eliminación de cliente'
        });

        return { clientes: state.clientes.filter(c => c.id !== id) };
      });
    } catch (error: any) {
      console.error("Error deleting cliente:", error);
      const errorMessage = error.response?.data?.message || "Ocurrió un error al intentar eliminar el cliente.";
      toast.error(errorMessage);
    }
  },
}));