import { create } from 'zustand';
import { api } from '../config/axios';
import { Empresa, Usuario, RolUsuario } from '../types';

interface SuperAdminState {
  empresas: Empresa[];
  usuarios: Usuario[];
  fetchData: () => Promise<void>;
  addEmpresa: (empresa: Omit<Empresa, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateEmpresa: (id: string, data: Partial<Empresa>) => Promise<void>;
  deleteEmpresa: (id: string) => Promise<void>;
  addUsuario: (usuario: Omit<Usuario, 'id'>) => Promise<void>;
  updateUsuario: (id: string, data: Partial<Usuario>) => Promise<void>;
  deleteUsuario: (id: string) => Promise<void>;
}

export const useSuperAdminStore = create<SuperAdminState>((set, get) => ({
  empresas: [],
  usuarios: [],
  
  fetchData: async () => {
    try {
      const [empresasRes, usuariosRes] = await Promise.all([
        api.get('/empresas'),
        api.get('/usuarios')
      ]);
      set({ empresas: empresasRes.data, usuarios: usuariosRes.data });
    } catch (error) {
      console.error('Error fetching super admin data:', error);
    }
  },

  addEmpresa: async (empresaData) => {
    try {
      const res = await api.post('/empresas', empresaData);
      set((state) => ({ empresas: [...state.empresas, res.data] }));
    } catch (error) {
      console.error('Error adding empresa:', error);
      throw error;
    }
  },
  
  updateEmpresa: async (id, data) => {
    try {
      const res = await api.put(`/empresas/${id}`, data);
      set((state) => ({
        empresas: state.empresas.map(e => e.id === id ? res.data : e)
      }));
    } catch (error) {
      console.error('Error updating empresa:', error);
      throw error;
    }
  },
  
  deleteEmpresa: async (id) => {
    try {
      await api.delete(`/empresas/${id}`);
      set((state) => ({
        empresas: state.empresas.filter(e => e.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting empresa:', error);
      throw error;
    }
  },

  addUsuario: async (usuarioData) => {
    try {
      const res = await api.post('/usuarios', usuarioData);
      set((state) => ({ usuarios: [...state.usuarios, res.data] }));
    } catch (error) {
      console.error('Error adding usuario:', error);
      throw error;
    }
  },

  updateUsuario: async (id, data) => {
    try {
      const res = await api.put(`/usuarios/${id}`, data);
      set((state) => ({
        usuarios: state.usuarios.map(u => u.id === id ? res.data : u)
      }));
    } catch (error) {
      console.error('Error updating usuario:', error);
      throw error;
    }
  },

  deleteUsuario: async (id) => {
    try {
      await api.delete(`/usuarios/${id}`);
      set((state) => ({
        usuarios: state.usuarios.filter(u => u.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting usuario:', error);
      throw error;
    }
  },
}));