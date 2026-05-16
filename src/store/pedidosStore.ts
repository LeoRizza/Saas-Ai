import { create } from 'zustand';
import { Pedido, PedidoStatus } from '../types';
import { getPedidos } from '../features/pedidos/services/pedidos.service';

interface PedidosState {
    pedidos: Pedido[];
    isLoading: boolean;
    error: string | null;
    fetchPedidos: () => Promise<void>;
    updateStatusLocal: (id: string, newStatus: PedidoStatus) => void;
}

export const usePedidosStore = create<PedidosState>((set) => ({
    pedidos: [],
    isLoading: false,
    error: null,

    fetchPedidos: async () => {
        set({ isLoading: true, error: null });
        try {
            const data = await getPedidos();
            set({ pedidos: data, isLoading: false });
        } catch (error: any) {
            set({ error: error.message || 'Error fetching pedidos', isLoading: false });
        }
    },

    updateStatusLocal: (id, newStatus) => {
        set((state) => ({
            pedidos: state.pedidos.map((pedido) =>
                pedido.id === id ? { ...pedido, status: newStatus } : pedido
            ),
        }));
    },
}));