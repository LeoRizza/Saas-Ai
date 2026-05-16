import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, ShoppingCart } from "lucide-react";
import { useSalesStore } from "../../store/useSalesStore";
import { useClientStore } from "../../store/useClientStore";
import { useInventoryStore } from "../../store/useInventoryStore";
import { useInventariosStore } from "../../store/useInventariosStore";
import { useAuthStore } from "../../store/useAuthStore";
import { RolUsuario } from "../../types";
import { useNavigate } from "react-router-dom";
import { api } from "../../config/axios";
import toast from 'react-hot-toast';

export default function Sales() {
  const navigate = useNavigate();
  const { ventas, addVenta, fetchVentas, isLoading: isLoadingVentas } = useSalesStore();
  const { clientes, fetchClientes } = useClientStore();
  const { articulos, fetchInventory } = useInventoryStore();
  const { inventarios, fetchInventarios } = useInventariosStore();
  const { user, empresa, token } = useAuthStore();
  const isCaja = user?.rol === RolUsuario.CAJA;

  useEffect(() => {
    fetchVentas();
    fetchInventory();
    fetchClientes();
    fetchInventarios();
  }, [fetchVentas, fetchInventory, fetchClientes, fetchInventarios]);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Form states
  const [clienteId, setClienteId] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [descuento, setDescuento] = useState<number | "">(0);
  const [tipoDescuento, setTipoDescuento] = useState<"fijo" | "porcentaje">("fijo");
  const [recargo, setRecargo] = useState<number | "">(0);
  const [tipoRecargo, setTipoRecargo] = useState<"fijo" | "porcentaje">("fijo");

  const [items, setItems] = useState<{
    productoId: string;
    productoNombre: string;
    cantidadUnidades: number;
    cantidadKilos?: number;
    inventarioId: string;
    precioUnitario: number;
    subtotal: number;
  }[]>([]);

  // Current item being added
  const [currentInventarioId, setCurrentInventarioId] = useState<string>(() => localStorage.getItem('lastInventarioId') || "");
  const [currentProductoId, setCurrentProductoId] = useState("");
  const [currentUnidades, setCurrentUnidades] = useState<number | "">("");
  const [currentKilos, setCurrentKilos] = useState<number | "">("");
  const [barcode, setBarcode] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<any>(null);
  const [isSendingTicket, setIsSendingTicket] = useState(false);
  const [isFacturando, setIsFacturando] = useState(false);

  // SAFE IDs
  const safeClienteId = clientes.some(c => c.id === clienteId) ? clienteId : undefined;
  const safeInventarioId = inventarios.some(i => i.id === currentInventarioId) ? currentInventarioId : undefined;
  const articulosDisponibles = articulos.filter(a => a.inventarioId === safeInventarioId);
  const safeProductoId = articulosDisponibles.some(a => a.id === currentProductoId) ? currentProductoId : undefined;

  let filteredVentas = ventas
    .filter(v => v.empresaId === empresa?.id)
    .filter(v =>
      (v.numeroFactura || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.clienteNombre || v.cliente?.nombre || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

  if (isCaja) {
    filteredVentas = filteredVentas.slice(0, 10);
  }

  const totalGenerado = filteredVentas.reduce((acc, venta) => acc + (venta.montoTotal || venta.montoFactura || 0), 0);

  const subtotalCarrito = items.reduce((acc, item) => acc + item.subtotal, 0);

  // Cálculo de descuento según tipo
  const descuentoCalculado = tipoDescuento === 'porcentaje'
    ? subtotalCarrito * ((Number(descuento) || 0) / 100)
    : (Number(descuento) || 0);

  // Cálculo de recargo según tipo
  const recargoCalculado = tipoRecargo === 'porcentaje'
    ? subtotalCarrito * ((Number(recargo) || 0) / 100)
    : (Number(recargo) || 0);

  const totalEnVivo = Math.max(0, subtotalCarrito - descuentoCalculado + recargoCalculado);

  const openNewModal = () => {
    setClienteId("");
    setNumeroFactura("");
    setDescuento(0);
    setTipoDescuento("fijo");
    setRecargo(0);
    setTipoRecargo("fijo");
    setItems([]);
    setCurrentProductoId("");
    setCurrentUnidades("");
    setCurrentKilos("");
    setBarcode("");
    setIsNewModalOpen(true);
  };

  const openViewModal = (venta: any) => {
    setSelectedVenta(venta);
    setIsViewModalOpen(true);
  };

  const handleInventarioChange = (val: string) => {
    setCurrentInventarioId(val);
    localStorage.setItem('lastInventarioId', val);
    setCurrentProductoId("");
  };

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcode.trim() !== '') {
      e.preventDefault();
      if (!safeInventarioId) {
        toast.error("Seleccione un inventario de origen primero.");
        return;
      }
      const code = barcode.trim();
      const found = articulosDisponibles.find(a => a.codigoBarras === code);

      if (found) {
        const cantidadPrevia = items.filter(i => i.productoId === found.id).reduce((acc, item) => acc + item.cantidadUnidades, 0);

        if (cantidadPrevia + 1 > found.stockUnidades) {
          toast.error(`Stock insuficiente para ${found.nombre}. Disp: ${found.stockUnidades}u`);
          return;
        }

        const precio = found.precio || 0;
        setItems([...items, {
          productoId: found.id,
          productoNombre: found.nombre,
          cantidadUnidades: 1,
          inventarioId: safeInventarioId,
          precioUnitario: precio,
          subtotal: 1 * precio
        }]);
        setBarcode("");
        toast.success(`Agregado: ${found.nombre}`);
      } else {
        toast.error("Artículo no encontrado con ese código de barras.");
      }
    }
  };

  const handleAddItem = () => {
    if (!safeInventarioId) {
      toast.error("Seleccione un inventario de origen.");
      return;
    }
    if (!safeProductoId) {
      toast.error("Seleccione un artículo.");
      return;
    }

    const producto = articulosDisponibles.find(p => p.id === safeProductoId);
    if (!producto) return;

    const u = Number(currentUnidades);
    const k = Number(currentKilos);

    if (isNaN(u) || isNaN(k) || u < 0 || k < 0 || (u === 0 && k === 0)) {
      toast.error("Ingrese una cantidad válida mayor a cero (Unidades o Kilos).");
      return;
    }

    const cantidadPreviaUnidades = items.filter(i => i.productoId === safeProductoId).reduce((acc, item) => acc + item.cantidadUnidades, 0);
    const cantidadPreviaKilos = items.filter(i => i.productoId === safeProductoId).reduce((acc, item) => acc + (item.cantidadKilos || 0), 0);

    const totalUnidades = cantidadPreviaUnidades + u;
    const totalKilos = cantidadPreviaKilos + k;

    if (u > 0 && totalUnidades > producto.stockUnidades) {
      toast.error(`Stock insuficiente. Ya hay ${cantidadPreviaUnidades}u en carrito. Disp: ${producto.stockUnidades}u`);
      return;
    }

    if (k > 0 && totalKilos > producto.stockKilos) {
      toast.error(`Stock insuficiente. Ya hay ${cantidadPreviaKilos}kg en carrito. Disp: ${producto.stockKilos}kg`);
      return;
    }

    const precio = producto.precio || 0;
    const cantidadCalculo = u > 0 ? u : k;
    const subtotal = cantidadCalculo * precio;

    setItems([...items, {
      productoId: safeProductoId,
      productoNombre: producto.nombre,
      cantidadUnidades: u,
      cantidadKilos: k > 0 ? k : undefined,
      inventarioId: safeInventarioId,
      precioUnitario: precio,
      subtotal: subtotal
    }]);

    setCurrentProductoId("");
    setCurrentUnidades("");
    setCurrentKilos("");
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!safeClienteId) {
      toast.error("Debe seleccionar un cliente.");
      return;
    }
    if (items.length === 0) {
      toast.error("Debe agregar al menos un producto a la venta.");
      return;
    }

    const cliente = clientes.find(c => c.id === safeClienteId);
    if (!cliente) return;

    setIsSubmitting(true);
    try {
      const response = await api.post('/ventas', {
        clienteId: safeClienteId,
        usuarioId: user?.id || "unknown",
        empresaId: empresa?.id || 'empresa-1',
        numeroFactura: numeroFactura || null,
        descuento: Number(descuento) || 0,
        tipoDescuento,
        recargo: Number(recargo) || 0,
        tipoRecargo,
        // FIX APLICADO: Traducimos 'productoId' a 'articuloId' para que el backend lo entienda
        items: items.map(item => ({
          articuloId: item.productoId,
          cantidadUnidades: item.cantidadUnidades,
          cantidadKilos: item.cantidadKilos,
          inventarioId: item.inventarioId,
          precioUnitario: item.precioUnitario,
          subtotal: item.subtotal
        }))
      });

      const nuevaVenta = response.data;

      // FIX APLICADO: Eliminados el 'id' y el 'createdAt' que causaban el error rojo en TypeScript
      addVenta({
        numeroFactura: nuevaVenta.numeroFactura,
        montoFactura: nuevaVenta.montoTotal,
        montoTotal: nuevaVenta.montoTotal,
        descuento: nuevaVenta.descuento,
        clienteId: safeClienteId,
        clienteNombre: cliente.nombre,
        items: items,
        usuarioId: user?.id || "unknown",
        empresaId: empresa?.id || 'empresa-1'
      });

      fetchVentas();
      fetchInventory();

      setIsNewModalOpen(false);
      toast.success("Venta registrada con éxito 🎉");
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || 'Ocurrió un error al registrar la venta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTicket = async () => {
    if (!selectedVenta) return;
    setIsSendingTicket(true);
    try {
      await api.post(`/ventas/${selectedVenta.id}/ticket`, {});
      toast.success("Ticket enviado exitosamente por correo.");
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ocurrió un error al enviar el ticket.');
    } finally {
      setIsSendingTicket(false);
    }
  };

  const handleEmitirFactura = async (ventaId: string) => {
    setIsFacturando(true);
    try {
      await new Promise(r => setTimeout(r, 2000));
      toast.success('Factura emitida exitosamente (Simulación)');
    } finally {
      setIsFacturando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Ventas</h2>
          <p className="text-muted-foreground">Registro y gestión de ventas.</p>
        </div>
        <div className="flex items-center gap-4">
          {!isCaja && (
            <div className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-semibold">
              Total Generado: ${totalGenerado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
          )}
          <Button className="gap-2" onClick={openNewModal}>
            <Plus className="h-4 w-4" />
            Nueva Venta
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Historial de Ventas</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar factura o cliente..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingVentas ? (
            <div className="py-8 text-center text-muted-foreground">Cargando ventas...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Nº Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVentas.map((venta: any) => (
                  <TableRow key={venta.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openViewModal(venta)}>
                    <TableCell>{new Date(venta.createdAt || venta.fecha || Date.now()).toLocaleDateString('es-AR')}</TableCell>
                    <TableCell className="font-medium">{venta.numeroFactura}</TableCell>
                    <TableCell>{venta.cliente?.nombre || venta.clienteNombre}</TableCell>
                    <TableCell className="font-semibold text-primary">
                      {venta.montoTotal > 0 || venta.montoFactura > 0 ? `$${(venta.montoTotal || venta.montoFactura).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                    </TableCell>
                    <TableCell>
                      {venta.descuento > 0 ? `$${venta.descuento.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                    </TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {venta.items.map((item: any, idx: number) => (
                          <li key={idx}>
                            {item.cantidadUnidades > 0 ? `${item.cantidadUnidades}x ` : ''}
                            {item.articulo?.nombre || item.productoNombre}
                            {item.cantidadKilos ? ` (${item.cantidadKilos}kg)` : ''}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredVentas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron ventas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Nueva Venta */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Nueva Venta</DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                {/* FIX APLICADO: Agregamos || "" para proteger a TypeScript */}
                <Select value={safeClienteId || ""} onValueChange={(v) => setClienteId(v || "")}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Seleccionar cliente...">
                      {safeClienteId ? clientes.find(c => c.id === safeClienteId)?.nombre : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.filter(c => c.empresaId === empresa?.id).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nº Remito / Interno (Opcional)</Label>
                <Input
                  placeholder="Ej: 0001-00001234"
                  value={numeroFactura}
                  onChange={e => setNumeroFactura(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Descuento - Opcional</Label>
                <div className="flex gap-2">
                  <Select value={tipoDescuento} onValueChange={(v) => setTipoDescuento((v ?? "fijo") as "fijo" | "porcentaje")}>
                    <SelectTrigger className="w-20 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fijo">$</SelectItem>
                      <SelectItem value="porcentaje">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="0"
                    className="flex-1"
                    value={descuento}
                    onChange={e => setDescuento(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Recargo (tarjeta, etc.) - Opcional</Label>
                <div className="flex gap-2">
                  <Select value={tipoRecargo} onValueChange={(v) => setTipoRecargo((v ?? "fijo") as "fijo" | "porcentaje")}>
                    <SelectTrigger className="w-20 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fijo">$</SelectItem>
                      <SelectItem value="porcentaje">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="0"
                    className="flex-1"
                    value={recargo}
                    onChange={e => setRecargo(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Agregar Artículos
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-muted/30 p-4 rounded-lg">
                <div className="md:col-span-3 space-y-2">
                  <Label>Inventario Origen</Label>
                  {/* FIX APLICADO: Agregamos || "" para proteger a TypeScript */}
                  <Select value={safeInventarioId || ""} onValueChange={(v) => handleInventarioChange(v || "")}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Seleccionar...">
                        {safeInventarioId ? inventarios.find(i => i.id === safeInventarioId)?.nombre : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {inventarios.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>{inv.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-3 space-y-2">
                  <Label>Código de Barras</Label>
                  <Input
                    placeholder="Escanear..."
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    onKeyDown={handleBarcodeScan}
                  />
                </div>

                <div className="md:col-span-6 space-y-2">
                  <Label>Artículo (Búsqueda manual)</Label>
                  {/* FIX APLICADO: Agregamos || "" para proteger a TypeScript */}
                  <Select
                    value={safeProductoId || ""}
                    onValueChange={(v) => setCurrentProductoId(v || "")}
                    disabled={!safeInventarioId}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder={safeInventarioId ? "Seleccionar artículo..." : "Seleccione inventario primero"}>
                        {safeProductoId ? articulosDisponibles.find(a => a.id === safeProductoId)?.nombre : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {articulosDisponibles.length === 0 ? (
                        <div className="p-3 text-sm text-center text-muted-foreground">No hay productos disponibles</div>
                      ) : (
                        articulosDisponibles.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nombre} (${a.precio} - Disp: {a.stockUnidades}u / {a.stockKilos}kg)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-4 space-y-2">
                  <Label>Unidades</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={currentUnidades}
                    onChange={e => setCurrentUnidades(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                <div className="md:col-span-4 space-y-2">
                  <Label>Kilos</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={currentKilos}
                    onChange={e => setCurrentKilos(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                <div className="md:col-span-4">
                  <Button type="button" className="w-full" onClick={handleAddItem}>
                    Agregar al Carrito
                  </Button>
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <div className="border rounded-lg overflow-hidden mt-4">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Artículo</TableHead>
                      <TableHead className="text-right">Precio U.</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.productoNombre}</TableCell>
                          <TableCell className="text-right">${item.precioUnitario.toLocaleString('es-AR')}</TableCell>
                          <TableCell className="text-right">
                            {item.cantidadUnidades > 0 ? `${item.cantidadUnidades}u` : `${item.cantidadKilos}kg`}
                          </TableCell>
                          <TableCell className="text-right font-semibold">${item.subtotal.toLocaleString('es-AR')}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(idx)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between border-t pt-4 mt-2 gap-4">
            <div className="text-left space-y-1">
              <p className="text-sm text-muted-foreground">Subtotal: ${subtotalCarrito.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
              {descuentoCalculado > 0 && (
                <p className="text-sm text-green-600">- Descuento: ${descuentoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
              )}
              {recargoCalculado > 0 && (
                <p className="text-sm text-orange-600">+ Recargo: ${recargoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
              )}
              <p className="text-2xl font-bold text-primary">
                Total: ${totalEnVivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setIsNewModalOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button className="w-full sm:w-auto" onClick={handleSave} disabled={isSubmitting || items.length === 0}>
                {isSubmitting ? "Guardando..." : "Registrar Venta"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ver Venta */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
          </DialogHeader>
          {selectedVenta && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-semibold">{selectedVenta.cliente?.nombre || selectedVenta.clienteNombre}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nº Factura</p>
                  <p className="font-semibold">{selectedVenta.numeroFactura}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fecha</p>
                  <p className="font-semibold">
                    {new Date(selectedVenta.createdAt || selectedVenta.fecha || Date.now()).toLocaleDateString('es-AR')} {new Date(selectedVenta.createdAt || selectedVenta.fecha || Date.now()).toLocaleTimeString('es-AR')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monto Cobrado</p>
                  <p className="font-semibold text-primary">
                    {selectedVenta.montoTotal > 0 || selectedVenta.montoFactura > 0 ? `$${(selectedVenta.montoTotal || selectedVenta.montoFactura).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'Sin registrar'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Artículos</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artículo</TableHead>
                      <TableHead className="text-right">Precio U.</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Kilos</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedVenta.items.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>{item.articulo?.nombre || item.productoNombre}</TableCell>
                        <TableCell className="text-right">${(item.precioUnitario || 0).toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right">{item.cantidadUnidades > 0 ? item.cantidadUnidades : '-'}</TableCell>
                        <TableCell className="text-right">{item.cantidadKilos || '-'}</TableCell>
                        <TableCell className="text-right font-semibold">${(item.subtotal || 0).toLocaleString('es-AR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
            <div className="flex gap-2 w-full sm:w-auto">
              {selectedVenta?.facturada ? (
                <Button variant="secondary" disabled className="w-full sm:w-auto">
                  ✓ {selectedVenta.numeroFactura} - CAE: {selectedVenta.cae || 'Pendiente'}
                </Button>
              ) : (
                <Button
                  onClick={() => handleEmitirFactura(selectedVenta?.id)}
                  disabled={isFacturando || !selectedVenta?.id}
                  className="w-full sm:w-auto gap-2"
                >
                  {isFacturando ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Emitiendo...
                    </>
                  ) : (
                    '📋 Emitir Factura'
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleSendTicket}
                disabled={isSendingTicket}
                className="w-full sm:w-auto"
              >
                {isSendingTicket ? "Enviando..." : "📧 Enviar Ticket"}
              </Button>
            </div>
            <Button onClick={() => setIsViewModalOpen(false)} className="w-full sm:w-auto">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}