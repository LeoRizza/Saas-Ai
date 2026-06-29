import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { usePedidosStore } from '../../../store/pedidosStore';
import { useClientStore } from '../../../store/useClientStore';
import { updatePedidoStatus } from '../services/pedidos.service';
import { PedidoStatus } from '../../../types';
import React from 'react';
import CotizadorModal from '../../shared/components/CotizadorModal';
import { api } from '../../../config/axios';
import { UserPlus, Users, Search, Edit, MessageCircle, FileText, ArrowUpDown, Calendar, Bell, Filter, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Helper para convertir datetime a formato local sin desplazamiento de zona horaria
function getLocalISODateTime(dateString: string) {
  const date = new Date(dateString);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

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
  const { clientes, fetchClientes } = useClientStore();
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [isCotizadorOpen, setIsCotizadorOpen] = useState(false);
  const [pedidoForClient, setPedidoForClient] = useState<any>(null);
  const [selectedExistingClient, setSelectedExistingClient] = useState<string | null>(null);
  const [pedidoToEdit, setPedidoToEdit] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [filterRecordatorio, setFilterRecordatorio] = useState("TODOS");
  const [selectedPedidoForQuote, setSelectedPedidoForQuote] = useState<any>(null);
  const [editingRecordatorio, setEditingRecordatorio] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'fecha' | 'recordatorio', direction: 'asc' | 'desc' } | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterTag, setFilterTag] = useState("TODOS");
  const [nuevaAnotacion, setNuevaAnotacion] = useState("");
  const [isProcessingClientAssignment, setIsProcessingClientAssignment] = useState(false);

  // Fetch pedidos and clientes on component mount
  useEffect(() => {
    fetchPedidos();
    fetchClientes();
  }, [fetchPedidos, fetchClientes]);

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

  // Handle downloading PDF
  const handleDownloadPDF = async (pedidoId: string, nombreCliente: string) => {
    try {
      const toastId = toast.loading("Generando PDF...");
      const response = await api.get(`/pedidos/${pedidoId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const cleanName = nombreCliente.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.setAttribute('download', `Cotizacion_${cleanName}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("PDF descargado correctamente", { id: toastId });
    } catch (error) {
      console.error("Error descargando PDF:", error);
      toast.error("Error al generar el PDF. Verifica que el pedido tenga items.");
    }
  };

  // Handle assigning existing client to pedido
  const handleAssignExistingClient = async () => {
    if (!selectedExistingClient) {
      toast.error('Por favor selecciona un cliente');
      return;
    }

    setIsProcessingClientAssignment(true);
    try {
      await api.patch(`/pedidos/${pedidoForClient.id}`, {
        clienteId: selectedExistingClient,
      });
      await fetchPedidos();
      setPedidoForClient(null);
      setSelectedExistingClient(null);
      toast.success('Cliente asignado exitosamente!');
    } catch (error: any) {
      console.error('Error asignando cliente:', error);
      const errorMessage = error.response?.data?.message || 'Error al asignar el cliente';
      toast.error(errorMessage);
    } finally {
      setIsProcessingClientAssignment(false);
    }
  };

  // Handle creating new client and assigning to pedido
  const handleCreateAndAssignNewClient = async () => {
    if (!pedidoForClient?.nombre) {
      toast.error('El nombre es obligatorio');
      return;
    }

    if (pedidoForClient.email && !emailRegex.test(pedidoForClient.email.trim())) {
      toast.error('El email no tiene un formato válido');
      return;
    }

    if (pedidoForClient.telefono && !phoneRegex.test(pedidoForClient.telefono.trim())) {
      toast.error('El teléfono solo debe contener números (sin espacios, ni letras, ni símbolos)');
      return;
    }

    setIsProcessingClientAssignment(true);
    try {
      // 1. Crear el cliente en la API de clientes
      const resCliente = await api.post('/clientes', {
        nombre: pedidoForClient.nombre,
        razonSocial: pedidoForClient.nombre,
        email: pedidoForClient.email?.trim() || null,
        telefono: pedidoForClient.telefono?.trim() || null,
        cuit: pedidoForClient.cuit?.trim() || null,
        fechaRecordatorio: pedidoForClient.fechaRecordatorio ? new Date(pedidoForClient.fechaRecordatorio).toISOString() : null,
        condicionIva: 'Consumidor Final',
      });

      // 2. Vincular el pedido a ese nuevo cliente
      await api.patch(`/pedidos/${pedidoForClient.id}`, {
        clienteId: resCliente.data.id,
      });

      // 3. Recargar y cerrar el modal
      await fetchPedidos();
      setPedidoForClient(null);
      setSelectedExistingClient(null);
      toast.success('Cliente creado y asignado exitosamente!');
    } catch (error: any) {
      console.error('Error creando cliente:', error);
      const errorMessage = error.response?.data?.message || 'Error al crear el cliente. Revisa los datos.';
      toast.error(errorMessage);
    } finally {
      setIsProcessingClientAssignment(false);
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

  // Extraer tags únicos de la lista de pedidos
  const uniqueTags = Array.from(new Set(pedidos.map(p => p.tag).filter(Boolean)));

  // Lógica de filtrado
  const filteredPedidos = pedidos.filter(p => {
    // 1. Búsqueda por texto (nombre, email, telefono, tag)
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (p.id || '').toLowerCase().includes(searchLower) ||
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

    // 4. Filtro por Rango de Fechas (Aplica a fechaCreacion)
    let matchesDateRange = true;
    if (startDate || endDate) {
      const fechaYMD = p.fechaCreacion.substring(0, 10); // Formato YYYY-MM-DD
      if (startDate && fechaYMD < startDate) matchesDateRange = false;
      if (endDate && fechaYMD > endDate) matchesDateRange = false;
    }

    // 5. Filtro por Tag exacto
    const matchesTag = filterTag === 'TODOS' || p.tag === filterTag;

    return matchesSearch && matchesStatus && matchesRecordatorio && matchesDateRange && matchesTag;
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
        <Select value={filterTag} onValueChange={(val) => setFilterTag(val || 'TODOS')}>
          <SelectTrigger className="w-full sm:w-[160px] bg-white">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Etiqueta" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Tags: Todos</SelectItem>
            {uniqueTags.map(tag => (
              <SelectItem key={tag as string} value={tag as string}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 w-full sm:w-auto bg-white border rounded-md px-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border-0 shadow-none focus-visible:ring-0 px-1 w-[130px]" title="Fecha Desde" />
          <span className="text-gray-400">-</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border-0 shadow-none focus-visible:ring-0 px-1 w-[130px]" title="Fecha Hasta" />
        </div>
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
                  <div className="flex flex-wrap gap-1 max-w-[120px]">
                    {pedido.tag ? (
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border border-indigo-100 truncate w-full" title={pedido.tag}>
                        {pedido.tag}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingRecordatorio === pedido.id ? (
                    <input
                      type="datetime-local"
                      autoFocus
                      defaultValue={pedido.recordatorio ? getLocalISODateTime(pedido.recordatorio) : ''}
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
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleDownloadPDF(pedido.id, pedido.nombre)}
                      className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Descargar Cotización (PDF)"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleWhatsApp(pedido)}
                      className="p-1.5 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                      title="Enviar por WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openQuoteModal(pedido)}
                      className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="Nueva Cotización"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    <button
                      onClick={() => {
                        const editData = { ...pedido };
                        if (editData.recordatorio) editData.recordatorio = getLocalISODateTime(editData.recordatorio);
                        setPedidoToEdit(editData);
                      }}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      title="Ver / Editar Pedido"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setPedidoForClient(pedido);
                        setSelectedExistingClient(pedido.clienteId || null);
                      }}
                      className="p-1.5 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                      title={pedido.clienteId ? "Reasignar Cliente" : "Asignar o Crear Cliente"}
                    >
                      {pedido.clienteId ? <Users className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    </button>
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
                  <div className="flex flex-wrap gap-1 max-w-[120px]">
                    {pedido.tag ? (
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border border-indigo-100 truncate w-full" title={pedido.tag}>
                        {pedido.tag}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </div>
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
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Recordatorio</p>
                  {editingRecordatorio === pedido.id ? (
                    <input
                      type="datetime-local"
                      autoFocus
                      defaultValue={pedido.recordatorio ? getLocalISODateTime(pedido.recordatorio) : ''}
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
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleDownloadPDF(pedido.id, pedido.nombre)}
                    className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                    title="Descargar Cotización (PDF)"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleWhatsApp(pedido)}
                    className="p-1.5 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                    title="Enviar por WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openQuoteModal(pedido)}
                    className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Nueva Cotización"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-1"></div>
                  <button
                    onClick={() => {
                      const editData = { ...pedido };
                      if (editData.recordatorio) editData.recordatorio = getLocalISODateTime(editData.recordatorio);
                      setPedidoToEdit(editData);
                    }}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                    title="Ver / Editar Pedido"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setPedidoForClient(pedido);
                      setSelectedExistingClient(pedido.clienteId || null);
                    }}
                    className="p-1.5 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                    title={pedido.clienteId ? "Reasignar Cliente" : "Asignar o Crear Cliente"}
                  >
                    {pedido.clienteId ? <Users className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Unificado: Asignar o Reasignar Cliente */}
      <Dialog open={!!pedidoForClient} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setPedidoForClient(null);
          setSelectedExistingClient(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pedidoForClient?.clienteId ? (
                <>
                  <Users className="h-5 w-5 text-purple-600" />
                  Reasignar Cliente
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 text-blue-600" />
                  Asignar o Crear Cliente
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 border">
              {pedidoForClient?.clienteId ? (
                <>Vas a reasignar el pedido de <b>{pedidoForClient?.nombre}</b> a otro cliente.</>
              ) : (
                <>Vas a asignar el pedido de <b>{pedidoForClient?.nombre}</b> a un cliente.</>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Seleccionar Cliente Existente *</Label>
              <Select value={selectedExistingClient || ''} onValueChange={(val) => setSelectedExistingClient(val || null)}>
                <SelectTrigger className="bg-white">
                  <SelectValue>
                    {selectedExistingClient
                      ? clientes.find(c => c.id === selectedExistingClient)?.nombre || 'Cliente seleccionado'
                      : "Elige un cliente..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clientes.length === 0 ? (
                    <SelectItem value="_no_clientes" disabled>
                      No hay clientes disponibles
                    </SelectItem>
                  ) : (
                    clientes.map(cliente => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nombre}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={isProcessingClientAssignment || !selectedExistingClient}
                onClick={handleAssignExistingClient}
                className="w-full mt-2"
              >
                {isProcessingClientAssignment ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-transparent rounded-full mr-2"></div>
                    Asignando...
                  </>
                ) : (
                  'Asignar Cliente Seleccionado'
                )}
              </Button>
            </div>

            {/* Sección B: Crear Cliente Nuevo (solo si no tiene clienteId) */}
            {!pedidoForClient?.clienteId && (
              <>
                <div className="my-4 border-t border-gray-200 relative">
                  <span className="absolute -top-3 bg-white px-2 text-xs text-gray-500 left-1/2 -translate-x-1/2">
                    O Crear Cliente Nuevo
                  </span>
                </div>

                <div className="grid gap-2">
                  <Label>Nombre / Razón Social *</Label>
                  <Input
                    value={pedidoForClient?.nombre || ''}
                    onChange={(e) =>
                      setPedidoForClient({ ...pedidoForClient, nombre: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={pedidoForClient?.email || ''}
                      onChange={(e) =>
                        setPedidoForClient({ ...pedidoForClient, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Teléfono</Label>
                    <Input
                      type="tel"
                      value={pedidoForClient?.telefono || ''}
                      onChange={(e) =>
                        setPedidoForClient({ ...pedidoForClient, telefono: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>CUIT</Label>
                    <Input
                      value={pedidoForClient?.cuit || ''}
                      placeholder="Sin CUIT cargado"
                      onChange={(e) =>
                        setPedidoForClient({ ...pedidoForClient, cuit: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Fecha Recordatorio</Label>
                    <Input
                      type="datetime-local"
                      value={pedidoForClient?.fechaRecordatorio || ''}
                      onChange={(e) =>
                        setPedidoForClient({ ...pedidoForClient, fechaRecordatorio: e.target.value })
                      }
                    />
                  </div>
                </div>

                <Button
                  className="bg-blue-600 hover:bg-blue-700 w-full"
                  disabled={isProcessingClientAssignment || !pedidoForClient?.nombre}
                  onClick={handleCreateAndAssignNewClient}
                >
                  {isProcessingClientAssignment ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Creando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Crear y Asignar Nuevo
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPedidoForClient(null);
              setSelectedExistingClient(null);
            }}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Pedido */}
      <Dialog open={!!pedidoToEdit} onOpenChange={(open) => {
        if (!open) {
          setPedidoToEdit(null);
          setNuevaAnotacion('');
        }
      }}>
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
            <div className="grid gap-2 sm:col-span-2">
              <Label>Historial de Notas</Label>
              <div className="flex flex-col gap-2 w-full rounded-md border bg-slate-50 p-3 h-[200px] overflow-y-auto">
                {(!pedidoToEdit?.notas || !Array.isArray(pedidoToEdit.notas) || pedidoToEdit.notas.length === 0) && (
                  <div className="text-sm text-slate-400 italic">No hay notas registradas.</div>
                )}
                {Array.isArray(pedidoToEdit?.notas) && pedidoToEdit.notas.map((nota: any, idx: number) => (
                  <div key={idx} className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-blue-600 uppercase">{nota.usuario || 'Sistema'}</span>
                      <span className="text-[10px] text-slate-400">{new Date(nota.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{nota.texto}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Agregar nueva anotación</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                placeholder="Escribe una nueva nota aquí..."
                value={nuevaAnotacion}
                onChange={e => setNuevaAnotacion(e.target.value)}
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
                  const payloadUpdate = { ...pedidoToEdit };
                  if (nuevaAnotacion.trim() !== "") {
                    payloadUpdate.nuevaNota = nuevaAnotacion.trim();
                  }

                  await api.patch(`/pedidos/${pedidoToEdit.id}`, payloadUpdate);
                  fetchPedidos();
                  setPedidoToEdit(null);
                  setNuevaAnotacion('');
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
            // 1. Preparar items con subtotal calculado para la Base de Datos
            const itemsConSubtotal = data.items.map((item: any) => {
              const cantidad = typeof item.cantidad === 'number' ? item.cantidad : 0;
              const descuento = typeof item.descuento === 'number' ? item.descuento : 0;
              const precio = item.articulo?.precio || 0;
              const subtotal = (precio * cantidad) * (1 - descuento / 100);
              return { ...item, cantidad, descuento, subtotal };
            });

            // 2. Sanitizar datos (el backend rechaza teléfonos con espacios o símbolos)
            const payload = {
              nombre: data.nombre || data.nombreCliente || 'Sin nombre',
              clienteId: data.clienteId || null,
              email: data.email?.trim() || null,
              telefono: data.telefono ? data.telefono.replace(/\D/g, '') : null, // Mantiene SOLO números puros
              cuit: data.cuit?.trim() || null,
              tag: data.tag || 'COTIZADO',
              items: itemsConSubtotal,
              subtotal: data.subtotal || 0,
              impuestos: data.impuestos || 0,
              total: data.total || 0,
              moneda: data.moneda || 'ARS',
              mensaje: data.mensaje || "Cotización guardada en el sistema."
            };

            // 3. Enviar a la API
            await api.post('/pedidos', payload);
            fetchPedidos();
            setIsCotizadorOpen(false);
          } catch (error: any) {
            console.error('Error guardando pedido:', error.response?.data || error);
            // Mostrar el error exacto que devuelve el backend en la notificación
            toast.error(error.response?.data?.error || 'Error al guardar el pedido');
            throw error;
          }
        }}
      />
    </div>
  );
}