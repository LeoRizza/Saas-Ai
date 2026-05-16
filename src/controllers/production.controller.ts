import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/produccion
 * Obtiene todas las producciones de la empresa del usuario autenticado
 */
export const getProduccion = async (req: any, res: any) => {
  try {
    const producciones = await prisma.produccionLog.findMany({
      where: { empresaId: req.user.empresaId },
      include: { insumos: true }
    });
    res.json(producciones);
  } catch (error: any) {
    console.error('Error en controlador de producción:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen problemas de vinculación con la base de datos (ej. un inventario, insumo o usuario fue modificado o eliminado).'
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

/**
 * POST /api/produccion
 * Crea un nuevo registro de producción con transacción
 * - Decrementa stocks de insumos
 * - Crea o actualiza el producto final en el inventario destino
 * - Registra la acción en el audit log
 */
export const createProduccion = async (req: any, res: any) => {
  try {
    const { productoNombre, unidades, peso, insumos, inventarioOrigenId, inventarioDestinoId } = req.body;

    if (!inventarioOrigenId || !inventarioDestinoId) {
      return res.status(400).json({ message: 'Inventarios de origen y destino son requeridos' });
    }

    const usuarioReal = await prisma.usuario.findUnique({ where: { id: req.user.id } });

    const produccion = await prisma.$transaction(async (tx) => {
      const prod = await tx.produccionLog.create({
        data: {
          productoNombre,
          unidades: parseFloat(unidades || '0'),
          peso: parseFloat(peso || '0'),
          usuarioNombre: usuarioReal?.nombre || 'Usuario Desconocido',
          empresaId: req.user.empresaId,
          inventarioOrigenId,
          inventarioDestinoId,
          insumos: {
            create: insumos.map((ins: any) => ({
              articuloId: ins.articuloId,
              kilos: parseFloat(ins.kilos || '0'),
              unidades: parseFloat(ins.unidades || '0')
            }))
          }
        },
        include: { insumos: true }
      });

      // Decrementar stocks de insumos utilizados
      for (const ins of insumos) {
        const art = await tx.articulo.findUnique({ where: { id: ins.articuloId } });
        if (art) {
          await tx.articulo.update({
            where: { id: art.id },
            data: {
              stockKilos: art.stockKilos - parseFloat(ins.kilos || '0'),
              stockUnidades: art.stockUnidades - parseFloat(ins.unidades || '0')
            }
          });
        }
      }

      // Buscar o crear el producto final en el inventario destino
      let productoDestino = await tx.articulo.findFirst({
        where: { nombre: productoNombre, inventarioId: inventarioDestinoId }
      });

      if (productoDestino) {
        await tx.articulo.update({
          where: { id: productoDestino.id },
          data: {
            stockUnidades: productoDestino.stockUnidades + parseFloat(unidades || '0'),
            stockKilos: productoDestino.stockKilos + parseFloat(peso || '0')
          }
        });
      } else {
        await tx.articulo.create({
          data: {
            nombre: productoNombre,
            inventarioId: inventarioDestinoId,
            stockUnidades: parseFloat(unidades || '0'),
            stockKilos: parseFloat(peso || '0'),
            empresaId: req.user.empresaId,
            categoria: 'Producción'
          }
        });
      }

      // Registrar en audit log
      await tx.auditLog.create({
        data: {
          accion: 'PRODUCCION',
          tablaAfectada: 'ARTICULO',
          registroId: prod.id,
          valorNuevo: prod as any,
          usuarioId: req.user.id,
          empresaId: req.user.empresaId
        }
      });

      return prod;
    });

    res.json(produccion);
  } catch (error: any) {
    console.error('Error en controlador de producción:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen problemas de vinculación con la base de datos (ej. un inventario, insumo o usuario fue modificado o eliminado).'
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};
