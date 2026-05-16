import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { usePedidosStore } from '../../../store/pedidosStore';
import { updatePedidoStatus } from '../services/pedidos.service';
import { PedidoStatus } from '../../../types';
import React from 'react';
import CotizadorModal from '../../shared/components/CotizadorModal';
import { api } from '../../../config/axios';
import { UserPlus, Search, Edit, MessageCircle, FileText, ArrowUpDown, Calendar, Bell, Filter } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function getRecordatorioStatus(fecha: string | null | undefined): 'VENCIDO' | 'HOY' | 'PENDIENTE' | 'SIN_FECHA' {
  if (!fecha) return 'SIN_FECHA';
  const recordatorioDate = new Date(fecha);
  const today = new Date();
  recordatorioDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const timeDiff = recordatorioDate.getTime() - today.getTime();
  if (timeDiff < 0) return 'VENCIDO';
  else if (timeDiff === 0) return 'HOY';
  else return 'PENDIENTE';
}

function getStatusColorClass(status: string) {
  switch (status) {
    case 'PENDIENTE': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'EN_CONTACTO': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'COTIZADO': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'CONFIRMADO': return 'bg-lime-50 text-lime-700 border-lime-200';
    case 'RECHAZADO': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

// Validación de Email y Teléfono
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\d+$/; // Exclusivamente números, sin signos ni espacios

function RecordatorioBadge({ status }: { status: 'VENCIDO' | 'HOY' | 'PENDIENTE' | 'SIN_FECHA' }) {
  const statusStyles = {
    VENCIDO: 'bg-red-100 text-red-800 border border-red-200',
    HOY: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    PENDIENTE: 'bg-lime-100 text-lime-800 border border-lime-200',
    SIN_FECHA: 'bg-gray-100 text-gray-600 border border-gray-200'
  };
  if (status === 'SIN_FECHA') return <span className="text-muted-foreground text-xs">-</span>;
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

export default function PedidosList() {
  const { pedidos, isLoading, error, fetchPedidos, updateStatusLocal } = usePedidosStore();
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [isCotizadorOpen, setIsCotizadorOpen] = useState(false);
  const [pedidoToConvert, setPedidoToConvert] = useState<any>(null);
  const [isConvertingToClient, setIsConvertingToClient] = useState(false);
  const [pedidoToEdit, setPedidoToEdit] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [filterRecordatorio, setFilterRecordatorio] = useState("TODOS");
  const [selectedPedidoForQuote, setSelectedPedidoForQuote] = useState<any>(null);
  const [editingRecordatorio, setEditingRecordatorio] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'fecha' | 'recordatorio', direction: 'asc' | 'desc' } | null>(null);
  const [dateRange, setDateRange] = useState<'TODOS' | 'HOY' | 'ESTA_SEMANA' | 'ESTE_MES'>('TODOS');

  // Fetch pedidos on component mount
  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  // Handle status change
  const handleStatusChange = async (
    pedidoId: string,
    newStatus: PedidoStatus
  ) => {
    setStatusUpdating(pedidoId);
    try {
      // Call API to update status
      await updatePedidoStatus(pedidoId, newStatus);
      // Update local store
      updateStatusLocal(pedidoId, newStatus);
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast.error('Error al actualizar el estado del pedido');
      // Optionally refresh to revert change
      fetchPedidos();
    } finally {
      setStatusUpdating(null);
    }
  };

  // Handle opening quote modal for a specific prospect
  const openQuoteModal = (pedido: any) => {
    setSelectedPedidoForQuote({
      id: pedido.clienteId || null,
      nombre: pedido.nombre,
      email: pedido.email,
      telefono: pedido.telefono,
      cuit: pedido.cuit
    });
    setIsCotizadorOpen(true);
  };

  // Handle sending quote via WhatsApp
  const handleWhatsApp = (pedido: any) => {
    if (!pedido.telefono || !pedido.telefono.trim()) {
      toast.error('El prospecto no tiene teléfono registrado');
      return;
    }
    const numeroLimpio = pedido.telefono.replace(/[\s\-()]/g, '');
    if (!numeroLimpio) {
      toast.error('El teléfono no contiene números válidos');
      return;
    }
    let mensaje = `Hola ${pedido.nombre}, te envío el detalle de tu cotización/pedido:\n\n`;
    if (pedido.mensaje) {
      // Limpiamos el prefijo interno para que el cliente no lo vea
      const cleanMessage = pedido.mensaje.replace('COTIZACIÓN INTERNA:\n\n', '');
      mensaje += cleanMessage;
    }
    const urlWhatsApp = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;
    window.open(urlWhatsApp, '_blank');
  };

  // Handle quick recordatorio update (inline)
  const handleQuickRecordatorioUpdate = async (pedidoId: string, newDate: string) => {
    if (!newDate) {
      toast.error('La fecha es requerida');
      return;
    }
    try {
      await api.patch(`/pedidos/${pedidoId}`, { recordatorio: newDate });
      await fetchPedidos();
      setEditingRecordatorio(null);
      toast.success('Recordatorio actualizado');
    } catch (error: any) {
      console.error('Error actualizando recordatorio:', error);
      toast.error('Error al actualizar el recordatorio');
    }
  };

  // Handle converting pedido to cliente
  const handleConvertToClient = async () => {
    if (!pedidoToConvert?.nombre) {
      toast.error('El nombre es obligatorio');
      return;
    }

    if (pedidoToConvert.email && !emailRegex.test(pedidoToConvert.email.trim())) {
      toast.error('El email no tiene un formato válido');
      return;
    }

    if (pedidoToConvert.telefono && !phoneRegex.test(pedidoToConvert.telefono.trim())) {
      toast.error('El teléfono solo debe contener números (sin espacios, ni letras, ni símbolos)');
      return;
    }

    setIsConvertingToClient(true);
    try {
      // 1. Crear el cliente en la API de clientes
      const resCliente = await api.post('/clientes', {
        nombre: pedidoToConvert.nombre,
        razonSocial: pedidoToConvert.nombre,
        email: pedidoToConvert.email?.trim() || null,
        telefono: pedidoToConvert.telefono?.trim() || null,
        cuit: pedidoToConvert.cuit?.trim() || null,
        fechaRecordatorio: pedidoToConvert.fechaRecordatorio ? new Date(pedidoToConvert.fechaRecordatorio).toISOString() : null,
        condicionIva: 'Consumidor Final',
      });

      // 2. Vincular el pedido a ese nuevo cliente
      await api.patch(`/pedidos/${pedidoToConvert.id}`, {
        clienteId: resCliente.data.id,
      });

      // 3. Recargar y cerrar el modal
      await fetchPedidos();
      setPedidoToConvert(null);
      toast.success('Cliente creado exitosamente!');
    } catch (error: any) {
      console.error('Error convirtiendo cliente:', error);
      const errorMessage = error.response?.data?.message || 'Error al crear el cliente. Revisa los datos.';
      toast.error(errorMessage);
    } finally {
      setIsConvertingToClient(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-600">Cargando pedidos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  if (pedidos.length === 0 && !isCotizadorOpen) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-gray-500 mb-4">No hay pedidos disponibles</p>
        <button
          onClick={() => { setSelectedPedidoForQuote(null); setIsCotizadorOpen(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Cotización / Pedido
        </button>
      </div>
    );
  }

    const statusOptions = Object.values(PedidoStatus);

  // Función para verificar si una fecha está dentro de un rango
  const isDateInRange = (fecha: string | null | undefined, range: 'TODOS' | 'HOY' | 'ESTA_SEMANA' | 'ESTE_MES'): boolean => {
    if (!fecha) return false;
    const recordatorioDate = new Date(fecha);
    const today = new Date();
    recordatorioDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case 'HOY':
        return recordatorioDate.getTime() === today.getTime();
      case 'ESTA_SEMANA':
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return recordatorioDate.getTime() >= today.getTime() && recordatorioDate.getTime() <= nextWeek.getTime();
      case 'ESTE_MES':
        return recordatorioDate.getFullYear() === today.getFullYear() && recordatorioDate.getMonth() === today.getMonth();
      default:
        return true;
    }
  };

    // Lógica de filtrado
  const filteredPedidos = pedidos.filter(p => {
    // 1. Búsqueda por texto (nombre, email, telefono, tag)
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (p.nombre || '').toLowerCase().includes(searchLower) ||
      (p.email || '').toLowerCase().includes(searchLower) ||
      (p.telefono || '').includes(searchTerm) ||
      (p.tag || '').toLowerCase().includes(searchLower);

    // 2. Filtro por Estado
    const matchesStatus = filterStatus === 'TODOS' || p.status === filterStatus;

    // 3. Filtro por Recordatorio
    let matchesRecordatorio = true;
    if (filterRecordatorio !== 'TODOS') {
      const recStatus = getRecordatorioStatus(p.recordatorio);
      matchesRecordatorio = recStatus === filterRecordatorio;
    }

    // 4. Filtro por Rango de Fechas
    let matchesDateRange = true;
    if (dateRange !== 'TODOS') {
      matchesDateRange = isDateInRange(p.recordatorio, dateRange);
    }

    return matchesSearch && matchesStatus && matchesRecordatorio && matchesDateRange;
  }).sort((a, b) => {
    // Ordenamiento múltiple
    if (sortConfig === null) {
      return 0; // Sin ordenamiento
    }

    if (sortConfig.key === 'fecha') {
      const aDate = new Date(a.fechaCreacion).getTime();
      const bDate = new Date(b.fechaCreacion).getTime();
      return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
    } else if (sortConfig.key === 'recordatorio') {
      const aDate = a.recordatorio ? new Date(a.recordatorio).getTime() : null;
      const bDate = b.recordatorio ? new Date(b.recordatorio).getTime() : null;

      // Los registros sin fecha siempre van al final
      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;

      // Ordenar ascendente o descendente
      return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
    }

    return 0;
  });

  return (
    <div className="w-full">
      {/* Header con botón */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pedidos y Prospectos</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectedPedidoForQuote(null); setIsCotizadorOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Cotización / Pedido
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nombre, email, teléfono o tag..."
            className="pl-8 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
                <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || 'TODOS')}>
          <SelectTrigger className="w-full sm:w-[200px] bg-white">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Estado" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Estado: Todos</SelectItem>
            {statusOptions.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRecordatorio} onValueChange={(val) => setFilterRecordatorio(val || 'TODOS')}>
          <SelectTrigger className="w-full sm:w-[200px] bg-white">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Recordatorio" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Alertas: Todas</SelectItem>
            <SelectItem value="HOY">Llamar Hoy</SelectItem>
            <SelectItem value="VENCIDO">Vencidos</SelectItem>
            <SelectItem value="PENDIENTE">Pendientes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(val) => setDateRange(val as 'TODOS' | 'HOY' | 'ESTA_SEMANA' | 'ESTE_MES')}>
          <SelectTrigger className="w-full sm:w-[200px] bg-white">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Rango de Fechas" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Rango: Todas</SelectItem>
            <SelectItem value="HOY">Hoy</SelectItem>
            <SelectItem value="ESTA_SEMANA">Esta semana</SelectItem>
            <SelectItem value="ESTE_MES">Este mes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {/* Desktop Table */}
        <table className="hidden md:table w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => {
                if (sortConfig?.key === 'fecha') {
                  setSortConfig(sortConfig.direction === 'asc' ? { key: 'fecha', direction: 'desc' } : null);
                } else {
                  setSortConfig({ key: 'fecha', direction: 'asc' });
                }
              }}>
                <span className="flex items-center gap-1">
                  Fecha
                  {sortConfig?.key === 'fecha' && <ArrowUpDown className="ml-1 h-4 w-4 inline-block" />}
                </span>
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Prospecto
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Contacto
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Tag
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Mensaje
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => {
                if (sortConfig?.key === 'recordatorio') {
                  setSortConfig(sortConfig.direction === 'asc' ? { key: 'recordatorio', direction: 'desc' } : null);
                } else {
                  setSortConfig({ key: 'recordatorio', direction: 'asc' });
                }
              }}>
                <span className="flex items-center gap-1">
                  Recordatorio
                  {sortConfig?.key === 'recordatorio' && <ArrowUpDown className="ml-1 h-4 w-4 inline-block" />}
                </span>
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredPedidos.map((pedido) => (
              <tr key={pedido.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm text-gray-700">
                  {new Date(pedido.fechaCreacion).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {pedido.nombre || 'Sin nombre'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="space-y-1">
                    {pedido.email && (
                      <p className="truncate">{pedido.email}</p>
                    )}
                    {pedido.telefono && (
                      <p className="text-xs text-gray-500">{pedido.telefono}</p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {pedido.tag ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-200">
                      {pedido.tag}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <p className="line-clamp-2">
                    {pedido.mensaje || 'Sin mensaje'}
                  </p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingRecordatorio === pedido.id ? (
                    <input
                      type="datetime-local"
                      autoFocus
                      defaultValue={pedido.recordatorio ? new Date(pedido.recordatorio).toISOString().slice(0, 16) : ''}
                      className="px-2 py-1 border border-blue-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onBlur={(e) => {
                        if (e.target.value) {
                          handleQuickRecordatorioUpdate(pedido.id, e.target.value);
                        } else {
                          setEditingRecordatorio(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value) {
                          handleQuickRecordatorioUpdate(pedido.id, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          setEditingRecordatorio(null);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="flex flex-col gap-1 items-start cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors"
                      onClick={() => setEditingRecordatorio(pedido.id)}
                    >
                      <RecordatorioBadge status={getRecordatorioStatus(pedido.recordatorio)} />
                      {pedido.recordatorio && (
                        <span className="text-xs text-muted-foreground font-medium">
                          {new Date(pedido.recordatorio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <select
                    value={pedido.status}
                    onChange={(e) =>
                      handleStatusChange(
                        pedido.id,
                        e.target.value as PedidoStatus
                      )
                    }
                    disabled={statusUpdating === pedido.id}
                    className={`px-3 py-2 border rounded-md text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${getStatusColorClass(pedido.status)}`}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status} className="bg-white text-gray-900">
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleWhatsApp(pedido)}
                      className="inline-flex items-center gap-2 px-3 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-md transition-colors"
                      title="Enviar Cotización por WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openQuoteModal(pedido)}
                      className="inline-flex items-center gap-2 px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                      title="Nueva Cotización para este prospecto"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        const editData = { ...pedido };
                        if (editData.recordatorio) {
                          editData.recordatorio = new Date(editData.recordatorio).toISOString().slice(0, 16);
                        }
                        setPedidoToEdit(editData);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      title="Editar Pedido"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {!pedido.clienteId && (
                      <button
                        onClick={() => setPedidoToConvert(pedido)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                        title="Convertir a Cliente Oficial"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span className="text-xs font-medium"></span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredPedidos.map((pedido) => (
            <div
              key={pedido.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              {/* Fila superior: Fecha (izq) y Tag (der) */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Fecha
                  </p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(pedido.fechaCreacion).toLocaleDateString(
                      'es-ES',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }
                    )}
                  </p>
                </div>
                <div>
                  {pedido.tag ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-200 inline-block">
                      {pedido.tag}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </div>
              </div>

              {/* Info principal apilada */}
              <div className="space-y-3 mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Prospecto
                  </p>
                  <p className="text-sm font-medium text-gray-900">
                    {pedido.nombre || 'Sin nombre'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Contacto
                  </p>
                  <div className="space-y-1">
                    {pedido.email && (
                      <p className="text-sm text-gray-600 break-all">
                        {pedido.email}
                      </p>
                    )}
                    {pedido.telefono && (
                      <p className="text-sm text-gray-600">{pedido.telefono}</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Mensaje
                  </p>
                  <p className="text-sm text-gray-600">
                    {pedido.mensaje || 'Sin mensaje'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Recordatorio</p>
                  {editingRecordatorio === pedido.id ? (
                    <input
                      type="datetime-local"
                      autoFocus
                      defaultValue={pedido.recordatorio ? new Date(pedido.recordatorio).toISOString().slice(0, 16) : ''}
                      className="w-full px-2 py-1 border border-blue-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onBlur={(e) => {
                        if (e.target.value) {
                          handleQuickRecordatorioUpdate(pedido.id, e.target.value);
                        } else {
                          setEditingRecordatorio(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value) {
                          handleQuickRecordatorioUpdate(pedido.id, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          setEditingRecordatorio(null);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors w-fit"
                      onClick={() => setEditingRecordatorio(pedido.id)}
                    >
                      <RecordatorioBadge status={getRecordatorioStatus(pedido.recordatorio)} />
                      {pedido.recordatorio && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(pedido.recordatorio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Separador visual con Estado y Acciones */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                {/* Select de Estado - ancho completo */}
                <select
                  value={pedido.status}
                  onChange={(e) =>
                    handleStatusChange(
                      pedido.id,
                      e.target.value as PedidoStatus
                    )
                  }
                  disabled={statusUpdating === pedido.id}
                  className={`w-full px-3 py-2 border rounded-md text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${getStatusColorClass(pedido.status)}`}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status} className="bg-white text-gray-900">
                      {status}
                    </option>
                  ))}
                </select>

                {/* Botones de acción */}
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={() => handleWhatsApp(pedido)}
                    className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                    title="Enviar Cotización por WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openQuoteModal(pedido)}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                    title="Nueva Cotización para este prospecto"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      const editData = { ...pedido };
                      if (editData.recordatorio) {
                        editData.recordatorio = new Date(editData.recordatorio).toISOString().slice(0, 16);
                      }
                      setPedidoToEdit(editData);
                    }}
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    title="Editar Pedido"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {!pedido.clienteId && (
                    <button
                      onClick={() => setPedidoToConvert(pedido)}
                      className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                      title="Convertir a Cliente Oficial"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Convertir a Cliente */}
      <Dialog open={!!pedidoToConvert} onOpenChange={() => setPedidoToConvert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Convertir Prospecto a Cliente
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 border">
              Vas a crear un cliente oficial a partir de la solicitud de <b>{pedidoToConvert?.nombre}</b>. Verifica los datos antes de guardar.
            </div>

            <div className="grid gap-2">
              <Label>Nombre / Razón Social *</Label>
              <Input
                value={pedidoToConvert?.nombre || ''}
                onChange={(e) =>
                  setPedidoToConvert({ ...pedidoToConvert, nombre: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={pedidoToConvert?.email || ''}
                  onChange={(e) =>
                    setPedidoToConvert({ ...pedidoToConvert, email: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Teléfono</Label>
                <Input
                  type="tel"
                  value={pedidoToConvert?.telefono || ''}
                  onChange={(e) =>
                    setPedidoToConvert({ ...pedidoToConvert, telefono: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>CUIT</Label>
                <Input
                  value={pedidoToConvert?.cuit || ''}
                  placeholder="Sin CUIT cargado"
                  onChange={(e) =>
                    setPedidoToConvert({ ...pedidoToConvert, cuit: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Fecha Recordatorio</Label>
                <Input
                  type="datetime-local"
                  value={pedidoToConvert?.fechaRecordatorio || ''}
                  onChange={(e) =>
                    setPedidoToConvert({ ...pedidoToConvert, fechaRecordatorio: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPedidoToConvert(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isConvertingToClient || !pedidoToConvert?.nombre}
              onClick={handleConvertToClient}
            >
              {isConvertingToClient ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Confirmar y Crear Cliente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Pedido */}
      <Dialog open={!!pedidoToEdit} onOpenChange={(open) => !open && setPedidoToEdit(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Detalles del Prospecto / Pedido</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Nombre / Razón Social *</Label>
                <Input
                  value={pedidoToEdit?.nombre || ''}
                  onChange={e => setPedidoToEdit({ ...pedidoToEdit, nombre: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>CUIT</Label>
                <Input
                  value={pedidoToEdit?.cuit || ''}
                  onChange={e => setPedidoToEdit({ ...pedidoToEdit, cuit: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={pedidoToEdit?.email || ''}
                  onChange={e => setPedidoToEdit({ ...pedidoToEdit, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Teléfono</Label>
                <Input
                  value={pedidoToEdit?.telefono || ''}
                  onChange={e => setPedidoToEdit({ ...pedidoToEdit, telefono: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Etiqueta (Tag)</Label>
                <Input
                  value={pedidoToEdit?.tag || ''}
                  placeholder="Ej: Mayorista, VIP, etc."
                  onChange={e => setPedidoToEdit({ ...pedidoToEdit, tag: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Recordatorio</Label>
                <Input
                  type="datetime-local"
                  value={pedidoToEdit?.recordatorio || ''}
                  onChange={e => setPedidoToEdit({ ...pedidoToEdit, recordatorio: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Mensaje / Detalles de Cotización</Label>
              <textarea
                className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={pedidoToEdit?.mensaje || ''}
                onChange={e => setPedidoToEdit({ ...pedidoToEdit, mensaje: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPedidoToEdit(null)}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                if (!pedidoToEdit?.nombre) {
                  toast.error('El nombre es obligatorio');
                  return;
                }

                if (pedidoToEdit.email && !emailRegex.test(pedidoToEdit.email.trim())) {
                  toast.error('El email no tiene un formato válido');
                  return;
                }

                if (pedidoToEdit.telefono && !phoneRegex.test(pedidoToEdit.telefono.trim())) {
                  toast.error('El teléfono solo debe contener números (sin espacios, ni letras, ni símbolos)');
                  return;
                }

                try {
                  await api.patch(`/pedidos/${pedidoToEdit.id}`, pedidoToEdit);
                  fetchPedidos();
                  setPedidoToEdit(null);
                  toast.success('Pedido actualizado correctamente');
                } catch (error) {
                  console.error(error);
                  toast.error('Error al actualizar el pedido');
                }
              }}
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cotizador */}
      <CotizadorModal
        isOpen={isCotizadorOpen}
        onClose={() => {
          setIsCotizadorOpen(false);
          setSelectedPedidoForQuote(null);
        }}
        clientePreseleccionado={selectedPedidoForQuote}
        onSaveQuote={async (data) => {
          try {
            // 1. Transformar el carrito en texto para el campo 'mensaje'
            let detalleMensaje = 'COTIZACIÓN INTERNA:\n\n';
            if (data.items && data.items.length > 0) {
              data.items.forEach((item: any) => {
                detalleMensaje += `- ${item.cantidad}x ${item.articulo.nombre} ($${(item.articulo.precio || 0).toFixed(2)})\n`;
              });
              detalleMensaje += `\nSubtotal: $${data.subtotal.toFixed(2)}\nImpuestos: $${data.impuestos.toFixed(2)}\nTotal: $${data.total.toFixed(2)}`;
            }
            // 2. Mapear al formato exacto que espera 'createPedido' en el backend
            const payload = {
              nombre: data.nombreCliente,
              clienteId: data.clienteId,
              email: data.email,
              telefono: data.telefono,
              cuit: data.cuit,
              mensaje: detalleMensaje,
              tag: 'COTIZADO'
            };
            // 3. Enviar a la API
            await api.post('/pedidos', payload);
            fetchPedidos();
            setIsCotizadorOpen(false);
          } catch (error) {
            console.error('Error guardando pedido:', error);
            // Lanzar el error para que el modal no cierre y no muestre éxito
            throw error;
          }
        }}
      />
    </div>
  );
}