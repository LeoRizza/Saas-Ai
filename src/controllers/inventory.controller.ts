import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { AppError, handleError } from '../utils/errors';

const prisma = new PrismaClient();

/**
 * Genera un nombre seguro para un archivo subido por multer
 * @param file Archivo de multer
 * @returns Ruta segura del archivo (/uploads/nombreSeguro)
 */
function getSecureImageUrl(file: Express.Multer.File): string {
  return `/uploads/${file.filename}`;
}

/**
 * GET /api/inventory
 * Obtiene todos los artículos de la empresa del usuario autenticado
 */
export async function getInventory(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;

    const articulos = await prisma.articulo.findMany({
      where: { empresaId: user.empresaId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(articulos);
  } catch (error: any) {
    handleError(res, error);
  }
}

/**
 * POST /api/inventory
 * Crea un nuevo artículo con soporte para hasta 4 imágenes
 */
export async function createArticulo(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const {
      nombre,
      stockUnidades,
      stockKilos,
      unidadesPorCaja,
      precio,
      inventarioId,
      categoria,
      codigoBarras,
      descripcion,
      subcategoria,
      longDescription,
      sku,
      serie,
      videoUrl
    } = req.body;

    // Validaciones básicas
    if (!nombre || !inventarioId) {
      throw new AppError('Nombre e Inventario son requeridos', 400);
    }

    // Procesar archivos de imagen - confiando en que el frontend ya los optimizó
    const files = req.files as Express.Multer.File[];
    const imageUrls = (files || []).map(getSecureImageUrl);

    // Construir objeto de datos
    const data: any = {
      nombre: nombre.trim(),
      precio: parseFloat(precio || '0'),
      inventarioId,
      stockUnidades: parseFloat(stockUnidades || '0'),
      stockKilos: parseFloat(stockKilos || '0'),
      unidadesPorCaja: parseInt(unidadesPorCaja || '1'),
      empresaId: user.empresaId,
      categoria: (categoria || 'General').trim(),
      codigoBarras: codigoBarras ? codigoBarras.trim() : null,
      descripcion: descripcion ? descripcion.trim() : null,
      subcategoria: subcategoria ? subcategoria.trim() : null,
      longDescription: longDescription ? longDescription.trim() : null,
      sku: sku ? sku.trim() : null,
      serie: serie ? serie.trim() : null,
      videoUrl: videoUrl ? videoUrl.trim() : null,
      imagenes: imageUrls.length > 0 ? imageUrls : []
    };

    // Crear artículo con transacción
    const articulo = await prisma.$transaction(async (tx) => {
      const art = await tx.articulo.create({ data });
      return art;
    });

    // 🔥 LOG FUERA DE LA TRANSACCIÓN - Fire & Forget
    prisma.auditLog
      .create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'ARTICULO',
          registroId: articulo.id,
          valorNuevo: articulo as any,
          usuarioId: user.id,
          empresaId: user.empresaId
        }
      })
      .catch((err) => console.error('Error AuditLog Artículo:', err));

    res.status(201).json(articulo);
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El registro está protegido porque ya tiene movimientos asociados (ventas, producción, etc). Recomendamos ocultarlo o dejar su stock en 0.'
      });
      return;
    }
    handleError(res, error);
  }
}

/**
 * PUT /api/inventory/:id
 * Actualiza un artículo existente con soporte para gestionar imágenes
 */
