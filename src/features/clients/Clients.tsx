import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, MessageCircle, FileText, Upload, FileSpreadsheet, Info, Download, ArrowUpDown } from "lucide-react";
import { useClientStore } from "../../store/useClientStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useInventoryStore } from "../../store/useInventoryStore";
import CotizadorModal from "../shared/components/CotizadorModal";
import toast from 'react-hot-toast';
import { api } from '../../config/axios';

// Helper function: Obtiene el estado del recordatorio comparando fechas (ignorando hora)
function getRecordatorioStatus(fecha: string | null | undefined): 'VENCIDO' | 'HOY' | 'PENDIENTE' | 'SIN_FECHA' {
  if (!fecha) {
    return 'SIN_FECHA';
  }

  const recordatorioDate = new Date(fecha);
  const today = new Date();

  // Reseteamos la hora a las 00:00:00 para comparar solo el día
  recordatorioDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const timeDiff = recordatorioDate.getTime() - today.getTime();

  if (timeDiff < 0) {
    return 'VENCIDO';
  } else if (timeDiff === 0) {
    return 'HOY';
  } else {
    return 'PENDIENTE';
  }
}

// Helper function: Valida si una fecha cae dentro de un rango específico
function isDateInRange(fecha: string | null | undefined, range: 'TODOS' | 'HOY' | 'ESTA_SEMANA' | 'ESTE_MES'): boolean {
  if (!fecha) return false;
  if (range === 'TODOS') return true;

  const recordatorioDate = new Date(fecha);
  const today = new Date();

  recordatorioDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const timeDiff = recordatorioDate.getTime() - today.getTime();
  const daysFromToday = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

  if (range === 'HOY') {
    return daysFromToday === 0;
  } else if (range === 'ESTA_SEMANA') {
    return daysFromToday >= 0 && daysFromToday <= 7;
  } else if (range === 'ESTE_MES') {
    // Obtener el último día del mes
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDayOfMonth.setHours(0, 0, 0, 0);
    const daysToEndOfMonth = Math.ceil((lastDayOfMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysFromToday >= 0 && daysFromToday <= daysToEndOfMonth;
  }

  return true;
}

// Helper function: Renderiza el badge de estado del recordatorio
function RecordatorioBadge({ status }: { status: 'VENCIDO' | 'HOY' | 'PENDIENTE' | 'SIN_FECHA' }) {
  const statusStyles = {
    VENCIDO: 'bg-red-100 text-red-800 border border-red-200',
    HOY: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    PENDIENTE: 'bg-green-100 text-green-800 border border-green-200',
    SIN_FECHA: 'bg-gray-100 text-gray-600 border border-gray-200'
  };

  const statusLabels = {
    VENCIDO: 'VENCIDO',
    HOY: 'HOY',
    PENDIENTE: 'PENDIENTE',
    SIN_FECHA: '-'
  };

  if (status === 'SIN_FECHA') {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}



export default function Clients() {
  const { empresa, token } = useAuthStore();
  const { clientes, addCliente, updateCliente, deleteCliente, fetchClientes, isLoading } = useClientStore();
  const { articulos, fetchInventory } = useInventoryStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState('TODOS');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [dateRange, setDateRange] = useState<'TODOS' | 'HOY' | 'ESTA_SEMANA' | 'ESTE_MES'>('TODOS');

  // Estado para el modal de cotización
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedClientForQuote, setSelectedClientForQuote] = useState<any>(null);

  // Estado para el modal de importación CSV
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchClientes();
    fetchInventory();
  }, [fetchClientes, fetchInventory]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editingRecordatorio, setEditingRecordatorio] = useState<string | null>(null);

  // Búsqueda avanzada: nombre, razonSocial, CUIT y etiqueta (tag)
  const clientesBySearch = clientes
    .filter(c => c.empresaId === empresa?.id)
    .filter(c =>
      c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.razonSocial && c.razonSocial.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.cuit && c.cuit.includes(searchTerm)) ||
      (c.tag && c.tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  // Filtro por estado de recordatorio y rango de fechas con ordenamiento
  let filteredClientes = clientesBySearch
    // 1. Filtro por estado de recordatorio
    .filter(c => {
      if (filterStatus === 'TODOS') return true;

    const status = getRecordatorioStatus(c.fechaRecordatorio);

      switch (filterStatus) {
        case 'HOY':
          return status === 'HOY';
        case 'VENCIDO':
          return status === 'VENCIDO';
        case 'PENDIENTE':
          return status === 'PENDIENTE';
        default:
          return true;
      }
    })
    // 2. Filtro por rango de fechas
    .filter(c => {
      if (dateRange === 'TODOS') return true;
      return isDateInRange(c.fechaRecordatorio, dateRange);
    });

  // 3. Ordenamiento por fecha de recordatorio
  if (sortOrder !== null) {
    filteredClientes = filteredClientes.sort((a, b) => {
      const dateA = a.fechaRecordatorio ? new Date(a.fechaRecordatorio).getTime() : null;
      const dateB = b.fechaRecordatorio ? new Date(b.fechaRecordatorio).getTime() : null;

      // Nulls al final
      if (dateA === null && dateB === null) return 0;
      if (dateA === null) return 1;
      if (dateB === null) return -1;

      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }

  const openNewModal = () => {
    setFormData({
      nombre: "",
      razonSocial: "",
      email: "",
      telefono: "",
      direccion: "",
      cuit: "",
      condicionIva: "Responsable Inscripto",
      fechaRecordatorio: "",
      tag: "" // NUEVO
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (cliente: any) => {
    setSelectedItem(cliente);
    setFormData({ ...cliente });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const openDeleteModal = (cliente: any) => {
    setSelectedItem(cliente);
    setIsDeleteModalOpen(true);
  };

  const openViewModal = (cliente: any) => {
    setSelectedItem(cliente);
    setIsViewModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nombre) {
      toast.error("El nombre es obligatorio");
      return;
    }

    const dataToSave = {
      ...formData,
      razonSocial: formData.razonSocial?.trim() ? formData.razonSocial : formData.nombre,
      fechaRecordatorio: formData.fechaRecordatorio ? new Date(formData.fechaRecordatorio).toISOString() : null
    };

    try {
      if (isEditing) {
        await updateCliente(selectedItem.id, dataToSave);
      } else {
        await addCliente({ ...dataToSave, empresaId: empresa?.id || 'empresa-1' });
      }
      await fetchClientes();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error al guardar:", error);
      toast.error("Ocurrió un error al guardar el cliente. Revisa los datos.");
    }
  };

  const confirmDelete = () => {
    deleteCliente(selectedItem.id);
    setIsDeleteModalOpen(false);
    setSelectedItem(null);
  };

  const handleWhatsApp = (telefono: string, nombreCliente: string) => {
    // Validar que exista teléfono
    if (!telefono || !telefono.trim()) {
      toast.error("El cliente no tiene teléfono registrado");
      return;
    }

    // Limpiar el número: remover espacios, guiones, paréntesis, dejando solo números
    const numeroLimpio = telefono.replace(/[\s\-()]/g, "");

    // Validar que el número no esté vacío después de limpiar
    if (!numeroLimpio) {
      toast.error("El teléfono no contiene números válidos");
      return;
    }

    // Construir mensaje dinámico
    const mensaje = `Hola ${nombreCliente}, te contacto de ${empresa?.nombre || "nuestra empresa"}.`;

    // Codificar el mensaje para que funcione correctamente en la URL
    const mensajeCodificado = encodeURIComponent(mensaje);

    // Construir y abrir el enlace de WhatsApp
    const urlWhatsApp = `https://wa.me/${numeroLimpio}?text=${mensajeCodificado}`;
    window.open(urlWhatsApp, "_blank");
  };

  const openQuoteModal = (cliente: any) => {
    setSelectedClientForQuote(cliente);
    setIsQuoteModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const headers = "nombre,razon_social,email,telefono,direccion,cuit,condicion_iva,tag,comentarios\n";
    const sample = "Juan Perez,Juan Perez SRL,juan@gmail.com,3412345678,Calle Falsa 123,20304050601,Responsable Inscripto,VIP,Cliente mayorista\n";
    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_clientes.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      toast.error("Seleccione un archivo CSV");
      return;
    }
    const formData = new FormData();
    formData.append("file", csvFile);
    setIsUploading(true);
    try {
      await api.post('/clientes/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success("Clientes importados exitosamente");
      setIsCsvModalOpen(false);
      setCsvFile(null);
      fetchClientes();
    } catch (error: any) {
      console.error("Error importando CSV:", error);
      toast.error(error.response?.data?.message || "Error al importar el archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuickRecordatorioUpdate = async (clienteId: string, newDate: string) => {
    try {
      await updateCliente(clienteId, {
        fechaRecordatorio: newDate ? new Date(newDate).toISOString() : null as any
      });
      await fetchClientes();
      setEditingRecordatorio(null);
      toast.success("Recordatorio actualizado");
    } catch (error) {
      console.error("Error al actualizar recordatorio:", error);
      toast.error("Error al actualizar el recordatorio");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clientes</h2>
          <p className="text-muted-foreground">Gestión de clientes y distribuidores.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIsCsvModalOpen(true)}>
            <Upload className="h-4 w-4" />
            Importar CSV
          </Button>
          <Button className="gap-2" onClick={openNewModal}>
            <Plus className="h-4 w-4" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Listado de Clientes</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center gap-4 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar nombre, razón social, CUIT o etiqueta..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value ?? "TODOS")}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrar por recordatorio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los clientes</SelectItem>
                  <SelectItem value="HOY">Llamar Hoy</SelectItem>
                  <SelectItem value="VENCIDO">Recordatorios Vencidos</SelectItem>
                  <SelectItem value="PENDIENTE">Próximos a llamar</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={(value) => setDateRange(value as 'TODOS' | 'HOY' | 'ESTA_SEMANA' | 'ESTE_MES')}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Rango de fechas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todas las fechas</SelectItem>
                  <SelectItem value="HOY">Hoy</SelectItem>
                  <SelectItem value="ESTA_SEMANA">Esta Semana</SelectItem>
                  <SelectItem value="ESTE_MES">Este Mes</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex gap-2"
                onClick={() => setSortOrder(prev => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null)}
                title="Ordenar por fecha de recordatorio"
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortOrder === 'asc' && '↑'}
                {sortOrder === 'desc' && '↓'}
              </Button>
            </div>
          </div>
          <div className="flex sm:hidden gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={() => setSortOrder(prev => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null)}
              title="Ordenar por fecha de recordatorio"
            >
              <ArrowUpDown className="h-4 w-4" />
              Ordenar {sortOrder === 'asc' && '(Antiguo→Nuevo)'}
              {sortOrder === 'desc' && '(Nuevo→Antiguo)'}
              {sortOrder === null && 'por fecha'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando clientes...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre / Razón Social</TableHead>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-2 hover:text-foreground cursor-pointer transition-colors text-muted-foreground hover:bg-muted rounded px-2 py-1"
                      onClick={() => setSortOrder(prev => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null)}
                      title="Ordenar por fecha de recordatorio"
                    >
                      Recordatorio
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClientes.map((cliente) => (
                  <TableRow key={cliente.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openViewModal(cliente)}>
                    <TableCell className="font-medium">{cliente.nombre}</TableCell>
                    <TableCell>
                      {cliente.tag ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-200">
                          {cliente.tag}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell>{cliente.telefono}</TableCell>
                    <TableCell>{cliente.email}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {editingRecordatorio === cliente.id ? (
                        <Input
                          type="datetime-local"
                          autoFocus
                          defaultValue={cliente.fechaRecordatorio ? new Date(cliente.fechaRecordatorio).toISOString().slice(0, 16) : ""}
                          onBlur={(e) => {
                            if (e.target.value) {
                              handleQuickRecordatorioUpdate(cliente.id, e.target.value);
                            } else {
                              setEditingRecordatorio(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value) {
                              handleQuickRecordatorioUpdate(cliente.id, e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                              setEditingRecordatorio(null);
                            }
                          }}
                          className="h-8 text-xs"
                        />
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
                          onClick={() => setEditingRecordatorio(cliente.id)}
                        >
                          <RecordatorioBadge status={getRecordatorioStatus(cliente.fechaRecordatorio)} />
                          {cliente.fechaRecordatorio && (
                            <span className="text-sm">{new Date(cliente.fechaRecordatorio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        onClick={() => openQuoteModal(cliente)}
                        title="Crear cotización"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:text-green-600 hover:bg-green-50 hover:scale-130 transition-transform"
                        onClick={() => handleWhatsApp(cliente.telefono, cliente.nombre)}
                        title="Enviar WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(cliente)}>
                        <Edit className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => openDeleteModal(cliente)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredClientes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No se encontraron clientes.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Formulario Cliente */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[50dvw]">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre || ""}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="razonSocial">Razón Social</Label>
                <Input
                  id="razonSocial"
                  value={formData.razonSocial || ""}
                  onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                  placeholder="Igual al nombre"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  value={formData.cuit || ""}
                  onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="condicionIva">Condición IVA</Label>
                <Input
                  id="condicionIva"
                  value={formData.condicionIva || ""}
                  onChange={(e) => setFormData({ ...formData, condicionIva: e.target.value })}
                />
              </div>
            </div>

            {/* NUEVO CAMPO TAG */}
            <div className="grid gap-2 border-t pt-4">
              <Label htmlFor="tag" className="text-blue-600 font-semibold">Etiqueta (Tag)</Label>
              <Input
                id="tag"
                value={formData.tag || ""}
                onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                placeholder="Ej: potencial, vip, regular..."
                className="border-blue-200"
              />
              <span className="text-xs text-muted-foreground">Útil para filtrar y categorizar clientes en el buscador.</span>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email" type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono || ""}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                value={formData.direccion || ""}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fechaRecordatorio">Fecha y Hora de Recordatorio</Label>
              <Input
                id="fechaRecordatorio"
                type="datetime-local"
                value={formData.fechaRecordatorio || ""}
                onChange={(e) => setFormData({ ...formData, fechaRecordatorio: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="comentarios">Comentarios</Label>
              <textarea
                id="comentarios"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.comentarios || ""}
                onChange={(e) => setFormData({ ...formData, comentarios: e.target.value })}
                maxLength={500}
                placeholder="Comentarios adicionales..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{isEditing ? "Guardar Cambios" : "Crear Cliente"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Eliminar Cliente */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>¿Estás seguro que deseas eliminar al cliente <strong>{selectedItem?.nombre}</strong>?</p>
            <p className="text-sm text-muted-foreground mt-2">Esta acción no se puede deshacer.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ver Cliente */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="sm:max-w-[50dvw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Cliente</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-6">
            {/* Encabezado con nombre y etiqueta */}
            <div className="border-b pb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold">{selectedItem?.nombre}</h3>
                {selectedItem?.tag && (
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border border-blue-200">
                    {selectedItem.tag}
                  </span>
                )}
              </div>
              {selectedItem?.razonSocial && selectedItem.razonSocial !== selectedItem.nombre && (
                <p className="text-muted-foreground mt-2 text-sm">Razón Social: {selectedItem.razonSocial}</p>
              )}
            </div>

            {/* Información de Identificación */}
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Identificación</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-2 rounded-lg">
                  <span className="text-xs text-muted-foreground block mb-1">CUIT</span>
                  <span className="font-medium text-sm">{selectedItem?.cuit || '-'}</span>
                </div>
                <div className="bg-muted/30 p-2 rounded-lg">
                  <span className="text-xs text-muted-foreground block mb-1">Condición IVA</span>
                  <span className="font-medium text-sm">{selectedItem?.condicionIva || '-'}</span>
                </div>
              </div>
            </div>

            {/* Información de Contacto */}
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Contacto</h4>
              <div className="space-y-3">
                <div className="bg-muted/30 p-2 rounded-lg">
                  <span className="text-xs text-muted-foreground block mb-1">Email</span>
                  <span className="font-medium text-sm">{selectedItem?.email || '-'}</span>
                </div>
                <div className="bg-muted/30 p-2 rounded-lg">
                  <span className="text-xs text-muted-foreground block mb-1">Teléfono</span>
                  <span className="font-medium text-sm">{selectedItem?.telefono || '-'}</span>
                </div>
                <div className="bg-muted/30 p-2 rounded-lg">
                  <span className="text-xs text-muted-foreground block mb-1">Dirección</span>
                  <span className="font-medium text-sm">{selectedItem?.direccion || '-'}</span>
                </div>
              </div>
            </div>

            {/* Información de Recordatorio */}
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Recordatorio</h4>
              <div className="bg-muted/30 p-2 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Fecha y Hora</span>
                    <span className="font-medium text-sm">
                      {selectedItem?.fechaRecordatorio
                        ? new Date(selectedItem.fechaRecordatorio).toLocaleString('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })
                        : '-'}
                    </span>
                  </div>
                  {selectedItem?.fechaRecordatorio && (
                    <div>
                      <RecordatorioBadge status={getRecordatorioStatus(selectedItem.fechaRecordatorio)} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Comentarios */}
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Comentarios</h4>
              <div className="bg-muted/30 p-2 rounded-lg min-h-[80px]">
                {selectedItem?.comentarios && selectedItem.comentarios.trim() ? (
                  <p className="font-medium text-sm whitespace-pre-wrap text-foreground">{selectedItem.comentarios}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sin comentarios</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => openEditModal(selectedItem)} className="mr-auto">
              <Edit className="h-4 w-4 mr-2" /> Editar
            </Button>
            <Button onClick={() => setIsViewModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cotizador Rápido (Componente Reutilizable) */}
      <CotizadorModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        clientePreseleccionado={selectedClientForQuote}
      />

      {/* Modal CSV */}
      <Dialog open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
              Importar Clientes (CSV)
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-sm text-blue-800 shadow-sm">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Formato requerido</p>
                <p>Sube un archivo .CSV con la información de tus clientes. Si un email o teléfono ya existe, esa fila se omitirá.</p>
                <Button variant="link" onClick={handleDownloadTemplate} className="p-0 h-auto font-bold mt-2 text-blue-700">
                  <Download className="h-4 w-4 mr-1" /> Descargar plantilla de ejemplo
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-base font-medium">Selecciona el archivo</Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 bg-slate-50 hover:bg-slate-100 transition-colors text-center relative cursor-pointer">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <Upload className={`h-8 w-8 ${csvFile ? 'text-green-500' : 'text-slate-400'}`} />
                  <span className="font-medium text-slate-700">
                    {csvFile ? csvFile.name : "Haz clic o arrastra tu archivo .CSV aquí"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setIsCsvModalOpen(false)} disabled={isUploading}>
              Cancelar
            </Button>
            <Button onClick={handleCsvUpload} disabled={!csvFile || isUploading} className="min-w-[120px] bg-green-600 hover:bg-green-700">
              {isUploading ? "Importando..." : "Subir Clientes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}