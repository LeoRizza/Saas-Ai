import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, Plus, Trash2 } from "lucide-react";
import { useInventoryStore } from "../../store/useInventoryStore";
import { useInventariosStore } from "../../store/useInventariosStore";
import { useAuthStore } from "../../store/useAuthStore";
import { RolUsuario } from "../../types";
import toast from 'react-hot-toast';

export default function Production() {
  const { articulos, registrarProduccion, historialProduccion, fetchHistorialProduccion, fetchInventory } = useInventoryStore();
  const { inventarios, fetchInventarios } = useInventariosStore();
  const { user, empresa } = useAuthStore();
  const isVendedor = user?.rol === RolUsuario.VENDEDOR;

  useEffect(() => {
    fetchHistorialProduccion();
    fetchInventarios();
    fetchInventory();
  }, [fetchHistorialProduccion, fetchInventarios, fetchInventory]);

  const [inventarioOrigenId, setInventarioOrigenId] = useState("");
  const [inventarioDestinoId, setInventarioDestinoId] = useState("");
  const [productoDestinoId, setProductoDestinoId] = useState("");
  const [unidades, setUnidades] = useState("");
  const [peso, setPeso] = useState("");

  const [insumosForm, setInsumosForm] = useState([{ articuloId: "", kilos: "", unidades: "" }]);

  const handleAddInsumo = () => {
    setInsumosForm([...insumosForm, { articuloId: "", kilos: "", unidades: "" }]);
  };

  const handleRemoveInsumo = (index: number) => {
    const newForm = [...insumosForm];
    newForm.splice(index, 1);
    setInsumosForm(newForm);
  };

  const handleInsumoChange = (index: number, field: string, value: string) => {
    const newForm = [...insumosForm];
    newForm[index] = { ...newForm[index], [field]: value };
    setInsumosForm(newForm);
  };

  // Limpiar el selector de producto si cambian el inventario de destino
  useEffect(() => {
    setProductoDestinoId("");
  }, [inventarioDestinoId]);

  // SAFE IDs y Filtros (Evitan el bug visual de Radix UI)
  const safeOrigenId = inventarios.some(i => i.id === inventarioOrigenId) ? inventarioOrigenId : undefined;
  const safeDestinoId = inventarios.some(i => i.id === inventarioDestinoId) ? inventarioDestinoId : undefined;

  const articulosOrigen = articulos.filter(a => a.inventarioId === safeOrigenId);
  const articulosDestino = articulos.filter(a => a.inventarioId === safeDestinoId);

  const safeProductoDestinoId = articulosDestino.some(a => a.id === productoDestinoId) ? productoDestinoId : undefined;
  const filteredHistorial = [...historialProduccion]
    .filter(h => h.empresaId === empresa?.id)
    .sort((a, b) => new Date(b.fecha || Date.now()).getTime() - new Date(a.fecha || Date.now()).getTime());
  const handleSubmit = async () => {
    if (!safeOrigenId || !safeDestinoId) {
      toast.error("Por favor seleccione los inventarios de origen y destino.");
      return;
    }

    if (!safeProductoDestinoId) {
      toast.error("Por favor seleccione el producto a fabricar.");
      return;
    }

    const productoFinal = articulosDestino.find(a => a.id === safeProductoDestinoId);
    if (!productoFinal) return;

    if (!unidades && !peso) {
      toast.error("Por favor ingrese la cantidad de unidades o el peso producido.");
      return;
    }

    const validInsumos = insumosForm.filter(i => i.articuloId && (i.kilos || i.unidades));
    if (validInsumos.length === 0) {
      toast.error("Debe registrar al menos un insumo consumido con cantidad (kilos o unidades).");
      return;
    }

    const parsedInsumos = validInsumos.map(i => ({
      articuloId: i.articuloId,
      kilos: parseFloat(i.kilos) || 0,
      unidades: parseInt(i.unidades) || 0,
    }));

    // --- ESCUDO PROTECTOR LÓGICO AVANZADO ---
    const insumosAcumulados = new Map<string, { unidades: number, kilos: number }>();

    for (const ins of parsedInsumos) {
      if (!insumosAcumulados.has(ins.articuloId)) {
        insumosAcumulados.set(ins.articuloId, { unidades: 0, kilos: 0 });
      }
      const current = insumosAcumulados.get(ins.articuloId)!;
      current.unidades += ins.unidades;
      current.kilos += ins.kilos;
    }

    for (const [id, sumas] of insumosAcumulados.entries()) {
      const articuloDb = articulosOrigen.find(a => a.id === id);
      if (articuloDb) {
        if (sumas.unidades > 0 && sumas.unidades > articuloDb.stockUnidades) {
          toast.error(`Stock insuficiente de insumo: ${articuloDb.nombre}. Requerido: ${sumas.unidades}u, Disp: ${articuloDb.stockUnidades}u`);
          return;
        }
        if (sumas.kilos > 0 && sumas.kilos > articuloDb.stockKilos) {
          toast.error(`Stock insuficiente de insumo: ${articuloDb.nombre}. Requerido: ${sumas.kilos}kg, Disp: ${articuloDb.stockKilos}kg`);
          return;
        }
      }
    }

    try {
      await registrarProduccion(
        productoFinal.nombre,
        parseInt(unidades) || 0,
        parseFloat(peso) || 0,
        parsedInsumos,
        safeOrigenId,
        safeDestinoId
      );

      setProductoDestinoId("");
      setUnidades("");
      setPeso("");
      setInsumosForm([{ articuloId: "", kilos: "", unidades: "" }]);
      toast.success("Producción registrada con éxito. El inventario ha sido actualizado.");
    } catch (error) {
      toast.error("Ocurrió un error al registrar la producción.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Producción</h2>
          <p className="text-muted-foreground">Registrar transformación de insumos a producto terminado.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {!isVendedor && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-blue-500" />
                Registrar Producción
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Inventario Origen (Insumos)</label>
                  {/* FIX APLICADO: Agregado || "" */}
                  <Select value={safeOrigenId} onValueChange={(v) => setInventarioOrigenId(v || "")}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Seleccione...">{safeOrigenId ? inventarios.find(i => i.id === safeOrigenId)?.nombre : null}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {inventarios.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>{inv.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Inventario Destino (Producto)</label>
                  {/* FIX APLICADO: Agregado || "" */}
                  <Select value={safeDestinoId} onValueChange={(v) => setInventarioDestinoId(v || "")}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Seleccione...">{safeDestinoId ? inventarios.find(i => i.id === safeDestinoId)?.nombre : null}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {inventarios.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>{inv.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 border p-3 rounded-lg bg-blue-50/50">
                <label className="text-sm font-semibold text-blue-800">Producto a Fabricar</label>
                {/* FIX APLICADO: Agregado || "" */}
                <Select
                  value={safeProductoDestinoId}
                  onValueChange={(v) => setProductoDestinoId(v || "")}
                  disabled={!safeDestinoId}
                >
                  <SelectTrigger className="border-blue-200 bg-white">
                    <SelectValue placeholder={safeDestinoId ? "Seleccione un producto..." : "Seleccione inventario destino primero"}>{safeProductoDestinoId ? articulosDestino.find(a => a.id === safeProductoDestinoId)?.nombre : null}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {articulosDestino.length === 0 ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">No hay productos en este inventario</div>
                    ) : (
                      articulosDestino.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unidades Producidas</label>
                  <Input
                    type="number"
                    value={unidades}
                    onChange={(e) => setUnidades(e.target.value)}
                    placeholder="Ej: 50"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Peso Total (Kg)</label>
                  <Input
                    type="number"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    placeholder="Ej: 600"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="mt-6 border-t pt-4">
                <h4 className="mb-4 text-sm font-medium text-muted-foreground">Insumos Consumidos</h4>
                <div className="space-y-4">
                  {insumosForm.map((insumoItem, index) => {
                    const safeInsumoId = articulosOrigen.some(a => a.id === insumoItem.articuloId) ? insumoItem.articuloId : undefined;

                    return (
                      <div key={index} className="relative space-y-4 rounded-md border p-4 bg-slate-50/50">
                        {insumosForm.length > 1 && (
                          <button
                            onClick={() => handleRemoveInsumo(index)}
                            className="absolute right-2 top-2 text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Insumo</label>
                          {/* FIX APLICADO: Agregado || "" */}
                          <Select
                            value={safeInsumoId}
                            onValueChange={(val) => handleInsumoChange(index, "articuloId", val || "")}
                            disabled={!safeOrigenId}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder={safeOrigenId ? "Seleccione un insumo..." : "Seleccione inventario origen primero"}>{safeInsumoId ? articulosOrigen.find(a => a.id === safeInsumoId)?.nombre : null}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {articulosOrigen.length === 0 ? (
                                <div className="p-3 text-sm text-center text-muted-foreground">No hay insumos en este inventario</div>
                              ) : (
                                articulosOrigen.map(i => (
                                  <SelectItem key={i.id} value={i.id}>
                                    {i.nombre} (Disp: {i.stockKilos.toLocaleString('es-AR')}kg / {i.stockUnidades.toLocaleString('es-AR')}u)
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Kilos Consumidos</label>
                            <Input
                              type="number"
                              value={insumoItem.kilos}
                              onChange={(e) => handleInsumoChange(index, "kilos", e.target.value)}
                              placeholder="Ej: 610"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Unidades</label>
                            <Input
                              type="number"
                              value={insumoItem.unidades}
                              onChange={(e) => handleInsumoChange(index, "unidades", e.target.value)}
                              placeholder="Ej: 1"
                              min="0"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <Button variant="outline" size="sm" className="w-full" onClick={handleAddInsumo}>
                    <Plus className="mr-2 h-4 w-4" /> Agregar otro insumo
                  </Button>
                </div>
              </div>

              <Button className="w-full mt-6" onClick={handleSubmit}>
                Registrar Producción
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className={isVendedor ? "md:col-span-2" : ""}>
          <CardHeader>
            <CardTitle>Historial de Producción</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredHistorial.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay registros de producción.</p>
              ) : (
                filteredHistorial.map((log: any) => (
                  <div key={log.id} className="flex flex-col space-y-2 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-blue-700">{log.productoNombre}</span>
                      <span className="text-xs text-muted-foreground">{new Date(log.fecha || log.createdAt || Date.now()).toLocaleDateString('es-AR')}</span>
                    </div>
                    {/* Nombres de los Inventarios */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 p-2 rounded-md mt-2">
                      <span>
                        <span className="font-semibold text-slate-600">De:</span>{' '}
                        {inventarios.find(i => i.id === log.inventarioOrigenId)?.nombre || 'Inventario Desconocido'}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span>
                        <span className="font-semibold text-slate-600">Hacia:</span>{' '}
                        {inventarios.find(i => i.id === log.inventarioDestinoId)?.nombre || 'Inventario Desconocido'}
                      </span>
                    </div>
                    <div className="text-sm font-medium">
                      <span className="text-muted-foreground">Producido: </span>
                      <span className="text-green-600">
                        {log.unidades > 0 ? `${log.unidades} unidades ` : ''}
                        {log.peso > 0 ? `/ ${log.peso} kg` : ''}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground font-medium">Insumos Consumidos: </span>
                      <ul className="list-disc list-inside mt-1 text-muted-foreground">
                        {log.insumos.map((i: any, idx: number) => {
                          const insumoReal = articulos.find(a => a.id === i.articuloId);
                          const nombreInsumo = insumoReal ? insumoReal.nombre : "Insumo eliminado/desconocido";

                          return (
                            <li key={idx} className="text-xs">
                              <span className="font-medium text-red-500">
                                {i.kilos > 0 ? `${i.kilos}kg ` : ''}
                                {i.unidades > 0 ? `/ ${i.unidades}u ` : ''}
                              </span>
                              de {nombreInsumo}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                      Registrado por: <span className="font-medium">{log.usuario?.nombre || log.usuarioNombre || log.usuario || 'Usuario Desconocido'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}