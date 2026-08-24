import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { redondear } from '../utils/math';

const prisma = new PrismaClient();

// GET /api/stats - Calcula ganancias con filtros de fecha
export async function getStats(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { startDate, endDate } = req.query;

    // Construir filtro de fechas
    const whereClause: any = {
      empresaId: user.empresaId
    };

    // Manejo de fechas con timezone seguro
    if (startDate || endDate) {
      whereClause.fecha = {};

      if (startDate) {
        // Inicio del día en UTC (00:00:00.000)
        const start = new Date(startDate as string);
        start.setUTCHours(0, 0, 0, 0);
        whereClause.fecha.gte = start;
      }

      if (endDate) {
        // Fin del día en UTC (23:59:59.999)
        const end = new Date(endDate as string);
        end.setUTCHours(23, 59, 59, 999);
        whereClause.fecha.lte = end;
      }
    }

    // Construir filtro de fechas para pedidos
    const pedidosWhereClause: any = {
      empresaId: user.empresaId
    };

    if (startDate || endDate) {
      pedidosWhereClause.fechaCreacion = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setUTCHours(0, 0, 0, 0);
        pedidosWhereClause.fechaCreacion.gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setUTCHours(23, 59, 59, 999);
        pedidosWhereClause.fechaCreacion.lte = end;
      }
    }

    // Obtener ventas filtradas con sus items y métricas de pedidos en paralelo
    const [ventas, totalPedidos, pedidosCompletados, pedidosRecientes, pedidos, auditLogs] = await Promise.all([
      prisma.venta.findMany({
        where: whereClause,
        include: {
          items: {
            include: {
              articulo: true
            }
          },
          cliente: true
        },
        orderBy: { fecha: 'desc' }
      }),
      // Total de pedidos de la empresa
      prisma.pedido.count({
        where: { empresaId: user.empresaId }
      }),
      // Pedidos completados (CONFIRMADO)
      prisma.pedido.count({
        where: {
          empresaId: user.empresaId,
          status: 'CONFIRMADO'
        }
      }),
      // Pedidos creados en los últimos 30 días
      prisma.pedido.count({
        where: {
          empresaId: user.empresaId,
          fechaCreacion: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      }),
      // Pedidos filtrados por fechas para cálculo de conversión
      prisma.pedido.findMany({
        where: pedidosWhereClause,
        include: {
          cliente: { select: { id: true, nombre: true } }
        }
      }),
      // Logs de auditoría para vincular vendedores con pedidos
      prisma.auditLog.findMany({
        where: {
          empresaId: user.empresaId,
          accion: 'CREACION_PEDIDO'
        },
        include: {
          usuario: { select: { id: true, nombre: true } }
        }
      })
    ]);

    // Calcular totales con redondeo
    const totalVentas = ventas.length;
    const ingresosBrutos = redondear(
      ventas.reduce((acc, venta) => acc + (venta.montoTotal || 0), 0)
    );
    const totalDescuentos = redondear(
      ventas.reduce((acc, venta) => acc + (venta.descuento || 0), 0)
    );
    const totalRecargos = redondear(
      ventas.reduce((acc, venta) => acc + (venta.recargo || 0), 0)
    );

    // Calcular unidades y kilos vendidos
    let totalUnidadesVendidas = 0;
    let totalKilosVendidos = 0;

    for (const venta of ventas) {
      for (const item of venta.items) {
        totalUnidadesVendidas += item.cantidadUnidades || 0;
        totalKilosVendidos += item.cantidadKilos || 0;
      }
    }

    // Agrupar ventas por día para gráficos
    const ventasPorDia: Record<string, { cantidad: number; monto: number }> = {};
    for (const venta of ventas) {
      const fechaKey = venta.fecha
        ? new Date(venta.fecha).toISOString().split('T')[0]
        : 'sin-fecha';

      if (!ventasPorDia[fechaKey]) {
        ventasPorDia[fechaKey] = { cantidad: 0, monto: 0 };
      }
      ventasPorDia[fechaKey].cantidad += 1;
      ventasPorDia[fechaKey].monto = redondear(ventasPorDia[fechaKey].monto + (venta.montoTotal || 0));
    }

    // Convertir a array ordenado por fecha
    const ventasPorDiaArray = Object.entries(ventasPorDia)
      .map(([fecha, datos]) => ({ fecha, ...datos }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Top productos más vendidos
    const productosVendidos: Record<string, { nombre: string; unidades: number; kilos: number; ingresos: number }> = {};
    for (const venta of ventas) {
      for (const item of venta.items) {
        const articuloId = item.articuloId;
        const nombreArticulo = item.articulo?.nombre || 'Artículo eliminado';

        if (!productosVendidos[articuloId]) {
          productosVendidos[articuloId] = { nombre: nombreArticulo, unidades: 0, kilos: 0, ingresos: 0 };
        }
        productosVendidos[articuloId].unidades += item.cantidadUnidades || 0;
        productosVendidos[articuloId].kilos += item.cantidadKilos || 0;
        productosVendidos[articuloId].ingresos = redondear(productosVendidos[articuloId].ingresos + (item.subtotal || 0));
      }
    }

    const topProductos = Object.values(productosVendidos)
      .sort((a, b) => b.ingresos - a.ingresos)
      .slice(0, 10);

    // Calcular tasa de conversión por cliente
    const conversionPorCliente: Record<string, { clienteId: string; nombre: string; total: number; pedidosGanados: number; tasa: number }> = {};

    for (const pedido of pedidos) {
      const clienteId = pedido.clienteId || 'sin-cliente';
      const clienteNombre = pedido.cliente?.nombre || 'Cliente desconocido';

      if (!conversionPorCliente[clienteId]) {
        conversionPorCliente[clienteId] = {
          clienteId,
          nombre: clienteNombre,
          total: 0,
          pedidosGanados: 0,
          tasa: 0
        };
      }

      conversionPorCliente[clienteId].total += 1;
      if (pedido.status === 'CONFIRMADO') {
        conversionPorCliente[clienteId].pedidosGanados += 1;
      }
    }

    // Calcular tasas de conversión por cliente
    for (const key in conversionPorCliente) {
      const datos = conversionPorCliente[key];
      datos.tasa = redondear(
        datos.total > 0 ? (datos.pedidosGanados / datos.total) * 100 : 0
      );
    }

    // Calcular tasa de conversión por vendedor
    const conversionPorVendedor: Record<string, { vendedorId: string; nombre: string; total: number; pedidosGanados: number; tasa: number }> = {};

    // Mapear audit logs para obtener vendedores
    const auditLogsMap: Record<string, any> = {};
    for (const log of auditLogs) {
      const pedidoId = log.registroId;
      if (pedidoId) {
        auditLogsMap[pedidoId] = log;
      }
    }

    for (const pedido of pedidos) {
      const auditLog = auditLogsMap[pedido.id];
      const vendedorId = auditLog?.usuarioId || 'sin-vendedor';
      const vendedorNombre = auditLog?.usuario?.nombre || 'Vendedor desconocido';

      if (!conversionPorVendedor[vendedorId]) {
        conversionPorVendedor[vendedorId] = {
          vendedorId,
          nombre: vendedorNombre,
          total: 0,
          pedidosGanados: 0,
          tasa: 0
        };
      }

      conversionPorVendedor[vendedorId].total += 1;
      if (pedido.status === 'CONFIRMADO') {
        conversionPorVendedor[vendedorId].pedidosGanados += 1;
      }
    }

    // Calcular tasas de conversión por vendedor
    for (const key in conversionPorVendedor) {
      const datos = conversionPorVendedor[key];
      datos.tasa = redondear(
        datos.total > 0 ? (datos.pedidosGanados / datos.total) * 100 : 0
      );
    }

    // Convertir a arrays y ordenar por tasa de conversión descendente
    const conversionPorClienteArray = Object.values(conversionPorCliente)
      .sort((a, b) => b.tasa - a.tasa);

    const conversionPorVendedorArray = Object.values(conversionPorVendedor)
      .sort((a, b) => b.tasa - a.tasa);

    // Respuesta completa con estadísticas
    res.json({
      periodo: {
        desde: startDate || 'inicio',
        hasta: endDate || 'ahora'
      },
      resumen: {
        totalVentas,
        ingresosBrutos,
        totalDescuentos,
        totalRecargos,
        ingresosNetos: ingresosBrutos, // Ya tiene descuentos y recargos aplicados
        totalUnidadesVendidas,
        totalKilosVendidos: redondear(totalKilosVendidos),
        ticketPromedio: redondear(totalVentas > 0 ? ingresosBrutos / totalVentas : 0)
      },
      pedidos: {
        total: totalPedidos,
        completados: pedidosCompletados,
        recientes: pedidosRecientes
      },
      conversion: {
        porVendedor: conversionPorVendedorArray,
        topClientes: conversionPorClienteArray
      },
      ventasPorDia: ventasPorDiaArray,
      topProductos,
      detalleVentas: ventas
    });
  } catch (error: any) {
    console.error('❌ Error en /api/stats:', error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/audit
 * Obtiene el historial de auditoría de la empresa del usuario autenticado
 * Query params: page (default 1), limit (default 20), accion, startDate, endDate
 */
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { page = '1', limit = '20', accion, startDate, endDate, registroId, clienteId, tablaAfectada } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Construir filtro dinámico
    const whereClause: any = {
      empresaId: user.empresaId
    };

    if (accion) {
      whereClause.accion = accion;
    }

    if (tablaAfectada) {
      whereClause.tablaAfectada = { in: (tablaAfectada as string).split(',') };
    }

    if (registroId) {
      whereClause.registroId = registroId;
    }

    if (clienteId) {
      const pedidosCliente = await prisma.pedido.findMany({
        where: { clienteId: clienteId as string, empresaId: user.empresaId },
        select: { id: true }
      });
      const pedidoIds = pedidosCliente.map(p => p.id);
      whereClause.registroId = { in: pedidoIds.length > 0 ? pedidoIds : ['sin-resultados'] };
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        const start = new Date(startDate as string);
        start.setUTCHours(0, 0, 0, 0);
        whereClause.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setUTCHours(23, 59, 59, 999);
        whereClause.createdAt.lte = end;
      }
    }

    // Obtener logs y total en paralelo
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          usuario: { select: { id: true, nombre: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.auditLog.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: logs,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages
      }
    });
  } catch (error: any) {
    console.error('Error al obtener logs de auditoría:', error);
    res.status(500).json({ message: 'Error interno al obtener los registros de auditoría' });
  }
};
