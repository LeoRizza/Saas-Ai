import { api } from '../../../config/axios';
import { Pedido, PedidoStatus } from '../../../types';

/**
 * ==========================================
 * --- SERVICIO DE PEDIDOS (FRONTEND) ---
 * ==========================================
 * 
 * Contiene todas las llamadas API para la gestión de pedidos.
 * Utiliza la instancia de Axios configurada con interceptores JWT.
 */

// ==========================================
// 📋 GET - Obtener todos los pedidos
// ==========================================
export const getPedidos = async (): Promise<Pedido[]> => {
  const response = await api.get('/pedidos');
  return response.data;
};

// ==========================================
// 🔄 PATCH - Actualizar estado del pedido
// ==========================================
export const updatePedidoStatus = async (
  id: string,
  status: PedidoStatus
): Promise<Pedido> => {
  const response = await api.patch(`/pedidos/${id}/status`, { status });
  return response.data;
};
