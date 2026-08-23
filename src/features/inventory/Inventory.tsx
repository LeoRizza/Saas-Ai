import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Plus, Search, ImageIcon, Edit, Trash2, Upload, X, Video, Download, Info, FileSpreadsheet, ArrowRightLeft, Trash, ArrowUpDown, ArrowUp, ArrowDown, Filter, PackageSearch, Loader2, PackagePlus } from "lucide-react";
import { useInventoryStore } from "../../store/useInventoryStore";
import { useInventariosStore } from "../../store/useInventariosStore";
import { useAuthStore } from "../../store/useAuthStore";
import { RolUsuario } from "../../types";
import axios from "axios";
import toast from 'react-hot-toast';
import imageCompression from 'browser-image-compression';

export default function Inventory() {
  const { empresa, user } = useAuthStore();
  const isVendedor = user?.rol === RolUsuario.VENDEDOR;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInventarioId, setSelectedInventarioId] = useState<string>(() => {
    return localStorage.getItem('lastSelectedInventarioId') || '';
  });

  useEffect(() => {
    if (selectedInventarioId) {
      localStorage.setItem('lastSelectedInventarioId', selectedInventarioId);
    }
  }, [selectedInventarioId]);

  const {
    articulos,
    isLoading: isLoadingArticulos,
    fetchInventory,
    addArticulo,
    updateArticulo,
    deleteArticulo,
    ingresarStock
  } = useInventoryStore();

  const {
    inventarios,
    fetchInventarios,
    isLoading: isLoadingInventarios
  } = useInventariosStore();

  useEffect(() => {
    fetchInventarios();
    fetchInventory();
  }, [fetchInventarios, fetchInventory]);

  useEffect(() => {
    if (inventarios.length > 0 && !selectedInventarioId) {
      setSelectedInventarioId(inventarios[0].id);
    }
  }, [inventarios, selectedInventarioId]);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
  const [ingresoData, setIngresoData] = useState({ unidades: 0, kilos: 0 });

  const [formData, setFormData] = useState<any>({});
  const [adjustData, setAdjustData] = useState<any>({});
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [transferData, setTransferData] = useState({ destId: '', unidades: 0, kilos: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'nombre', direction: 'asc' });

  // Tipos numéricos para determinar dirección inicial al cambiar de columna
  const numericFields = new Set(['stockUnidades', 'stockKilos', 'unidadesPorCaja', 'precio', 'costo']);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');

  const categoriasUnicas = Array.from(
    new Set(
      articulos
        .filter(a => a.empresaId === empresa?.id && a.inventarioId === selectedInventarioId)
        .map(a => a.categoria)
        .filter(Boolean)
    )
  ).sort();

  const filteredArticulos = articulos
    .filter(a => a.empresaId === empresa?.id && a.inventarioId === selectedInventarioId)
    .filter(a => (a.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(a => categoryFilter === 'all' || a.categoria === categoryFilter)
    .filter(a => {
      if (stockFilter === 'low') return a.stockUnidades < 5 && a.stockUnidades > 0;
      if (stockFilter === 'out') return a.stockUnidades === 0;
      return true;
    })
    .sort((a, b) => {
      const key = sortConfig.key as keyof typeof a;
      
      // Obtener valores con validación para null/undefined
      let aVal = a[key];
      let bVal = b[key];
      
      // Tratar null/undefined como valor por defecto
      if (aVal === null || aVal === undefined) {
        aVal = typeof bVal === 'number' ? 0 : '';
      }
      if (bVal === null || bVal === undefined) {
        bVal = typeof aVal === 'number' ? 0 : '';
      }

      // Comparación de strings con case-insensitive
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }

      // Comparación de números
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

  const requestSort = (key: string) => {
    setSortConfig(prev => {
      // Si es la misma columna, alterna entre asc y desc
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      
      // Si es una columna diferente, comienza en desc para números, asc para texto
      const isNumericField = numericFields.has(key);
      return {
        key,
        direction: isNumericField ? 'desc' : 'asc'
      };
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredArticulos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredArticulos.map(a => a.id));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, isAdjust = false) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentState = isAdjust ? adjustData : formData;
    const currentFiles = currentState.imagenFiles || [];
    const currentPreviews = currentState.imagenPreviews || [];

    const maxImages = empresa?.config?.maxImagenes || 4;
    const existingDbImages = isAdjust ? (currentState.imagenes?.length || 0) : 0;
    const availableSlots = maxImages - (currentFiles.length + existingDbImages);

    if (availableSlots <= 0) {
      toast.error(`Límite máximo alcanzado (${maxImages} imágenes en total). Borra alguna para subir nuevas.`);
      return;
    }

    const newFiles = files.slice(0, availableSlots);

    // Comprimir imágenes antes de agregarlas
    const compressedFiles: File[] = [];
    for (const file of newFiles) {
      try {
        const options = {
          maxWidthOrHeight: 800,
          useWebWorker: true,
          fileType: 'image/webp' as const,
        };
        const compressedFile = await imageCompression(file, options);
        compressedFiles.push(compressedFile);
      } catch (error) {
        console.error('Error comprimiendo imagen:', error);
        toast.error('Error al comprimir una imagen');
        return;
      }
    }

    const updatedFiles = [...currentFiles, ...compressedFiles];

    const newPreviewsPromises = compressedFiles.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    const newPreviewsData = await Promise.all(newPreviewsPromises);
    const updatedPreviews = [...currentPreviews, ...newPreviewsData];

    if (isAdjust) {
      setAdjustData({ ...currentState, imagenFiles: updatedFiles, imagenPreviews: updatedPreviews });
    } else {
      setFormData({ ...currentState, imagenFiles: updatedFiles, imagenPreviews: updatedPreviews });
    }

    e.target.value = '';
  };

  const removePendingImage = (index: number, isAdjust = false) => {
    const currentState = isAdjust ? adjustData : formData;
    const newFiles = [...(currentState.imagenFiles || [])];
    const newPreviews = [...(currentState.imagenPreviews || [])];

    newFiles.splice(index, 1);
    newPreviews.splice(index, 1);

    if (isAdjust) {
      setAdjustData({ ...currentState, imagenFiles: newFiles, imagenPreviews: newPreviews });
    } else {
      setFormData({ ...currentState, imagenFiles: newFiles, imagenPreviews: newPreviews });
    }
  };

  const removeExistingImage = (indexToRemove: number) => {
    setAdjustData((prev: any) => ({
      ...prev,
      imagenes: prev.imagenes.filter((_: any, idx: number) => idx !== indexToRemove)
    }));
  };

  const openNewModal = () => {
    if (!selectedInventarioId) {
      toast.error("Por favor seleccione un inventario primero.");
      return;
    }
    setFormData({
      nombre: "",
      categoria: "General",
      subcategoria: "",
      descripcion: "",
      longDescription: "",
      sku: "",
      serie: "",
      codigoBarras: "",
      videoUrl: "",
      stockKilos: 0,
      stockUnidades: 0,
      unidadesPorCaja: 1,
      costo: 0,
      precio: 0,
      imagenFiles: [],
      imagenPreviews: []
    });
    setIsNewModalOpen(true);
  };

  const handleSaveNew = () => {
    if (!formData.nombre) {
      toast.error("El nombre es obligatorio");
      return;
    }

    const data = new FormData();
    data.append('nombre', formData.nombre);
    data.append('categoria', formData.categoria || 'General');
    if (formData.subcategoria) data.append('subcategoria', formData.subcategoria);
    if (formData.descripcion) data.append('descripcion', formData.descripcion);
    if (formData.longDescription) data.append('longDescription', formData.longDescription);
    if (formData.sku) data.append('sku', formData.sku);
    if (formData.serie) data.append('serie', formData.serie);
    if (formData.codigoBarras) data.append('codigoBarras', formData.codigoBarras);
    if (formData.videoUrl) data.append('videoUrl', formData.videoUrl);
    data.append('precio', formData.precio || 0);
    data.append('costo', formData.costo || 0);
    data.append('empresaId', empresa?.id || 'empresa-1');
    data.append('inventarioId', selectedInventarioId);
    data.append('stockUnidades', formData.stockUnidades || 0);
    data.append('stockKilos', formData.stockKilos || 0);
    data.append('unidadesPorCaja', formData.unidadesPorCaja || 1);

    if (formData.imagenFiles) {
      formData.imagenFiles.forEach((file: File) => {
        data.append('imagenes', file);
      });
    }

    addArticulo(data as any);
    setIsNewModalOpen(false);
  };

  const openAdjustModal = (item: any) => {
    setSelectedItem(item);
    setAdjustData({ ...item, imagenFiles: [], imagenPreviews: [] });
    setIsAdjustModalOpen(true);
  };

  const handleSaveAdjust = () => {
    const data = new FormData();
    data.append('nombre', adjustData.nombre);
    data.append('categoria', adjustData.categoria || 'General');
    if (adjustData.subcategoria) data.append('subcategoria', adjustData.subcategoria);
    if (adjustData.descripcion) data.append('descripcion', adjustData.descripcion);
    if (adjustData.longDescription) data.append('longDescription', adjustData.longDescription);
    if (adjustData.sku) data.append('sku', adjustData.sku);
    if (adjustData.serie) data.append('serie', adjustData.serie);
    if (adjustData.codigoBarras) data.append('codigoBarras', adjustData.codigoBarras);
    if (adjustData.videoUrl) data.append('videoUrl', adjustData.videoUrl);
    data.append('precio', adjustData.precio || 0);
    data.append('costo', adjustData.costo || 0);
    data.append('stockUnidades', adjustData.stockUnidades || 0);
    data.append('stockKilos', adjustData.stockKilos || 0);
    data.append('unidadesPorCaja', adjustData.unidadesPorCaja || 1);

    data.append('retainedImages', JSON.stringify(adjustData.imagenes || []));

    if (adjustData.imagenFiles) {
      adjustData.imagenFiles.forEach((file: File) => {
        data.append('imagenes', file);
      });
    }

    updateArticulo(selectedItem.id, data as any);
    setIsAdjustModalOpen(false);
  };

  const openDeleteModal = (item: any) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  const openViewModal = (item: any) => {
    setSelectedItem(item);
    setIsViewModalOpen(true);
  };

  const openTransferModal = (item: any) => {
    setSelectedItem(item);
    // Seleccionar por defecto el primer inventario distinto al actual
    const firstOtherInv = inventarios.find(i => i.id !== selectedInventarioId)?.id || '';
    setTransferData({ destId: firstOtherInv, unidades: 0, kilos: 0 });
    setIsTransferModalOpen(true);
  };

  const openIngresoModal = (item: any) => {
    setSelectedItem(item);
    setIngresoData({ unidades: 0, kilos: 0 });
    setIsIngresoModalOpen(true);
  };

  const confirmDelete = () => {
    deleteArticulo(selectedItem.id);
    setIsDeleteModalOpen(false);
    setSelectedItem(null);
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      toast.error("Seleccione un archivo CSV");
      return;
    }
    if (!selectedInventarioId) {
      toast.error("Seleccione un inventario destino");
      return;
    }

    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("inventarioId", selectedInventarioId);

    setIsUploading(true);
    try {
      const token = useAuthStore.getState().token;
      await axios.post('/api/inventory/bulk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      toast.success("Importación exitosa");
      setIsCsvModalOpen(false);
      setCsvFile(null);
      fetchInventory();
    } catch (error: any) {
      console.error("Error importando CSV:", error);
      toast.error(error.response?.data?.message || "Error al importar el archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!selectedInventarioId) {
      toast.error("Por favor seleccione un inventario primero.");
      return;
    }

    try {
      const toastId = toast.loading("Generando archivo...");
      const token = useAuthStore.getState().token;
      const invName = inventarios.find(i => i.id === selectedInventarioId)?.nombre || 'inventario';
      const response = await axios.get('/api/inventory/export?inventarioId=' + selectedInventarioId, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invName}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Inventario exportado correctamente", { id: toastId });
    } catch (error) {
      console.error("Error exportando CSV:", error);
      toast.error("Error al exportar el inventario");
    }
  };

  const handleTransfer = async () => {
    if (!transferData.destId) return toast.error("Seleccione un destino");
    if (transferData.unidades <= 0 && transferData.kilos <= 0) return toast.error("Ingrese una cantidad a transferir");
    try {
      const toastId = toast.loading("Transfiriendo...");
      const token = useAuthStore.getState().token;
      await axios.post('/api/inventory/transfer', {
        articuloOrigenId: selectedItem.id,
        inventarioDestinoId: transferData.destId,
        unidades: Number(transferData.unidades),
        kilos: Number(transferData.kilos)
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Transferencia exitosa", { id: toastId });
      setIsTransferModalOpen(false);
      fetchInventory();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Error al transferir");
    }
  };

  const handleIngresoStock = async () => {
    if (!selectedItem?.id) {
      return toast.error('Error: Artículo no seleccionado');
    }
    if (ingresoData.unidades <= 0 && ingresoData.kilos <= 0) {
      return toast.error("Ingrese una cantidad a agregar");
    }
    try {
      const toastId = toast.loading("Ingresando stock...");
      await ingresarStock(selectedItem.id, {
        unidades: Number(ingresoData.unidades),
        kilos: Number(ingresoData.kilos)
      });
      toast.success("Ingreso de compra registrado", { id: toastId });
      setIsIngresoModalOpen(false);
      fetchInventory();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Error al ingresar stock");
    }
  };

  const handleInventarioChange = (val: string | null) => {
    setSelectedInventarioId(val || '');
  };

  const handleBulkDelete = () => {
    if (selectedIds.length > 20) {
      toast.error('Por seguridad, solo podés eliminar hasta 20 artículos a la vez');
      return;
    }

    const itemNames = filteredArticulos
      .filter(a => selectedIds.includes(a.id))
      .map(a => a.nombre)
      .join(', ');

    if (!window.confirm(`¿Está seguro que desea eliminar estos ${selectedIds.length} artículo(s)?\n\n${itemNames}`)) {
      return;
    }

    const deletePromises = selectedIds.map(id =>
      new Promise((resolve, reject) => {
        try {
          deleteArticulo(id);
          resolve(id);
        } catch (error) {
          reject(error);
        }
      })
    );

    toast.promise(
      Promise.all(deletePromises),
      {
        loading: `Eliminando ${selectedIds.length} artículo(s)...`,
        success: `Se eliminaron ${selectedIds.length} artículo(s) correctamente`,
        error: 'Error al eliminar artículos'
      }
    );

    Promise.all(deletePromises)
      .then(() => {
        setSelectedIds([]);
        fetchInventory();
      })
      .catch((error) => {
        console.error('Error en eliminación masiva:', error);
      });
  };



  if (isLoadingInventarios || isLoadingArticulos) {
    return (
      <div className="flex items-center justify-center" style={{ height: '60vh' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-lg font-medium text-slate-700">Sincronizando inventario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Inventario</h2>
        {!isVendedor && (
          <div className="flex space-x-2">
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => setIsCsvModalOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV
            </Button>
            <Button onClick={openNewModal}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Artículo
            </Button>
          </div>
        )}
      </div>

      <Card className="w-full overflow-hidden">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Artículos</CardTitle>
            {selectedIds.length > 0 && !isVendedor && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                className="text-white bg-red-600 hover:bg-red-700"
              >
                <Trash className="mr-2 h-4 w-4" />
                Eliminar {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-4 mt-4">
            {/* Selector de Inventario */}
            <div className="w-full">
              <Label className="mb-2 block text-sm font-medium">Seleccionar Inventario</Label>
              <Select value={selectedInventarioId} onValueChange={handleInventarioChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un inventario">
                    {inventarios.find(i => i.id === selectedInventarioId)?.nombre || "Seleccione un inventario"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {inventarios.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Búsqueda y Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label className="mb-2 block text-sm font-medium">Buscar Artículo</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Por nombre, SKU, código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">Categoría</Label>
                <Select value={categoryFilter} onValueChange={(val: string | null) => setCategoryFilter(val || 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categoriasUnicas.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">Stock</Label>
                <Select value={stockFilter} onValueChange={(val: string | null) => setStockFilter(val || 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo el stock</SelectItem>
                    <SelectItem value="low">Stock bajo (&lt;5)</SelectItem>
                    <SelectItem value="out">Agotado (0)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Botón Limpiar Filtros */}
            {(categoryFilter !== 'all' || stockFilter !== 'all' || searchTerm) && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCategoryFilter('all');
                    setStockFilter('all');
                    setSearchTerm('');
                  }}
                  className="text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {inventarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay inventarios creados. Por favor, contacte a un administrador.
            </div>
          ) : (
            <div className="w-full max-h-[65vh] overflow-auto rounded-md border shadow-sm">
            <Table className="w-full min-w-[1100px] relative">
              <TableHeader className="sticky top-0 z-20 bg-white outline outline-1 outline-slate-200">
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === filteredArticulos.length}
                      onChange={handleSelectAll}
                      className="rounded"
                      title="Seleccionar/Deseleccionar todos"
                    />
                  </TableHead>
                  <TableHead>Imagen</TableHead>
                  <TableHead className="cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => requestSort('nombre')}>
                    <div className="flex items-center gap-2">
                      Nombre
                      {sortConfig.key === 'nombre' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 text-blue-600" /> : <ArrowDown className="h-4 w-4 text-blue-600" />) : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => requestSort('categoria')}>
                    <div className="flex items-center gap-2">
                      Categoría
                      {sortConfig.key === 'categoria' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 text-blue-600" /> : <ArrowDown className="h-4 w-4 text-blue-600" />) : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => requestSort('stockUnidades')}>
                    <div className="flex items-center gap-2">
                      Stock (Unidades)
                      {sortConfig.key === 'stockUnidades' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 text-blue-600" /> : <ArrowDown className="h-4 w-4 text-blue-600" />) : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => requestSort('stockKilos')}>
                    <div className="flex items-center gap-2">
                      Stock (Kilos)
                      {sortConfig.key === 'stockKilos' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 text-blue-600" /> : <ArrowDown className="h-4 w-4 text-blue-600" />) : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => requestSort('unidadesPorCaja')}>
                    <div className="flex items-center gap-2">
                      Unidades x Caja
                      {sortConfig.key === 'unidadesPorCaja' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 text-blue-600" /> : <ArrowDown className="h-4 w-4 text-blue-600" />) : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => requestSort('precio')}>
                    <div className="flex items-center gap-2">
                      Precio
                      {sortConfig.key === 'precio' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 text-blue-600" /> : <ArrowDown className="h-4 w-4 text-blue-600" />) : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap w-[200px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticulos.map((item) => (
                  <TableRow
                    key={item.id}
                    onClick={() => openViewModal(item)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelectOne(item.id)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell>
                      {item.imagenes && item.imagenes.length > 0 ? (
                        <img src={item.imagenes[0]} alt={item.nombre} className="w-10 h-10 object-cover rounded border" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 flex items-center justify-center rounded border">
                          <ImageIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.nombre}</TableCell>
                    <TableCell>{item.categoria}</TableCell>
                    <TableCell>{item.stockUnidades}</TableCell>
                    <TableCell>{item.stockKilos}</TableCell>
                    <TableCell>{item.unidadesPorCaja}</TableCell>
                    <TableCell>${item.precio || 0}</TableCell>
                    <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        {!isVendedor && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openIngresoModal(item)} title="Ingresar Compra">
                              <PackagePlus className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openTransferModal(item)} title="Transferir stock">
                              <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openAdjustModal(item)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openDeleteModal(item)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredArticulos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="flex flex-col items-center justify-center py-12 px-4">
                        <div className="bg-slate-100 rounded-full p-4 mb-4">
                          <PackageSearch className="h-10 w-10 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No hay artículos para mostrar</h3>
                        <p className="text-sm text-slate-600 text-center max-w-xs">
                          {searchTerm || categoryFilter !== 'all' || stockFilter !== 'all'
                            ? "No se encontraron resultados para esta búsqueda o filtros aplicados. Intenta ajustarlos."
                            : "Este inventario está vacío. ¡Agrega el primer artículo para comenzar!"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Nuevo Artículo */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Nuevo Artículo</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general" className="w-full mt-2 flex flex-col flex-1">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="stock">Stock y Precios</TabsTrigger>
              <TabsTrigger value="multimedia">Multimedia</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto py-4">
              {/* TAB: General */}
              <TabsContent value="general" className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Nombre</Label>
                  <Input
                    value={formData.nombre || ''}
                    onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Categoría</Label>
                    <Input
                      value={formData.categoria || ''}
                      onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Subcategoría</Label>
                    <Input
                      value={formData.subcategoria || ''}
                      onChange={e => setFormData({ ...formData, subcategoria: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Descripción Corta</Label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.descripcion || ''}
                    onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Breve descripción del producto..."
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Descripción Larga</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.longDescription || ''}
                    onChange={e => setFormData({ ...formData, longDescription: e.target.value })}
                    placeholder="Descripción detallada, características, especificaciones técnicas..."
                  />
                </div>
              </TabsContent>

              {/* TAB: Stock y Precios */}
              <TabsContent value="stock" className="grid gap-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Código de Barras</Label>
                    <Input
                      value={formData.codigoBarras || ''}
                      onChange={e => setFormData({ ...formData, codigoBarras: e.target.value })}
                      placeholder="EAN/UPC"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>SKU</Label>
                    <Input
                      value={formData.sku || ''}
                      onChange={e => setFormData({ ...formData, sku: e.target.value })}
                      placeholder="Código único"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Serie</Label>
                    <Input
                      value={formData.serie || ''}
                      onChange={e => setFormData({ ...formData, serie: e.target.value })}
                      placeholder="Nº de serie"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Stock (Unidades)</Label>
                    <Input
                      type="number"
                      value={formData.stockUnidades ?? ''}
                      onChange={e => setFormData({ ...formData, stockUnidades: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Stock (Kilos)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.stockKilos ?? ''}
                      onChange={e => setFormData({ ...formData, stockKilos: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Unidades por Caja</Label>
                    <Input
                      type="number"
                      value={formData.unidadesPorCaja ?? ''}
                      onChange={e => setFormData({ ...formData, unidadesPorCaja: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Costo ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.costo ?? ''}
                      onChange={e => setFormData({ ...formData, costo: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Precio Venta ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.precio ?? ''}
                      onChange={e => setFormData({ ...formData, precio: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB: Multimedia */}
              <TabsContent value="multimedia" className="grid gap-4">
                <div className="grid gap-2">
                  <Label>URL de Video</Label>
                  <Input
                    value={formData.videoUrl || ''}
                    onChange={e => setFormData({ ...formData, videoUrl: e.target.value })}
                    placeholder="https://youtube.com/watch?v=... o enlace directo al video"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Imágenes (Máx 4)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageChange(e, false)}
                  />
                  {formData.imagenPreviews && formData.imagenPreviews.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {formData.imagenPreviews.map((src: string, idx: number) => (
                        <div key={idx} className="relative group">
                          <img src={src} alt="Preview" className="w-16 h-16 object-cover rounded border shadow-sm" />
                          <button
                            type="button"
                            onClick={() => removePendingImage(idx, false)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setIsNewModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveNew}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ajustar Artículo */}
      <Dialog open={isAdjustModalOpen} onOpenChange={setIsAdjustModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Ajustar Artículo</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general" className="w-full mt-2 flex flex-col flex-1">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="stock">Stock y Precios</TabsTrigger>
              <TabsTrigger value="multimedia">Multimedia</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto py-4">
              {/* TAB: General */}
              <TabsContent value="general" className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Nombre</Label>
                  <Input
                    value={adjustData.nombre || ''}
                    onChange={e => setAdjustData({ ...adjustData, nombre: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Categoría</Label>
                    <Input
                      value={adjustData.categoria || ''}
                      onChange={e => setAdjustData({ ...adjustData, categoria: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Subcategoría</Label>
                    <Input
                      value={adjustData.subcategoria || ''}
                      onChange={e => setAdjustData({ ...adjustData, subcategoria: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Descripción Corta</Label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={adjustData.descripcion || ''}
                    onChange={e => setAdjustData({ ...adjustData, descripcion: e.target.value })}
                    placeholder="Breve descripción del producto..."
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Descripción Larga</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={adjustData.longDescription || ''}
                    onChange={e => setAdjustData({ ...adjustData, longDescription: e.target.value })}
                    placeholder="Descripción detallada, características, especificaciones técnicas..."
                  />
                </div>
              </TabsContent>

              {/* TAB: Stock y Precios */}
              <TabsContent value="stock" className="grid gap-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Código de Barras</Label>
                    <Input
                      value={adjustData.codigoBarras || ''}
                      onChange={e => setAdjustData({ ...adjustData, codigoBarras: e.target.value })}
                      placeholder="EAN/UPC"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>SKU</Label>
                    <Input
                      value={adjustData.sku || ''}
                      onChange={e => setAdjustData({ ...adjustData, sku: e.target.value })}
                      placeholder="Código único"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Serie</Label>
                    <Input
                      value={adjustData.serie || ''}
                      onChange={e => setAdjustData({ ...adjustData, serie: e.target.value })}
                      placeholder="Nº de serie"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Stock (Unidades)</Label>
                    <Input
                      type="number"
                      value={adjustData.stockUnidades ?? ''}
                      onChange={e => setAdjustData({ ...adjustData, stockUnidades: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Stock (Kilos)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={adjustData.stockKilos ?? ''}
                      onChange={e => setAdjustData({ ...adjustData, stockKilos: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Unidades por Caja</Label>
                    <Input
                      type="number"
                      value={adjustData.unidadesPorCaja ?? ''}
                      onChange={e => setAdjustData({ ...adjustData, unidadesPorCaja: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Costo ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={adjustData.costo ?? ''}
                      onChange={e => setAdjustData({ ...adjustData, costo: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Precio Venta ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={adjustData.precio ?? ''}
                      onChange={e => setAdjustData({ ...adjustData, precio: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB: Multimedia */}
              <TabsContent value="multimedia" className="grid gap-4">
                <div className="grid gap-2">
                  <Label>URL de Video</Label>
                  <Input
                    value={adjustData.videoUrl || ''}
                    onChange={e => setAdjustData({ ...adjustData, videoUrl: e.target.value })}
                    placeholder="https://youtube.com/watch?v=... o enlace directo al video"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Imágenes Actuales del Sistema</Label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {adjustData.imagenes && adjustData.imagenes.map((img: string, idx: number) => (
                      <div key={idx} className="relative group">
                        <img src={img} className="w-16 h-16 object-cover rounded border opacity-80" />
                        <button type="button" onClick={() => removeExistingImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow z-10">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {(!adjustData.imagenes || adjustData.imagenes.length === 0) && (
                      <span className="text-xs text-muted-foreground mt-1">No hay imágenes en la base de datos.</span>
                    )}
                  </div>

                  <Label className="mt-2">Agregar Nuevas Imágenes</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageChange(e, true)}
                  />
                  {adjustData.imagenPreviews && adjustData.imagenPreviews.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {adjustData.imagenPreviews.map((src: string, idx: number) => (
                        <div key={idx} className="relative group">
                          <img src={src} alt="Preview" className="w-16 h-16 object-cover rounded border shadow-sm border-blue-400" />
                          <button
                            type="button"
                            onClick={() => removePendingImage(idx, true)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setIsAdjustModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveAdjust}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Eliminar */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            ¿Está seguro que desea eliminar el artículo "{selectedItem?.nombre}"? Esta acción no se puede deshacer.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ver Artículo */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalles del Artículo</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              <div>
                <div className="mb-4">
                  <h3 className="text-xl font-bold">{selectedItem.nombre}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs font-medium border">{selectedItem.categoria}</span>
                    {selectedItem.subcategoria && (
                      <span className="bg-blue-50 text-blue-800 px-2 py-1 rounded text-xs font-medium border border-blue-200">{selectedItem.subcategoria}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-muted/30 p-3 rounded-md text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedItem.descripcion || 'Sin descripción corta.'}
                  </div>
                  {selectedItem.longDescription && (
                    <div className="bg-slate-50 p-3 rounded-md text-sm text-slate-700 whitespace-pre-wrap border max-h-60 overflow-y-auto">
                      <span className="font-medium text-xs text-slate-500 block mb-1">Descripción Detallada:</span>
                      {selectedItem.longDescription}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <p><span className="font-medium">SKU:</span> {selectedItem.sku || 'N/A'}</p>
                    <p><span className="font-medium">Serie:</span> {selectedItem.serie || 'N/A'}</p>
                    <p><span className="font-medium">Cód. Barras:</span> {selectedItem.codigoBarras || 'N/A'}</p>
                  </div>
                  <p><span className="font-medium">Stock Unidades:</span> {selectedItem.stockUnidades}</p>
                  <p><span className="font-medium">Stock Kilos:</span> {selectedItem.stockKilos}</p>
                  <p><span className="font-medium">Unidades por Caja:</span> {selectedItem.unidadesPorCaja}</p>
                  <p><span className="font-medium">Precio:</span> ${selectedItem.precio || 0}</p>
                  <p><span className="font-medium">Última actualización:</span> {new Date(selectedItem.updatedAt).toLocaleDateString()}</p>
                  {selectedItem.videoUrl && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md border border-blue-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Video className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-sm text-blue-800">Video del producto:</span>
                      </div>
                      <a
                        href={selectedItem.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
                      >
                        {selectedItem.videoUrl}
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Imágenes</Label>
                <div className="grid grid-cols-2 gap-2">
                  {selectedItem.imagenes && selectedItem.imagenes.length > 0 ? (
                    selectedItem.imagenes.map((img: string, idx: number) => (
                      <img key={idx} src={img} alt={`Imagen ${idx + 1}`} className="w-full h-32 object-cover rounded border" />
                    ))
                  ) : (
                    <div className="col-span-2 h-32 bg-gray-100 flex items-center justify-center rounded border">
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                      <span className="ml-2 text-sm text-gray-500">Sin imágenes</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsViewModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Transferir */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Stock: {selectedItem?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="bg-slate-50 p-3 rounded text-sm border">
              Stock actual: <b>{selectedItem?.stockUnidades} u. / {selectedItem?.stockKilos} kg.</b>
            </div>
            <div className="grid gap-2">
              <Label>Inventario Destino</Label>
              {inventarios.length <= 1 ? (
                <div className="text-sm text-amber-700 font-medium p-2 bg-amber-50 rounded border border-amber-200">
                  Debes crear al menos otro inventario (sucursal/depósito) para poder realizar transferencias.
                </div>
              ) : (
                <Select value={transferData.destId || ""} onValueChange={(v: string | null) => setTransferData({ ...transferData, destId: v || "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione destino">
                      {transferData.destId ? inventarios.find(i => i.id === transferData.destId)?.nombre : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {inventarios.filter(i => i.id !== selectedInventarioId).map(inv => (
                      <SelectItem key={inv.id} value={inv.id}>{inv.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Unidades a mover</Label>
                <Input type="number" min="0" max={selectedItem?.stockUnidades} value={transferData.unidades} onChange={(e) => setTransferData({ ...transferData, unidades: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Kilos a mover</Label>
                <Input type="number" step="0.01" min="0" max={selectedItem?.stockKilos} value={transferData.kilos} onChange={(e) => setTransferData({ ...transferData, kilos: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} className="bg-blue-600 hover:bg-blue-700">Confirmar Transferencia</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal CSV */}
      <Dialog open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
              Importar Artículos (CSV)
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            {/* Caja de Información */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-sm text-blue-800 shadow-sm">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Formato requerido</p>
                <p>El archivo debe ser un .CSV. Te recomendamos <button onClick={handleExportCSV} className="underline font-medium hover:text-blue-900">Exportar tu inventario actual</button> para usarlo como plantilla.</p>
                <p className="mt-2 text-xs opacity-90">Columnas obligatorias: nombre, precio. (El resto pueden ir vacías).</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-base font-medium">1. ¿A qué sucursal ingresarán?</Label>
              <Select value={selectedInventarioId} onValueChange={handleInventarioChange}>
                <SelectTrigger className="h-12 text-md">
                  <SelectValue placeholder="Seleccione un inventario...">
                    {selectedInventarioId ? inventarios.find(i => i.id === selectedInventarioId)?.nombre : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {inventarios?.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-base font-medium">2. Selecciona el archivo</Label>
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
                  {!csvFile && <span className="text-xs text-slate-500">Tamaño máximo recomendado: 5MB</span>}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setIsCsvModalOpen(false)} disabled={isUploading}>
              Cancelar
            </Button>
            <Button onClick={handleCsvUpload} disabled={!csvFile || isUploading || !selectedInventarioId} className="min-w-[120px] bg-green-600 hover:bg-green-700">
              {isUploading ? "Importando..." : "Subir Inventario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ingreso de Stock */}
      <Dialog open={isIngresoModalOpen} onOpenChange={setIsIngresoModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingresar Compra: {selectedItem?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="bg-slate-50 p-3 rounded text-sm border">
              Stock actual: <b>{selectedItem?.stockUnidades} u. / {selectedItem?.stockKilos} kg.</b>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Unidades a agregar</Label>
                <Input type="number" min="0" value={ingresoData.unidades} onChange={(e) => setIngresoData({ ...ingresoData, unidades: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Kilos a agregar</Label>
                <Input type="number" step="0.01" min="0" value={ingresoData.kilos} onChange={(e) => setIngresoData({ ...ingresoData, kilos: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIngresoModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleIngresoStock} className="bg-green-600 hover:bg-green-700">Confirmar Ingreso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}