export async function updateArticulo(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const {
      nombre,
      stockUnidades,
      stockKilos,
      unidadesPorCaja,
      precio,
      inventarioId,
      categoria,
      codigoBarras,
      clearImg1,
      clearImg2,
      clearImg3,
      clearImg4,
      descripcion,
      subcategoria,
      longDescription,
      sku,
      serie,
      videoUrl
    } = req.body;

    if (!id) {
      throw new AppError('ID del artículo es requerido', 400);
    }

    // Procesar archivos de imagen nuevos - confiando en que el frontend ya los optimizó
    const files = req.files as Express.Multer.File[];
    const imageUrls = (files || []).map(getSecureImageUrl);

    const { art, oldArt } = await prisma.$transaction(async (tx) => {
      // Obtener artículo actual
      const oldArtData = await tx.articulo.findUnique({ where: { id } });

      if (!oldArtData) {
        throw new AppError('Artículo no encontrado', 404);
      }

      // Verificar permisos
      if (oldArtData.empresaId !== user.empresaId) {
        throw new AppError('No tienes permiso para modificar este artículo', 403);
      }

      // 1. Obtener las imágenes que el usuario decidió mantener
      const retainedImages = req.body.retainedImages ? JSON.parse(req.body.retainedImages) : (oldArtData.imagenes || []);
      // 2. Sumar las imágenes nuevas procesadas
      let finalImages = [...retainedImages, ...imageUrls];
      // 3. (Opcional) Limitar por seguridad según la configuración de la empresa
      // const maxImages = user.empresa.config?.maxImagenes || 4;
      // finalImages = finalImages.slice(0, maxImages);

      // Construir objeto de datos para actualización
      const data: any = {
        nombre: nombre ? nombre.trim() : oldArtData.nombre,
        precio: precio !== undefined ? parseFloat(precio) : oldArtData.precio,
        costo: req.body.costo !== undefined ? parseFloat(req.body.costo) : oldArtData.costo,
        inventarioId: inventarioId || oldArtData.inventarioId,
        stockUnidades: stockUnidades !== undefined ? parseFloat(stockUnidades) : oldArtData.stockUnidades,
        stockKilos: stockKilos !== undefined ? parseFloat(stockKilos) : oldArtData.stockKilos,
        unidadesPorCaja: unidadesPorCaja !== undefined ? parseInt(unidadesPorCaja) : oldArtData.unidadesPorCaja,
        categoria: categoria ? categoria.trim() : oldArtData.categoria,
        descripcion: descripcion !== undefined ? (descripcion ? descripcion.trim() : null) : oldArtData.descripcion,
        subcategoria: subcategoria !== undefined ? (subcategoria ? subcategoria.trim() : null) : oldArtData.subcategoria,
        longDescription: longDescription !== undefined ? (longDescription ? longDescription.trim() : null) : oldArtData.longDescription,
        sku: sku !== undefined ? (sku ? sku.trim() : null) : oldArtData.sku,
        serie: serie !== undefined ? (serie ? serie.trim() : null) : oldArtData.serie,
        videoUrl: videoUrl !== undefined ? (videoUrl ? videoUrl.trim() : null) : oldArtData.videoUrl,
        codigoBarras: codigoBarras !== undefined ? (codigoBarras ? codigoBarras.trim() : null) : oldArtData.codigoBarras,
        imagenes: finalImages
      };

      // Actualizar artículo
      const updatedArt = await tx.articulo.update({ where: { id }, data });

      return { art: updatedArt, oldArt: oldArtData };
    });

    // 🔥 LOG FUERA DE LA TRANSACCIÓN - Fire & Forget
    prisma.auditLog
      .create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'ARTICULO',
          registroId: art.id,
          valorAnterior: oldArt as any,
          valorNuevo: art as any,
          usuarioId: user.id,
          empresaId: art.empresaId
        }
      })
      .catch((err) => console.error('Error AuditLog Update Articulo:', err));

    res.json(art);
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El registro está protegido porque ya tiene movimientos asociados (ventas, producción, etc). Recomendamos ocultarlo o dejar su stock en 0.'
      });
      return;
    }
    handleError(res, error);
  }
}

/**
 * DELETE /api/inventory/:id
 * Elimina un artículo con verificación de permisos
 */
