import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';

// ==========================================
// --- INICIALIZACIÓN ---
// ==========================================
const prisma = new PrismaClient();

// ==========================================
// --- RATE LIMITER PARA CATÁLOGO PÚBLICO ---
// ==========================================
export const catalogoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Tiempo: 15 minutos
  max: 50,
  message: { message: 'Demasiadas peticiones. Por favor, intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// --- CONTROLADOR DE INVENTARIO PÚBLICO ---
// ==========================================

/**
 * GET /api/public/inventory/:empresaId
 * Obtiene el catálogo de artículos disponibles de una empresa (datos públicos)
 * Excluye información sensible como stock exacto
 * 
 * Query params opcionales:
 *   - inventarios: IDs de inventarios específicos (separados por comas)
 * 
 * Response: Array de artículos disponibles sin información de stock exacto
 */
export const getPublicInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresaId } = req.params;
    const { inventarios } = req.query;

    // Validación: empresaId es requerido
    if (!empresaId || typeof empresaId !== 'string') {
      res.status(400).json({ 
        message: 'Se requiere el ID de la empresa en los parámetros' 
      });
      return;
    }

    // Construcción de la cláusula WHERE
    const whereClause: any = {
      empresaId
    };

    // Filtrar por inventarios específicos si se proporciona
    if (inventarios && typeof inventarios === 'string') {
      const inventariosArray = inventarios.split(',').filter(Boolean);
      if (inventariosArray.length > 0) {
        whereClause.inventarioId = { in: inventariosArray };
      }
    }

    // Obtener artículos disponibles
    const articulosDisponibles = await prisma.articulo.findMany({
      where: whereClause,
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        longDescription: true,
        precio: true,
        categoria: true,
        subcategoria: true,
        unidadesPorCaja: true,
        codigoBarras: true,
        sku: true,
        serie: true,
        imagenUrl: true,
        imagenUrl2: true,
        imagenUrl3: true,
        imagenUrl4: true,
        videoUrl: true,
        inventarioId: true,
        stockUnidades: true,
        stockKilos: true,
        inventario: { select: { nombre: true } }
      },
      orderBy: { nombre: 'asc' }
    });

    // Mapear a datos públicos seguros (excluir stock exacto)
    const catalogoSeguro = articulosDisponibles.map((articulo) => {
      const estado = (articulo.stockUnidades > 0 || articulo.stockKilos > 0) ? 'Disponible' : 'Agotado';
      const { stockUnidades, stockKilos, inventarioId, inventario, ...datosPublicos } = articulo;
      return {
        ...datosPublicos,
        sucursal: articulo.inventario?.nombre,
        estado
      };
    });

    res.status(200).json(catalogoSeguro);
  } catch (error: any) {
    console.error('❌ Error en API Pública:', error);
    if (error.name === 'PrismaClientValidationError') {
      res.status(400).json({
        message: 'Parámetros de búsqueda inválidos.',
      });
      return;
    }
    res.status(500).json({ 
      message: 'Error interno al cargar el catálogo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
