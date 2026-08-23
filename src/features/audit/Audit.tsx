import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, Calendar, TrendingUp, Package, Scale, Loader2, FileText, CheckCircle, Calculator, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuditStore } from "../../store/useAuditStore";
import { useInventoryStore } from "../../store/useInventoryStore";
import { useClientStore } from "../../store/useClientStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useSalesStore } from "../../store/useSalesStore";
import axios from "axios";

// Interfaz para las estadísticas del backend
interface StatsResponse {
  periodo: { desde: string; hasta: string };
  resumen: {
    totalVentas: number;
    ingresosBrutos: number;
    totalDescuentos: number;
    totalRecargos: number;
    ingresosNetos: number;
    totalUnidadesVendidas: number;
    totalKilosVendidos: number;
    totalPedidos?: number;
    pedidosCompletados?: number;
    ticketPromedio: number;
  };
  ventasPorDia: { fecha: string; cantidad: number; monto: number }[];
  topProductos: { nombre: string; unidades: number; kilos: number; ingresos: number }[];
  conversion?: {
    porVendedor: { nombre: string; total: number; tasa: number }[];
    topClientes: { nombre: string; total: number; tasa: number }[];
  };
}

export default function Audit() {
  const { logs, meta, fetchLogs } = useAuditStore();
  const { articulos, fetchInventory } = useInventoryStore();
  const { clientes, fetchClientes } = useClientStore();
  const { empresa } = useAuthStore();
  const { ventas, fetchVentas } = useSalesStore();

  // Estados para el selector de fechas
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("mes");
  const [auditPage, setAuditPage] = useState<number>(1);

  // Estados para el control de stock
  const [maxUnidades, setMaxUnidades] = useState<string>("");
  const [maxKilos, setMaxKilos] = useState<string>("");
  const [hideZero, setHideZero] = useState<boolean>(false);
  const [selectedInv, setSelectedInv] = useState<string>("TODOS");
  const [nombresInventarios, setNombresInventarios] = useState<Record<string, string>>({});

  // Estados del Simulador
  const [simArticuloId, setSimArticuloId] = useState<string>("");
  const [simCosto, setSimCosto] = useState<number>(0);
  const [simMarkup, setSimMarkup] = useState<number>(30); // 30% por defecto
  const [simDescuento, setSimDescuento] = useState<number>(0);

  // Estados para filtros de conversión (CRM style)
  const [filtroVendedor, setFiltroVendedor] = useState<string>("TODOS");
  const [filtroClienteConversion, setFiltroClienteConversion] = useState<string>("TODOS");

  // Función para obtener estadísticas del backend
  const fetchStats = useCallback(async (start?: string, end?: string) => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams();
      if (start) params.append("startDate", start);
      if (end) params.append("endDate", end);

      const token = useAuthStore.getState().token;
      const response = await axios.get(`/api/stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error("Error al obtener estadísticas:", error);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Helpers para calcular fechas
  const getToday = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  const getFirstDayOfMonth = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  };

  const getFirstDayOfYear = () => {
    const today = new Date();
    return new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];
  };

  // Handlers para los botones de acceso rápido
  const handlePresetHoy = () => {
    const today = getToday();
    setStartDate(today);
    setEndDate(today);
    setActivePreset("hoy");
    setAuditPage(1);
    fetchStats(today, today);
    fetchLogs({ page: 1, startDate: today, endDate: today });
  };

  const handlePresetMes = () => {
    const start = getFirstDayOfMonth();
    const end = getToday();
    setStartDate(start);
    setEndDate(end);
    setActivePreset("mes");
    setAuditPage(1);
    fetchStats(start, end);
    fetchLogs({ page: 1, startDate: start, endDate: end });
  };

  const handlePresetAnio = () => {
    const start = getFirstDayOfYear();
    const end = getToday();
    setStartDate(start);
    setEndDate(end);
    setActivePreset("anio");
    setAuditPage(1);
    fetchStats(start, end);
    fetchLogs({ page: 1, startDate: start, endDate: end });
  };

  // Handler para cuando el usuario cambia las fechas manualmente
  const handleDateChange = (type: "start" | "end", value: string) => {
    setActivePreset("custom");
    setAuditPage(1);
    if (type === "start") {
      setStartDate(value);
      if (endDate && value) {
        fetchStats(value, endDate);
        fetchLogs({ page: 1, startDate: value, endDate: endDate });
      }
    } else {
      setEndDate(value);
      if (startDate && value) {
        fetchStats(startDate, value);
        fetchLogs({ page: 1, startDate: startDate, endDate: value });
      }
    }
  };

  useEffect(() => {
    // Cargar audit logs con página inicial
    fetchLogs({ page: auditPage });
    fetchClientes();
    fetchVentas();
    fetchInventory(); // FIX: Cargar artículos
    // FIX: Obtener nombres reales de los inventarios
    const token = useAuthStore.getState().token;
    axios.get('/api/inventarios', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const map: Record<string, string> = {};
        res.data.forEach((inv: any) => { map[inv.id] = inv.nombre; });
        setNombresInventarios(map);
      })
      .catch(err => console.error("Error al cargar inventarios:", err));
    // Cargar estadísticas del mes actual al inicio
    handlePresetMes();
  }, [fetchLogs, fetchClientes, fetchVentas, fetchInventory]);

  const filteredLogs = logs.filter(log => log.empresaId === empresa?.id);
  const stockLogs = filteredLogs.filter(log => String(log.tablaAfectada) === 'ARTICULO' || String(log.tablaAfectada) === 'INVENTARIO');
  const clientLogs = filteredLogs.filter(log => String(log.tablaAfectada) === 'CLIENTE');
  const pedidoLogs = filteredLogs.filter(log => String(log.tablaAfectada) === 'PEDIDO');

  const getProductName = (id: string) => {
    const item = articulos.find(a => a.id === id);
    return item?.nombre || `Artículo (${id.substring(0, 8)}...)`;
  };

  const getClientNameFallback = (id: string) => {
    return clientes.find(c => c.id === id)?.nombre || `ID: ${id.substring(0, 8)}...`;
  };

  const formatAction = (accion: string) => {
    switch (String(accion)) {
      case 'PRODUCCION': return "Producción";
      case 'VENTA': return "Venta";
      case 'AJUSTE_MANUAL': return "Ajuste Manual";
      case 'MODIFICACION_CLIENTE': return "Modificación Cliente";
      case 'IMPORTACION_CSV': return "Importación CSV";
      default: return String(accion);
    }
  };

  const renderDetalle = (log: any) => {
    const accionStr = String(log.accion);

    if (accionStr === 'PRODUCCION' && log.valorNuevo) {
      const data = log.valorNuevo;
      return (
        <div className="text-sm space-y-1">
          <p className="text-green-600 font-semibold">+ {data.unidades}u / {data.peso}kg ({data.productoNombre})</p>
          {data.insumos?.map((ins: any, idx: number) => (
            <p key={idx} className="text-red-500 text-xs">- {ins.unidades}u / {ins.kilos}kg ({getProductName(ins.articuloId)})</p>
          ))}
        </div>
      );
    }

    if (accionStr === 'VENTA' && log.valorNuevo) {
      const items = Array.isArray(log.valorNuevo.items) ? log.valorNuevo.items : [];
      const factura = log.valorNuevo.numeroFactura || '-';
      const total = log.valorNuevo.montoTotal || log.valorNuevo.montoFactura || 0;

      return (
        <div className="text-sm space-y-1">
          <p className="font-semibold text-primary">Factura: {factura} | Cobrado: ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
          {items.map((item: any, idx: number) => (
            <p key={idx} className="text-muted-foreground text-xs">
              - {item.cantidadUnidades > 0 ? `${item.cantidadUnidades}u ` : ''}
              {item.cantidadKilos ? `(${item.cantidadKilos}kg) ` : ''}
              de {getProductName(item.articuloId)}
            </p>
          ))}
        </div>
      );
    }

    if (accionStr === 'IMPORTACION_CSV') {
      return <span className="text-blue-500 text-xs font-medium">Actualización masiva de stock</span>;
    }

    // 🔥 NUEVO: Lógica de detective para los Ajustes Manuales
    if (accionStr === 'AJUSTE_MANUAL') {
      const oldVal = log.valorAnterior;
      const newVal = log.valorNuevo;

      // 1. Si hay valor nuevo pero NO viejo, es una Creación
      if (!oldVal && newVal) {
        return <span className="text-green-600 text-xs font-medium">✨ Creado: {newVal.nombre}</span>;
      }

      // 2. Si hay valor viejo pero NO nuevo, es una Eliminación
      if (oldVal && !newVal) {
        return <span className="text-red-500 text-xs font-medium">🗑️ Eliminado: {oldVal.nombre}</span>;
      }

      // 3. Si hay ambos, comparamos qué cambió exactamente
      if (oldVal && newVal) {
        const cambios: string[] = [];
        const camposAObservar = [
          { key: 'nombre', label: 'Nombre' },
          { key: 'stockUnidades', label: 'Stock (u)' },
          { key: 'stockKilos', label: 'Stock (kg)' },
          { key: 'precio', label: 'Precio' },
          { key: 'categoria', label: 'Categoría' },
          { key: 'subcategoria', label: 'Subcategoría' },
          { key: 'codigoBarras', label: 'Cód. Barras' }
        ];

        camposAObservar.forEach(campo => {
          if (oldVal[campo.key] !== newVal[campo.key]) {
            const viejo = oldVal[campo.key] !== null && oldVal[campo.key] !== undefined && oldVal[campo.key] !== '' ? oldVal[campo.key] : 'vacío';
            const nuevo = newVal[campo.key] !== null && newVal[campo.key] !== undefined && newVal[campo.key] !== '' ? newVal[campo.key] : 'vacío';
            cambios.push(`${campo.label}: ${viejo} ➔ ${nuevo}`);
          }
        });

        // Revisamos si lo que cambió fue una imagen
        const cambiaronImagenes =
          oldVal.imagenUrl !== newVal.imagenUrl ||
          oldVal.imagenUrl2 !== newVal.imagenUrl2 ||
          oldVal.imagenUrl3 !== newVal.imagenUrl3 ||
          oldVal.imagenUrl4 !== newVal.imagenUrl4;

        if (cambiaronImagenes && cambios.length === 0) {
          return <span className="text-xs text-blue-600 font-medium">🖼️ Imágenes actualizadas ({newVal.nombre})</span>;
        }

        if (cambios.length > 0) {
          return (
            <div className="text-xs space-y-1">
              <span className="font-semibold text-slate-700">{newVal.nombre}:</span>
              {cambios.map((c, i) => (
                <p key={i} className="text-muted-foreground">- {c}</p>
              ))}
            </div>
          );
        }

        return <span className="text-xs text-muted-foreground">Modificación general ({newVal.nombre})</span>;
      }
    }

    return <span className="text-xs text-muted-foreground">Modificación de registro</span>;
  };

  // ==========================================
  // LÓGICA DEL DASHBOARD (FILTROS Y GRÁFICOS)
  // ==========================================
  const filteredClientes = clientes.filter(c => c.empresaId === empresa?.id);

  // Filtrar clientes por rango de fechas seleccionado
  const clientesFiltradosStats = filteredClientes.filter(c => {
    if (!startDate && !endDate) return true;
    const createdAt = new Date(c.createdAt || Date.now());
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate + "T23:59:59") : null;

    if (start && createdAt < start) return false;
    if (end && createdAt > end) return false;
    return true;
  });

  const totalClientesCalc = clientesFiltradosStats.length;

  // Usar datos del backend para ventas, o fallback a 0
  const totalVentasCalc = stats?.resumen.ingresosBrutos || 0;

  // Preparar datos del gráfico desde el backend
  const ventasChartData = stats?.ventasPorDia.map(d => ({
    name: new Date(d.fecha).getDate().toString(),
    count: d.monto
  })) || [];
  const maxVentas = Math.max(...ventasChartData.map(d => d.count), 1);

  // Gráfico de clientes (calculado localmente)
  const getClientesChartData = () => {
    if (!startDate || !endDate) return [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Si el rango es muy grande, agrupar por semanas o meses
    if (diffDays > 60) {
      // Agrupar por mes
      const data: { name: string; count: number }[] = [];
      const monthsMap: Record<string, number> = {};

      clientesFiltradosStats.forEach(c => {
        const date = new Date(c.createdAt || Date.now());
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthsMap[key] = (monthsMap[key] || 0) + 1;
      });

      Object.entries(monthsMap).sort().forEach(([key, count]) => {
        const [year, month] = key.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('es-AR', { month: 'short' });
        data.push({ name: monthName, count });
      });

      return data;
    } else {
      // Agrupar por día
      const data: { name: string; count: number }[] = [];
      const daysMap: Record<string, number> = {};

      // Inicializar todos los días del rango
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        daysMap[key] = 0;
      }

      clientesFiltradosStats.forEach(c => {
        const date = new Date(c.createdAt || Date.now());
        const key = date.toISOString().split('T')[0];
        if (daysMap[key] !== undefined) {
          daysMap[key] += 1;
        }
      });

      Object.entries(daysMap).forEach(([key, count], index) => {
        const day = new Date(key).getDate();
        // Mostrar etiqueta cada 5 días o el primero
        const showLabel = index === 0 || day % 5 === 0;
        data.push({ name: showLabel ? day.toString() : '', count });
      });

      return data;
    }
  };

  const clientesChartData = getClientesChartData();
  const maxClientes = Math.max(...clientesChartData.map(d => d.count), 1);

  // Texto descriptivo del período seleccionado
  const getPeriodoTexto = () => {
    if (activePreset === "hoy") return "en el día de hoy";
    if (activePreset === "mes") return "durante el mes actual";
    if (activePreset === "anio") return "durante este año";
    if (startDate && endDate) {
      return `del ${new Date(startDate).toLocaleDateString('es-AR')} al ${new Date(endDate).toLocaleDateString('es-AR')}`;
    }
    return "en el período seleccionado";
  };

  // Array de inventarios únicos
  const inventariosUnicos = Array.from(new Set(articulos.map(a => a.inventarioId))).filter(Boolean);

  // Lógica de filtrado de bajo stock
  const articulosBajoStock = articulos.filter(a => {
    if (selectedInv !== "TODOS" && a.inventarioId !== selectedInv) return false;

    // Si el input está vacío, el límite es infinito (no filtra). Si tiene valor, lo usa.
    const limiteU = maxUnidades !== "" ? parseFloat(maxUnidades) : Infinity;
    const limiteK = maxKilos !== "" ? parseFloat(maxKilos) : Infinity;

    const u = a.stockUnidades || 0;
    const k = a.stockKilos || 0;

    // Filtramos si supera el límite establecido
    if (u > limiteU) return false;
    if (k > limiteK) return false;

    // Ocultamos los ceros si el usuario prendió el switch
    if (hideZero && u === 0 && k === 0) return false;

    return true;
  }).sort((a, b) => {
    const totalA = (a.stockUnidades || 0) + (a.stockKilos || 0);
    const totalB = (b.stockUnidades || 0) + (b.stockKilos || 0);
    if (totalA === 0 && totalB !== 0) return -1;
    if (totalB === 0 && totalA !== 0) return 1;
    return totalA - totalB;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Auditoría y Estadísticas</h2>
        <p className="text-muted-foreground">Registro de actividades y rendimiento del sistema.</p>
      </div>

      <Tabs defaultValue="finanzas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="finanzas">Finanzas</TabsTrigger>
          <TabsTrigger value="articulos">Artículos</TabsTrigger>
          <TabsTrigger value="stock">Movimientos de Stock</TabsTrigger>
          <TabsTrigger value="clientes">Auditoría Clientes</TabsTrigger>
          <TabsTrigger value="pedidos">Auditoría Pedidos</TabsTrigger>
          <TabsTrigger value="conversion">Conversión</TabsTrigger>
          <TabsTrigger value="simulador">Simulador</TabsTrigger>
        </TabsList>

        <TabsContent value="finanzas" className="space-y-4">
          {/* SELECTOR DE FECHAS */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Filtro por Período
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Botones de acceso rápido */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={activePreset === "hoy" ? "default" : "outline"}
                  size="sm"
                  onClick={handlePresetHoy}
                  disabled={loadingStats}
                >
                  📅 Hoy
                </Button>
                <Button
                  variant={activePreset === "mes" ? "default" : "outline"}
                  size="sm"
                  onClick={handlePresetMes}
                  disabled={loadingStats}
                >
                  📊 Este Mes
                </Button>
                <Button
                  variant={activePreset === "anio" ? "default" : "outline"}
                  size="sm"
                  onClick={handlePresetAnio}
                  disabled={loadingStats}
                >
                  📆 Este Año
                </Button>
              </div>

              {/* Selectores de fecha personalizados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-sm text-muted-foreground">
                    Fecha Inicio
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => handleDateChange("start", e.target.value)}
                    className="bg-white"
                    max={endDate || undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-sm text-muted-foreground">
                    Fecha Fin
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => handleDateChange("end", e.target.value)}
                    className="bg-white"
                    min={startDate || undefined}
                  />
                </div>
              </div>

              {/* Indicador de carga */}
              {loadingStats && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Actualizando estadísticas...
                </div>
              )}
            </CardContent>
          </Card>

          {/* TARJETAS DE RESUMEN */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Ingresos Totales */}
            <Card className="border-l-4 border-l-green-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
                <DollarSign className="h-5 w-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${totalVentasCalc.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Facturado {getPeriodoTexto()}
                </p>
              </CardContent>
            </Card>

            {/* Cantidad de Ventas */}
            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cantidad de Ventas</CardTitle>
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {stats?.resumen.totalVentas || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ticket promedio: ${((stats?.resumen.ticketPromedio ?? 0) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>

            {/* Unidades Vendidas */}
            <Card className="border-l-4 border-l-orange-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unidades Vendidas</CardTitle>
                <Package className="h-5 w-5 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {(stats?.resumen.totalUnidadesVendidas || 0).toLocaleString('es-AR')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unidades {getPeriodoTexto()}
                </p>
              </CardContent>
            </Card>

            {/* Kilos Vendidos */}
            <Card className="border-l-4 border-l-cyan-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Kilos Vendidos</CardTitle>
                <Scale className="h-5 w-5 text-cyan-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-cyan-600">
                  {(stats?.resumen.totalKilosVendidos || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} kg
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Peso {getPeriodoTexto()}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Nuevos Clientes */}
            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Nuevos Clientes</CardTitle>
                <Users className="h-5 w-5 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{totalClientesCalc}</div>
                <p className="text-xs text-muted-foreground mt-1">Registrados {getPeriodoTexto()}</p>
              </CardContent>
            </Card>

            {/* Pedidos Creados */}
            <Card className="border-l-4 border-l-indigo-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pedidos / Cotizaciones</CardTitle>
                <FileText className="h-5 w-5 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-600">{stats?.resumen.totalPedidos || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Generados {getPeriodoTexto()}</p>
              </CardContent>
            </Card>

            {/* Pedidos Completados */}
            <Card className="border-l-4 border-l-teal-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pedidos Cerrados</CardTitle>
                <CheckCircle className="h-5 w-5 text-teal-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-teal-600">{stats?.resumen.pedidosCompletados || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tasa de cierre: {stats?.resumen.totalPedidos ? Math.round(((stats?.resumen.pedidosCompletados || 0) / stats?.resumen.totalPedidos) * 100) : 0}%
                </p>
              </CardContent>
            </Card>

            {/* Descuentos / Recargos */}
            <Card className="border-l-4 border-l-amber-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Descuentos / Recargos</CardTitle>
                <DollarSign className="h-5 w-5 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div>
                    <span className="text-sm text-red-500">-${((stats?.resumen.totalDescuentos ?? 0) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    <p className="text-xs text-muted-foreground">Descuentos</p>
                  </div>
                  <div>
                    <span className="text-sm text-green-500">+${((stats?.resumen.totalRecargos ?? 0) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    <p className="text-xs text-muted-foreground">Recargos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* GRÁFICO DE VENTAS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-center text-muted-foreground">Evolución de Ingresos</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="flex h-[220px] items-end gap-1 sm:gap-2 px-2 sm:px-4">
                  {ventasChartData.map((d, i) => (
                    // FIX APLICADO: h-full y flex-1 para que crezca correctamente
                    <div key={i} className="flex flex-col justify-end items-center flex-1 h-full group relative">
                      {/* Tooltip Dinámico */}
                      <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                        {d.count > 0 ? `$${d.count.toLocaleString('es-AR', { minimumFractionDigits: 0 })}` : '$0'}
                      </div>

                      {/* Contenedor de la barra que ocupa el espacio disponible */}
                      <div className="w-full flex-1 flex items-end justify-center">
                        <div
                          className="w-full bg-green-500/80 hover:bg-green-500 rounded-t-sm transition-all duration-500"
                          style={{ height: `${(d.count / maxVentas) * 100}%`, minHeight: '4px' }}
                        />
                      </div>

                      {/* Etiqueta inferior con altura fija */}
                      <span className="text-[10px] text-muted-foreground mt-2 h-4">{d.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* GRÁFICO DE CLIENTES */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-center text-muted-foreground">Evolución de Clientes</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="flex h-[220px] items-end gap-1 sm:gap-2 px-2 sm:px-4">
                  {clientesChartData.map((d, i) => (
                    // FIX APLICADO: h-full y flex-1
                    <div key={i} className="flex flex-col justify-end items-center flex-1 h-full group relative">
                      {/* Tooltip Dinámico */}
                      <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 bg-black text-white text-xs py-1 px-2 rounded transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                        {d.count} cliente(s)
                      </div>

                      {/* Contenedor de la barra */}
                      <div className="w-full flex-1 flex items-end justify-center">
                        <div
                          className="w-full bg-blue-400/80 hover:bg-blue-500 rounded-t-sm transition-all duration-500"
                          style={{ height: `${(d.count / maxClientes) * 100}%`, minHeight: '4px' }}
                        />
                      </div>

                      {/* Etiqueta inferior con altura fija */}
                      <span className="text-[10px] text-muted-foreground mt-2 h-4">{d.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="articulos" className="space-y-6">
          {/* SECCIÓN A: TOP PRODUCTOS */}
          <Card>
            <CardHeader>
              <CardTitle>Top Productos por Ingresos</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.topProductos && stats.topProductos.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Kilos</TableHead>
                      <TableHead className="text-right">Ingresos Totales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topProductos.map((producto, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{producto.nombre}</TableCell>
                        <TableCell className="text-right">{producto.unidades.toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right">{producto.kilos.toLocaleString('es-AR', { minimumFractionDigits: 2 })} kg</TableCell>
                        <TableCell className="text-right text-green-600 font-semibold">${producto.ingresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  No hay datos de productos disponibles.
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECCIÓN B: BAJO STOCK */}
          <Card>
            <CardHeader>
              <CardTitle className="mb-4">Panel de Control de Stock</CardTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Dropdown Inventario */}
                <div className="space-y-2">
                  <Label htmlFor="inventario" className="text-sm text-muted-foreground">Inventario</Label>
                  <select
                    id="inventario"
                    value={selectedInv}
                    onChange={(e) => setSelectedInv(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="TODOS">TODOS</option>
                    {inventariosUnicos.map((invId) => (
                      <option key={invId} value={invId}>
                        {nombresInventarios[invId] || invId}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Input Límite Unidades */}
                <div className="space-y-2">
                  <Label htmlFor="maxUnidades" className="text-sm text-muted-foreground">Límite Unidades</Label>
                  <Input
                    id="maxUnidades"
                    type="number"
                    placeholder="ej: 10"
                    value={maxUnidades}
                    onChange={(e) => setMaxUnidades(e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Input Límite Kilos */}
                <div className="space-y-2">
                  <Label htmlFor="maxKilos" className="text-sm text-muted-foreground">Límite Kilos</Label>
                  <Input
                    id="maxKilos"
                    type="number"
                    placeholder="ej: 5"
                    step="0.01"
                    value={maxKilos}
                    onChange={(e) => setMaxKilos(e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Checkbox Ocultar Stock 0 */}
                <div className="space-y-2 flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideZero}
                      onChange={(e) => setHideZero(e.target.checked)}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm text-muted-foreground">Ocultar stock 0</span>
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {articulosBajoStock.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Unidades Actuales</TableHead>
                      <TableHead className="text-right">Kilos Actuales</TableHead>
                      <TableHead>Categoría</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articulosBajoStock.map((articulo) => (
                      <TableRow key={articulo.id} className={articulo.stockUnidades === 0 && articulo.stockKilos === 0 ? "bg-red-50" : ""}>
                        <TableCell className="font-medium">{articulo.nombre}</TableCell>
                        <TableCell className="text-right">
                          <span className={articulo.stockUnidades === 0 ? "text-red-600 font-semibold" : ""}>
                            {(articulo.stockUnidades || 0).toLocaleString('es-AR')}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={articulo.stockKilos === 0 ? "text-red-600 font-semibold" : ""}>
                            {(articulo.stockKilos || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{articulo.categoria || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  No hay artículos que coincidan con los filtros aplicados.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <div className="space-y-4">
            {stockLogs.length > 0 ? (
              stockLogs.map((log: any) => {
                const accionColor = String(log.accion) === 'PRODUCCION' ? 'bg-green-50 border-l-4 border-l-green-500' :
                                   String(log.accion) === 'VENTA' ? 'bg-blue-50 border-l-4 border-l-blue-500' :
                                   String(log.accion) === 'IMPORTACION_CSV' ? 'bg-purple-50 border-l-4 border-l-purple-500' :
                                   'bg-amber-50 border-l-4 border-l-amber-500';
                const badgeVariant = String(log.accion) === 'PRODUCCION' ? 'default' :
                                    String(log.accion) === 'VENTA' ? 'secondary' :
                                    String(log.accion) === 'IMPORTACION_CSV' ? 'outline' :
                                    'secondary';
                return (
                  <Card key={log.id} className={`${accionColor}`}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString('es-AR', { hour12: false, dateStyle: 'short', timeStyle: 'medium' })}
                            </span>
                            <span className="text-xs bg-slate-200 px-2.5 py-1 rounded-full">
                              {log.usuario?.nombre || log.usuarioId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block px-3 py-1 rounded text-xs font-semibold text-white"
                              style={{
                                backgroundColor: String(log.accion) === 'PRODUCCION' ? '#10b981' :
                                                String(log.accion) === 'VENTA' ? '#3b82f6' :
                                                String(log.accion) === 'IMPORTACION_CSV' ? '#a855f7' :
                                                '#f59e0b'
                              }}
                            >
                              {formatAction(log.accion)}
                            </span>
                          </div>
                          <div className="mt-3">
                            {renderDetalle(log)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card className="bg-slate-50">
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No hay registros de stock.
                </CardContent>
              </Card>
            )}
          </div>
          
          {meta && meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Página <span className="font-semibold">{meta.page}</span> de <span className="font-semibold">{meta.totalPages}</span> ({meta.total} registros)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs({ page: meta.page - 1, startDate, endDate })}
                  disabled={meta.page === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs({ page: meta.page + 1, startDate, endDate })}
                  disabled={meta.page === meta.totalPages}
                  className="flex items-center gap-1"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="clientes" className="space-y-4">
          <div className="space-y-4">
            {clientLogs.length > 0 ? (
              clientLogs.map((log: any) => {
                const clienteNombre = log.valorNuevo?.nombre || log.valorAnterior?.nombre || getClientNameFallback(log.registroId);
                let cambios = "Sin detalles";
                let tipoAccion = 'modificacion';
                let badgeColor = 'bg-blue-50 border-l-4 border-l-blue-500';

                if (log.accion === 'CREACION' || (log.accion === 'AJUSTE_MANUAL' && !log.valorAnterior)) {
                  cambios = "✨ Cliente creado";
                  tipoAccion = 'creacion';
                  badgeColor = 'bg-green-50 border-l-4 border-l-green-500';
                } else if (log.accion === 'AJUSTE_MANUAL' && !log.valorNuevo) {
                  cambios = "🗑️ Cliente eliminado";
                  tipoAccion = 'eliminacion';
                  badgeColor = 'bg-red-50 border-l-4 border-l-red-500';
                } else if (log.valorAnterior && log.valorNuevo) {
                  const camposAObservar = ['nombre', 'email', 'telefono', 'cuit', 'direccion', 'recordatorio'];
                  const diferencias: string[] = [];

                  camposAObservar.forEach(campo => {
                    if (log.valorAnterior[campo] !== log.valorNuevo[campo]) {
                      diferencias.push(`${campo}: ${log.valorAnterior[campo] || 'vacío'} ➔ ${log.valorNuevo[campo] || 'vacío'}`);
                    }
                  });

                  if (log.valorAnterior.fechaRecordatorio !== log.valorNuevo.fechaRecordatorio) {
                    const oldF = log.valorAnterior.fechaRecordatorio ? new Date(log.valorAnterior.fechaRecordatorio).toLocaleDateString('es-AR') : 'Ninguna';
                    const newF = log.valorNuevo.fechaRecordatorio ? new Date(log.valorNuevo.fechaRecordatorio).toLocaleDateString('es-AR') : 'Ninguna';
                    diferencias.push(`Fecha aviso: ${oldF} ➔ ${newF}`);
                  }

                  cambios = diferencias.length > 0 ? diferencias.join(' | ') : "Modificación general";
                  tipoAccion = 'modificacion';
                  badgeColor = 'bg-blue-50 border-l-4 border-l-blue-500';
                }

                const badgeBgColor = tipoAccion === 'creacion' ? '#10b981' : tipoAccion === 'eliminacion' ? '#ef4444' : '#3b82f6';

                return (
                  <Card key={log.id} className={badgeColor}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString('es-AR', { hour12: false, dateStyle: 'short', timeStyle: 'medium' })}
                            </span>
                            <span className="text-xs bg-slate-200 px-2.5 py-1 rounded-full">
                              {log.usuario?.nombre || log.usuarioId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-base">{clienteNombre}</h3>
                            <span className="inline-block px-3 py-1 rounded text-xs font-semibold text-white" style={{ backgroundColor: badgeBgColor }}>
                              {tipoAccion === 'creacion' ? 'Creado' : tipoAccion === 'eliminacion' ? 'Eliminado' : 'Modificado'}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">
                            {cambios}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card className="bg-slate-50">
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No hay registros de clientes.
                </CardContent>
              </Card>
            )}
          </div>
          
          {meta && meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Página <span className="font-semibold">{meta.page}</span> de <span className="font-semibold">{meta.totalPages}</span> ({meta.total} registros)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs({ page: meta.page - 1, startDate, endDate })}
                  disabled={meta.page === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs({ page: meta.page + 1, startDate, endDate })}
                  disabled={meta.page === meta.totalPages}
                  className="flex items-center gap-1"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pedidos" className="space-y-4">
          <div className="space-y-4">
            {pedidoLogs.length > 0 ? (
              pedidoLogs.map((log: any) => {
                const pedidoNombre = log.valorNuevo?.nombre || log.valorAnterior?.nombre || 'Desconocido';
                const referenciaId = log.registroId;
                let cambios = "Sin detalles";
                let tipoAccion = 'modificacion';
                let badgeColor = 'bg-indigo-50 border-l-4 border-l-indigo-500';

                if (log.accion === 'CREACION_PEDIDO') {
                  cambios = "✨ Nueva cotización/pedido generada";
                  tipoAccion = 'creacion';
                  badgeColor = 'bg-green-50 border-l-4 border-l-green-500';
                } else if (log.valorAnterior && log.valorNuevo) {
                  const campos = ['nombre', 'email', 'telefono', 'tag', 'status', 'mensaje'];
                  const diffs: string[] = [];

                  campos.forEach(c => {
                    if (log.valorAnterior[c] !== log.valorNuevo[c]) {
                      const viejo = log.valorAnterior[c] ? log.valorAnterior[c] : 'vacío';
                      const nuevo = log.valorNuevo[c] ? log.valorNuevo[c] : 'vacío';
                      diffs.push(`${c}: ${viejo} ➔ ${nuevo}`);
                    }
                  });

                  const oR = log.valorAnterior.recordatorio ? new Date(log.valorAnterior.recordatorio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Ninguno';
                  const nR = log.valorNuevo.recordatorio ? new Date(log.valorNuevo.recordatorio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Ninguno';

                  if (oR !== nR) {
                    diffs.push(`Recordatorio: ${oR} ➔ ${nR}`);
                  }

                  cambios = diffs.length > 0 ? diffs.join(' | ') : "Modificación general sin cambios visuales";
                  tipoAccion = 'modificacion';
                  badgeColor = 'bg-blue-50 border-l-4 border-l-blue-500';
                } else {
                  cambios = log.motivo || "Modificación de pedido";
                }

                const badgeBgColor = tipoAccion === 'creacion' ? '#10b981' : '#4f46e5';
                const accionLabel = String(log.accion).replace(/_/g, ' ');

                return (
                  <Card key={log.id} className={badgeColor}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString('es-AR', { hour12: false, dateStyle: 'short', timeStyle: 'medium' })}
                            </span>
                            <span className="text-xs bg-slate-200 px-2.5 py-1 rounded-full">
                              {log.usuario?.nombre || log.usuarioId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-base">{pedidoNombre}</h3>
                            <span className="inline-block px-3 py-1 rounded text-xs font-semibold text-white" style={{ backgroundColor: badgeBgColor }}>
                              {accionLabel}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">
                            {cambios}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card className="bg-slate-50">
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No hay registros de auditoría de pedidos.
                </CardContent>
              </Card>
            )}
          </div>
          
          {meta && meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Página <span className="font-semibold">{meta.page}</span> de <span className="font-semibold">{meta.totalPages}</span> ({meta.total} registros)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs({ page: meta.page - 1, startDate, endDate })}
                  disabled={meta.page === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs({ page: meta.page + 1, startDate, endDate })}
                  disabled={meta.page === meta.totalPages}
                  className="flex items-center gap-1"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="conversion" className="space-y-4">
          {/* FILTROS CRM */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Filtro por Vendedor */}
            <div className="space-y-2">
              <Label htmlFor="filtro-vendedor" className="text-sm text-muted-foreground">Filtrar por Vendedor</Label>
              <Select value={filtroVendedor} onValueChange={(val) => setFiltroVendedor(val || "TODOS")}>
                <SelectTrigger id="filtro-vendedor" className="bg-white">
                  <SelectValue placeholder="Seleccionar vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">TODOS</SelectItem>
                  {stats?.conversion?.porVendedor?.map((vendedor) => (
                    <SelectItem key={vendedor.nombre} value={vendedor.nombre}>
                      {vendedor.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Cliente */}
            <div className="space-y-2">
              <Label htmlFor="filtro-cliente" className="text-sm text-muted-foreground">Filtrar por Cliente</Label>
              <Select value={filtroClienteConversion} onValueChange={(val) => setFiltroClienteConversion(val || "TODOS")}>
                <SelectTrigger id="filtro-cliente" className="bg-white">
                  <SelectValue placeholder="Seleccionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">TODOS</SelectItem>
                  {stats?.conversion?.topClientes?.map((cliente) => (
                    <SelectItem key={cliente.nombre} value={cliente.nombre}>
                      {cliente.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* TABLA 1: Efectividad por Vendedor */}
            <Card>
              <CardHeader>
                <CardTitle>Efectividad por Vendedor</CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.conversion?.porVendedor && stats.conversion.porVendedor.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Total Pedidos</TableHead>
                        <TableHead className="text-right">Tasa Conversión</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.conversion.porVendedor
                        .filter(vendedor => filtroVendedor === "TODOS" || vendedor.nombre === filtroVendedor)
                        .map((vendedor, idx) => {
                          const tasa = vendedor.tasa ?? 0;
                          let badgeColor = "bg-red-100 text-red-800";
                          if (tasa > 50) badgeColor = "bg-green-100 text-green-800";
                          else if (tasa > 20) badgeColor = "bg-yellow-100 text-yellow-800";

                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{vendedor.nombre}</TableCell>
                              <TableCell className="text-right">{vendedor.total ?? 0}</TableCell>
                              <TableCell className="text-right">
                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badgeColor}`}>
                                  {(tasa ?? 0).toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="h-24 flex items-center justify-center text-muted-foreground">
                    No hay datos de conversión por vendedor disponibles.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* TABLA 2: Top 8 Clientes por Tasa de Conversión */}
            <Card>
              <CardHeader>
                <CardTitle>Top Clientes por Tasa de Conversión</CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.conversion?.topClientes && stats.conversion.topClientes.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Total Pedidos</TableHead>
                        <TableHead className="text-right">Tasa Conversión</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.conversion.topClientes
                        .filter(cliente => filtroClienteConversion === "TODOS" || cliente.nombre === filtroClienteConversion)
                        .slice(0, 8)
                        .map((cliente, idx) => {
                          const tasa = cliente.tasa ?? 0;
                          let badgeColor = "bg-red-100 text-red-800";
                          if (tasa > 50) badgeColor = "bg-green-100 text-green-800";
                          else if (tasa > 20) badgeColor = "bg-yellow-100 text-yellow-800";

                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{cliente.nombre}</TableCell>
                              <TableCell className="text-right">{cliente.total ?? 0}</TableCell>
                              <TableCell className="text-right">
                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badgeColor}`}>
                                  {(tasa ?? 0).toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="h-24 flex items-center justify-center text-muted-foreground">
                    No hay datos de conversión de clientes disponibles.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="simulador" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                Simulador de Margen y Rentabilidad
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {/* Controles de Simulación */}
              <div className="space-y-6 md:border-r md:pr-6">
                <div className="space-y-2">
                  <Label>1. Seleccionar Producto Base</Label>
                  <select
                    className="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={simArticuloId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSimArticuloId(id);
                      const art = articulos.find(a => a.id === id);
                      if (art) setSimCosto(art.costo || 0);
                    }}
                  >
                    <option value="">Seleccione un artículo...</option>
                    {articulos.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre} (Costo: ${a.costo || 0})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Costo de Producción / Compra ($)</Label>
                  <Input
                    type="number"
                    value={simCosto}
                    onChange={(e) => setSimCosto(Number(e.target.value))}
                    className="bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Marcación / Markup (%)</Label>
                    <span className="text-sm font-medium">{simMarkup}%</span>
                  </div>
                  <input
                    type="range" min="0" max="200" step="5"
                    value={simMarkup}
                    onChange={(e) => setSimMarkup(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Descuento Ofrecido (%)</Label>
                    <span className="text-sm text-red-500 font-medium">-{simDescuento}%</span>
                  </div>
                  <input
                    type="range" min="0" max="50" step="1"
                    value={simDescuento}
                    onChange={(e) => setSimDescuento(Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                </div>
              </div>

              {/* Resultados */}
              <div className="space-y-6 flex flex-col justify-center">
                {(() => {
                  const precioSugerido = simCosto * (1 + (simMarkup / 100));
                  const descuentoMonto = precioSugerido * (simDescuento / 100);
                  const precioFinal = precioSugerido - descuentoMonto;
                  const gananciaNeta = precioFinal - simCosto;
                  const margenReal = simCosto > 0 ? (gananciaNeta / precioFinal) * 100 : 0;
                  const isPeligro = margenReal < 10;

                  return (
                    <>
                      <div className="bg-slate-50 p-4 rounded-lg border space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Precio de Lista Sugerido:</span>
                          <span className="font-medium">${(precioSugerido ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-red-500">
                          <span>Monto Descontado:</span>
                          <span>-${(descuentoMonto ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                          <span>Precio Final al Cliente:</span>
                          <span>${(precioFinal ?? 0).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className={`p-6 rounded-lg border text-center transition-colors ${isPeligro ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Ganancia Neta por Unidad</p>
                        <p className={`text-4xl font-bold ${isPeligro ? 'text-red-600' : 'text-green-600'}`}>
                          ${(gananciaNeta ?? 0).toFixed(2)}
                        </p>
                        <p className="text-sm font-medium mt-2">
                          Margen Real: {(margenReal ?? 0).toFixed(1)}%
                          {isPeligro && <span className="block mt-1 text-xs text-red-500 font-bold">⚠️ RIESGO: Margen muy bajo</span>}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}