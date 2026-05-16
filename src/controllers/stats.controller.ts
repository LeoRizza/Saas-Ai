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

    // Obtener ventas filtradas con sus items y métricas de pedidos en paralelo
    const [ventas, totalPedidos, pedidosCompletados, pedidosRecientes] = await Promise.all([
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
 */
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const logs = await prisma.auditLog.findMany({
      where: { empresaId: user.empresaId },
      include: {
        usuario: { select: { nombre: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (error: any) {
    console.error('Error al obtener logs de auditoría:', error);
    res.status(500).json({ message: 'Error interno al obtener los registros de auditoría' });
  }
};