export async function deleteArticulo(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!id) {
      throw new AppError('ID del artículo es requerido', 400);
    }

    const oldArt = await prisma.$transaction(async (tx) => {
      // Obtener artículo
      const artData = await tx.articulo.findUnique({ where: { id } });

      if (!artData) {
        throw new AppError('Artículo no encontrado', 404);
      }

      // Verificar permisos
      if (artData.empresaId !== user.empresaId) {
        throw new AppError('No tienes permiso para eliminar este artículo', 403);
      }

      // Eliminar artículo
      await tx.articulo.delete({ where: { id } });

      return artData;
    });

    // 🔥 LOG FUERA DE LA TRANSACCIÓN - Fire & Forget
    prisma.auditLog
      .create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'ARTICULO',
          registroId: id,
          valorAnterior: oldArt as any,
          usuarioId: user.id,
          empresaId: user.empresaId
        }
      })
      .catch((err) => console.error('Error AuditLog Delete Articulo:', err));

    res.json({ success: true, message: 'Artículo eliminado correctamente' });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El registro está protegido porque ya tiene movimientos asociados (ventas, producción, etc). Recomendamos ocultarlo o dejar su stock en 0.'
      });
      return;
    }
    handleError(res, error);
  }
}

/**
 * POST /api/inventory/bulk
 * Importa artículos desde un archivo CSV
 * Utiliza csv-parse para manejar correctamente saltos de línea dentro de campos
 */
export async function bulkImportArticulos(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const inventarioId = req.body.inventarioId;
    if (!inventarioId) throw new AppError('Inventario de destino requerido', 400);
    if (!req.file) throw new AppError('Archivo CSV requerido', 400);

    const fileContent = fs.readFileSync(req.file.path, 'utf-8');

    // Usar csv-parse para manejar correctamente saltos de línea dentro de campos
    const items: any[] = parse(fileContent, {
      columns: (header) => header.map((h: string) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true
    });

    if (!items || items.length === 0) {
      throw new AppError('El CSV está vacío o no tiene el formato correcto', 400);
    }

    const { processed, auditLogsToCreate } = await prisma.$transaction(async (tx) => {
      const items_processed: any[] = [];
      const logs: any[] = [];

      for (const item of items) {
        if (!item.nombre || item.nombre.trim() === '') continue;

        let codigoBarras = item.codigo_barras || item.codigobarras || null;
        if (codigoBarras === '') codigoBarras = null;

        const costo = parseFloat(item.costo) || 0;
        const precio = parseFloat(item.precio) || 0;
        const stockUnidades = parseFloat(item.stock_unidades || item.stockunidades) || 0;
        const stockKilos = parseFloat(item.stock_kilos || item.stockkilos) || 0;
        const unidadesPorCaja = parseInt(item.unidades_por_caja || item.unidadesporcaja) || 1;
        const skuStr = item.sku ? item.sku.trim() : null;

        const articuloData = {
          nombre: item.nombre.trim(),
          costo,
          precio,
          inventarioId,
          stockUnidades,
          stockKilos,
          unidadesPorCaja,
          empresaId: user.empresaId,
          categoria: (item.categoria || 'General').trim(),
          codigoBarras,
          descripcion: item.descripcion ? item.descripcion.trim() : null,
          subcategoria: item.subcategoria ? item.subcategoria.trim() : null,
          longDescription: item.long_description || item.longdescription ? (item.long_description || item.longdescription).trim() : null,
          sku: skuStr,
          serie: item.serie ? item.serie.trim() : null
        };

        let art;
        let accionAuditoria = 'IMPORTACION_CSV';

        if (skuStr) {
          const existingArt = await tx.articulo.findFirst({
            where: { sku: skuStr, empresaId: user.empresaId }
          });
          if (existingArt) {
            art = await tx.articulo.update({
              where: { id: existingArt.id },
              data: articuloData
            });
          } else {
            art = await tx.articulo.create({ data: articuloData });
          }
        } else {
          art = await tx.articulo.create({ data: articuloData });
        }

        logs.push({
          accion: accionAuditoria,
          tablaAfectada: 'ARTICULO',
          registroId: art.id,
          valorNuevo: art as any,
          usuarioId: user.id,
          empresaId: user.empresaId
        });

        items_processed.push(art);
      }

      return { processed: items_processed, auditLogsToCreate: logs };
    });

    // 🔥 LOGS FUERA DE LA TRANSACCIÓN - Fire & Forget
    auditLogsToCreate.forEach((logData) => {
      prisma.auditLog.create({ data: logData }).catch(err => console.error(err));
    });

    res.status(201).json({
      success: true,
      message: `${processed.length} artículos procesados correctamente`,
      articulos: processed
    });
  } catch (error: any) {
    handleError(res, error);
  }
}

