import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { redondear } from '../utils/math';
import { AppError, handleError } from '../utils/errors';

const prisma = new PrismaClient();

// GET /api/ventas
export async function getVentas(req: Request, res: Response) {
  try {
    const user = (req as any).user;

    const ventas = await prisma.venta.findMany({
      where: { empresaId: user.empresaId },
      include: {
        cliente: {
          select: { id: true, nombre: true, cuit: true, email: true }
        },
        items: {
          include: {
            articulo: {
              select: { id: true, nombre: true, sku: true }
            }
          }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    res.json(ventas);
  } catch (error: any) {
    if (error.name === 'PrismaClientValidationError') {
      res.status(400).json({ message: 'Error en los parámetros de búsqueda de ventas.' });
      return;
    }
    handleError(res, error);
  }
}

// POST /api/ventas
export async function createVenta(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { clienteId, items, descuento, tipoDescuento, recargo, tipoRecargo, numeroFactura } = req.body;

    if (!items || items.length === 0) {
      throw new AppError('Items requeridos', 400);
    }

    const venta = await prisma.$transaction(async (tx) => {
      // ==========================================
      // 🔒 PASO 1: Validar artículos y calcular subtotales en backend
      // ==========================================
      const itemsValidados: {
        articuloId: string;
        cantidadUnidades: number;
        cantidadKilos: number;
        precioUnitario: number;
        subtotal: number;
        inventarioId: string;
      }[] = [];

      for (const item of items) {
        // Buscar el artículo en la base de datos
        const articulo = await tx.articulo.findUnique({
          where: { id: item.articuloId }
        });

        // Validar que el artículo exista
        if (!articulo) {
          throw new AppError(`Artículo no encontrado: ${item.articuloId}`, 404);
        }

        // 🔒 SEGURIDAD: Validar que el artículo pertenezca a la empresa del usuario
        if (articulo.empresaId !== user.empresaId) {
          throw new AppError(`No tienes permiso para vender el artículo: ${articulo.nombre}`, 403);
        }

        const cantidadUnidades = parseFloat(item.cantidadUnidades) || 0;
        const cantidadKilos = parseFloat(item.cantidadKilos) || 0;

        // 🔒 VALIDACIÓN DE STOCK: Verificar disponibilidad
        if (cantidadUnidades > 0 && articulo.stockUnidades < cantidadUnidades) {
          throw new AppError(
            `Stock insuficiente para "${articulo.nombre}". Disponible: ${articulo.stockUnidades} unidades, Solicitado: ${cantidadUnidades}`,
            400
          );
        }

        if (cantidadKilos > 0 && articulo.stockKilos < cantidadKilos) {
          throw new AppError(
            `Stock insuficiente para "${articulo.nombre}". Disponible: ${articulo.stockKilos} kg, Solicitado: ${cantidadKilos}`,
            400
          );
        }

        // 🧮 RECALCULAR subtotal en backend (no confiar en frontend)
        const precioUnitario = articulo.precio || 0;
        let subtotalItem = 0;

        if (cantidadUnidades > 0) {
          subtotalItem = redondear(precioUnitario * cantidadUnidades);
        } else if (cantidadKilos > 0) {
          subtotalItem = redondear(precioUnitario * cantidadKilos);
        }

        itemsValidados.push({
          articuloId: item.articuloId,
          cantidadUnidades,
          cantidadKilos,
          precioUnitario: redondear(precioUnitario),
          subtotal: subtotalItem,
          inventarioId: item.inventarioId
        });
      }

      // ==========================================
      // 🧮 PASO 2: Calcular totales con redondeo
      // ==========================================
      const subtotal = redondear(
        itemsValidados.reduce((acc, item) => acc + item.subtotal, 0)
      );

      // Calcular descuento según tipo
      const descuentoNum = parseFloat(descuento) || 0;
      const descuentoCalculado = redondear(
        tipoDescuento === 'porcentaje'
          ? subtotal * (descuentoNum / 100)
          : descuentoNum
      );

      // Calcular recargo según tipo
      const recargoNum = parseFloat(recargo) || 0;
      const recargoCalculado = redondear(
        tipoRecargo === 'porcentaje'
          ? subtotal * (recargoNum / 100)
          : recargoNum
      );

      // Calcular total final
      const montoTotalCalculado = redondear(
        Math.max(0, subtotal - descuentoCalculado + recargoCalculado)
      );

      // ==========================================
      // 💾 PASO 3: Crear la venta
      // ==========================================
      const newVenta = await tx.venta.create({
        data: {
          numeroFactura: numeroFactura || null,
          montoTotal: montoTotalCalculado,
          descuento: descuentoCalculado,
          recargo: recargoCalculado,
          clienteId,
          usuarioId: user.id,
          empresaId: user.empresaId,
          items: {
            create: itemsValidados.map((item) => ({
              articuloId: item.articuloId,
              cantidadUnidades: item.cantidadUnidades,
              cantidadKilos: item.cantidadKilos,
              precioUnitario: item.precioUnitario,
              subtotal: item.subtotal,
              inventarioId: item.inventarioId
            }))
          }
        },
        include: { items: true }
      });

      // ==========================================
      // 📦 PASO 4: Actualizar stock de cada artículo
      // ==========================================
      for (const item of itemsValidados) {
        await tx.articulo.update({
          where: { id: item.articuloId },
          data: {
            stockUnidades: { decrement: item.cantidadUnidades },
            stockKilos: { decrement: item.cantidadKilos }
          }
        });
      }

      return newVenta;
    });

    // ==========================================
    // 📝 PASO 5: Crear registro de auditoría (asíncrono)
    // ==========================================
    prisma.auditLog.create({
      data: {
        accion: 'VENTA',
        tablaAfectada: 'ARTICULO',
        registroId: venta.id,
        valorNuevo: venta as any,
        usuarioId: user.id,
        empresaId: user.empresaId
      }
    }).catch(err => console.error('Error AuditLog Venta:', err));

    res.json(venta);
  } catch (error: any) {
    console.error('Error al crear venta:', error);
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede registrar la venta: el cliente, el artículo o el inventario seleccionado ya no existe en el sistema.'
      });
      return;
    }
    if (error.name === 'PrismaClientValidationError') {
      res.status(400).json({
        success: false,
        message: 'Los datos enviados no tienen el formato correcto para registrar la venta.'
      });
      return;
    }
    handleError(res, error);
  }
}