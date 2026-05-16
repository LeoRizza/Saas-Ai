import express, { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { handleError } from '../utils/errors';
import {
  getClientes,
  createCliente,
  updateCliente,
  deleteCliente
} from '../services/clientes.service';

const router: Router = express.Router();

/**
 * ==========================================
 * --- RUTAS DE CLIENTES ---
 * ==========================================
 * 
 * GET    /api/clientes           - Obtener todos los clientes
 * POST   /api/clientes           - Crear nuevo cliente
 * PUT    /api/clientes/:id       - Actualizar cliente
 * DELETE /api/clientes/:id       - Eliminar cliente
 */

// ==========================================
// 📋 GET /api/clientes
// ==========================================
/**
 * Obtiene la lista completa de clientes de la empresa del usuario.
 * Requiere autenticación.
 */
router.get('/', authenticate, async (req: any, res: any) => {
  try {
    const clientes = await getClientes(req.user.empresaId);
    res.json(clientes);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ==========================================
// ✅ POST /api/clientes
// ==========================================
/**
 * Crea un nuevo cliente.
 * Requiere autenticación.
 * 
 * Body esperado:
 * {
 *   nombre: string (requerido)
 *   razonSocial?: string
 *   email?: string
 *   telefono?: string
 *   direccion?: string
 *   cuit?: string
 *   condicionIva?: string
 *   comentarios?: string
 *   fechaRecordatorio?: Date
 *   tag?: string
 * }
 */
router.post('/', authenticate, async (req: any, res: any) => {
  try {
    const {
      nombre,
      razonSocial,
      email,
      telefono,
      direccion,
      cuit,
      condicionIva,
      comentarios,
      fechaRecordatorio,
      tag
    } = req.body;

    const cliente = await createCliente(
      {
        nombre,
        razonSocial,
        email,
        telefono,
        direccion,
        cuit,
        condicionIva,
        comentarios,
        fechaRecordatorio,
        tag
      },
      req.user.id,
      req.user.empresaId
    );

    res.json(cliente);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ==========================================
// 🔄 PUT /api/clientes/:id
// ==========================================
/**
 * Actualiza un cliente existente.
 * Registra todos los cambios en auditoría de forma detallada.
 * Requiere autenticación.
 * 
 * Params:
 * - id: string (ID del cliente)
 * 
 * Body (todos los campos son opcionales):
 * {
 *   nombre?: string
 *   razonSocial?: string
 *   email?: string
 *   telefono?: string
 *   direccion?: string
 *   cuit?: string
 *   condicionIva?: string
 *   comentarios?: string
 *   fechaRecordatorio?: Date
 *   tag?: string
 * }
 */
router.put('/:id', authenticate, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      razonSocial,
      email,
      telefono,
      direccion,
      cuit,
      condicionIva,
      comentarios,
      fechaRecordatorio,
      tag
    } = req.body;

    const cliente = await updateCliente(
      id,
      {
        nombre,
        razonSocial,
        email,
        telefono,
        direccion,
        cuit,
        condicionIva,
        comentarios,
        fechaRecordatorio,
        tag
      },
      req.user.id,
      req.user.empresaId
    );

    res.json(cliente);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ==========================================
// ❌ DELETE /api/clientes/:id
// ==========================================
/**
 * Elimina un cliente.
 * No se puede eliminar si tiene ventas registradas.
 * Requiere autenticación.
 * 
 * Params:
 * - id: string (ID del cliente)
 */
router.delete('/:id', authenticate, async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const result = await deleteCliente(id, req.user.id, req.user.empresaId);

    res.json(result);
  } catch (error: any) {
    handleError(res, error);
  }
});

export default router;