/**
 * GET /api/inventory/export
 * Exporta los artículos de un inventario específico a formato CSV
 */
export async function exportInventoryCSV(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const { inventarioId } = req.query;

    if (!inventarioId) {
      throw new AppError('Se requiere el ID del inventario a exportar', 400);
    }

    const articulos = await prisma.articulo.findMany({
      where: { empresaId: user.empresaId, inventarioId: inventarioId as string },
      orderBy: { nombre: 'asc' }
    });

    // Headers exactos compatibles con la importación (agregado "costo")
    const headers = ['nombre', 'costo', 'precio', 'stock_unidades', 'stock_kilos', 'unidades_por_caja', 'categoria', 'subcategoria', 'descripcion', 'long_description', 'codigo_barras', 'sku', 'serie'];

    const escapeCSV = (field: any): string => {
      if (field === null || field === undefined) return '';
      let str = String(field);
      if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = articulos.map(articulo =>
      headers.map(header => {
        let value: any;
        switch (header) {
          case 'stock_unidades': value = articulo.stockUnidades; break;
          case 'stock_kilos': value = articulo.stockKilos; break;
          case 'unidades_por_caja': value = articulo.unidadesPorCaja; break;
          case 'long_description': value = articulo.longDescription; break;
          case 'codigo_barras': value = articulo.codigoBarras; break;
          case 'costo': value = articulo.costo || 0; break;
          default: value = (articulo as any)[header];
        }
        return escapeCSV(value);
      }).join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario_export.csv"');
    res.status(200).send(csvContent);
  } catch (error: any) {
    handleError(res, error);
  }
}

/**
 * POST /api/inventory/transfer
 * Transfiere stock de un artículo a otro inventario
 */
export async function transferirStock(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const { articuloOrigenId, inventarioDestinoId, unidades, kilos } = req.body;

    // Validaciones iniciales
    if (!articuloOrigenId || !inventarioDestinoId) {
      throw new AppError('Artículo de origen e inventario de destino son requeridos', 400);
    }

    const unidadesTransferir = parseFloat(unidades) || 0;
    const kilosTransferir = parseFloat(kilos) || 0;

    if (unidadesTransferir <= 0 && kilosTransferir <= 0) {
      throw new AppError('Debe especificar unidades o kilos a transferir', 400);
    }

    // Ejecutar en transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // Obtener artículo de origen
      const oldArt = await tx.articulo.findUnique({
        where: { id: articuloOrigenId }
      });

      if (!oldArt) {
        throw new AppError('Artículo de origen no encontrado', 404);
      }

      // Verificar permisos
      if (oldArt.empresaId !== user.empresaId) {
        throw new AppError('No tienes permiso para transferir este artículo', 403);
      }

      // Validar stock suficiente
      if (unidadesTransferir > 0 && oldArt.stockUnidades < unidadesTransferir) {
        throw new AppError(
          `Stock insuficiente. Disponibles: ${oldArt.stockUnidades} unidades, solicitadas: ${unidadesTransferir}`,
          400
        );
      }

      if (kilosTransferir > 0 && oldArt.stockKilos < kilosTransferir) {
        throw new AppError(
          `Stock insuficiente. Disponibles: ${oldArt.stockKilos} kilos, solicitados: ${kilosTransferir}`,
          400
        );
      }

      // Buscar si existe un artículo con el mismo nombre en el inventario destino
      const articuloDestino = await tx.articulo.findFirst({
        where: {
          nombre: oldArt.nombre,
          inventarioId: inventarioDestinoId,
          empresaId: user.empresaId
        }
      });

      // Restar stock en artículo de origen
      const articuloOrigen = await tx.articulo.update({
        where: { id: articuloOrigenId },
        data: {
          stockUnidades: oldArt.stockUnidades - unidadesTransferir,
          stockKilos: oldArt.stockKilos - kilosTransferir
        }
      });

      let articuloActualizado: any;

      if (articuloDestino) {
        // Si existe, sumar el stock
        articuloActualizado = await tx.articulo.update({
          where: { id: articuloDestino.id },
          data: {
            stockUnidades: articuloDestino.stockUnidades + unidadesTransferir,
            stockKilos: articuloDestino.stockKilos + kilosTransferir
          }
        });
      } else {
        // Si no existe, crear uno nuevo copiando datos del origen
        articuloActualizado = await tx.articulo.create({
          data: {
            nombre: oldArt.nombre,
            precio: oldArt.precio,
            inventarioId: inventarioDestinoId,
            stockUnidades: unidadesTransferir,
            stockKilos: kilosTransferir,
            unidadesPorCaja: oldArt.unidadesPorCaja,
            empresaId: user.empresaId,
            categoria: oldArt.categoria,
            codigoBarras: oldArt.codigoBarras,
            descripcion: oldArt.descripcion,
            subcategoria: oldArt.subcategoria,
            longDescription: oldArt.longDescription,
            sku: oldArt.sku,
            serie: oldArt.serie,
            videoUrl: oldArt.videoUrl,
            imagenes: oldArt.imagenes || []
          }
        });
      }

      return {
        articuloOrigen,
        articuloDestino: articuloActualizado,
        esNuevo: !articuloDestino,
        oldArtData: oldArt
      };
    });

    // 🔥 LOGS FUERA DE LA TRANSACCIÓN - Fire & Forget
    // Log para artículo de origen
    prisma.auditLog
      .create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'ARTICULO',
          registroId: resultado.articuloOrigen.id,
          valorAnterior: resultado.oldArtData as any,
          valorNuevo: resultado.articuloOrigen as any,
          motivo: `Transferencia a inventario ${inventarioDestinoId}: ${unidadesTransferir} unidades, ${kilosTransferir} kilos`,
          usuarioId: user.id,
          empresaId: user.empresaId
        }
      })
      .catch((err) => console.error('Error AuditLog Transfer Origen:', err));

    // Log para artículo de destino
    prisma.auditLog
      .create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'ARTICULO',
          registroId: resultado.articuloDestino.id,
          valorNuevo: resultado.articuloDestino as any,
          motivo: `Transferencia desde artículo ${articuloOrigenId}: ${unidadesTransferir} unidades, ${kilosTransferir} kilos`,
          usuarioId: user.id,
          empresaId: user.empresaId
        }
      })
      .catch((err) => console.error('Error AuditLog Transfer Destino:', err));

    res.status(200).json({
      success: true,
      message: resultado.esNuevo
        ? `Transferencia completada. Se creó nuevo artículo en inventario destino con ${unidadesTransferir} unidades y ${kilosTransferir} kilos`
        : `Transferencia completada. Se agregaron ${unidadesTransferir} unidades y ${kilosTransferir} kilos al artículo destino`,
      data: {
        articuloOrigen: resultado.articuloOrigen,
        articuloDestino: resultado.articuloDestino,
        esNuevo: resultado.esNuevo
      }
    });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El registro está protegido porque ya tiene movimientos asociados (ventas, producción, etc). Recomendamos ocultarlo o dejar su stock en 0.'
      });
      return;
    }
    handleError(res, error);
  }
}
