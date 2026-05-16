import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errors';

const prisma = new PrismaClient();

/**
 * ==========================================
 * --- SERVICIO DE CLIENTES ---
 * ==========================================
 * 
 * Contiene toda la lógica CRUD para gestión de clientes.
 * Incluye auditoría detallada de cambios.
 */

// ==========================================
// 📋 GET - Obtener todos los clientes
// ==========================================
export async function getClientes(empresaId: string) {
  try {
    const clientes = await prisma.cliente.findMany({
      where: { empresaId },
      orderBy: { createdAt: 'desc' }
    });
    return clientes;
  } catch (error: any) {
    throw new AppError(`Error al obtener clientes: ${error.message}`, 500);
  }
}

// ==========================================
// ✅ POST - Crear nuevo cliente
// ==========================================
export async function createCliente(
  clienteData: {
    nombre: string;
    razonSocial?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    cuit?: string;
    condicionIva?: string;
    comentarios?: string;
    fechaRecordatorio?: Date;
    tag?: string;
  },
  usuarioId: string,
  empresaId: string
) {
  try {
    const data = {
      nombre: clienteData.nombre,
      razonSocial: clienteData.razonSocial || null,
      email: clienteData.email || null,
      telefono: clienteData.telefono || null,
      direccion: clienteData.direccion || null,
      cuit: clienteData.cuit || null,
      condicionIva: clienteData.condicionIva || null,
      comentarios: clienteData.comentarios || null,
      fechaRecordatorio: clienteData.fechaRecordatorio || null,
      tag: clienteData.tag || null,
      empresaId
    };

    const cliente = await prisma.$transaction(async (tx) => {
      // 💾 Crear el cliente
      const cli = await tx.cliente.create({ data });

      // 📝 Registrar en auditoría
      await tx.auditLog.create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'CLIENTE',
          registroId: cli.id,
          valorNuevo: cli as any,
          usuarioId,
          empresaId
        }
      });

      return cli;
    });

    return cliente;
  } catch (error: any) {
    throw new AppError(`Error al crear cliente: ${error.message}`, 500);
  }
}

// ==========================================
// 🔄 PUT - Actualizar cliente (con auditoría detallada)
// ==========================================
export async function updateCliente(
  clienteId: string,
  clienteData: {
    nombre?: string;
    razonSocial?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    cuit?: string;
    condicionIva?: string;
    comentarios?: string;
    fechaRecordatorio?: Date;
    tag?: string;
  },
  usuarioId: string,
  empresaIdUsuario: string
) {
  try {
    const cliente = await prisma.$transaction(async (tx) => {
      // 🔍 Obtener cliente anterior
      const oldCli = await tx.cliente.findUnique({ where: { id: clienteId } });

      if (!oldCli) {
        throw new AppError('Cliente no encontrado', 404);
      }

      // 🔒 SEGURIDAD: Validar que el cliente pertenezca a la empresa del usuario
      if (oldCli.empresaId !== empresaIdUsuario) {
        throw new AppError('No tienes permiso para modificar este cliente', 403);
      }

      // 🔥 Preparar datos a actualizar (solo campos no nulos)
      const data: any = {};
      if (clienteData.nombre !== undefined) data.nombre = clienteData.nombre;
      if (clienteData.razonSocial !== undefined) data.razonSocial = clienteData.razonSocial;
      if (clienteData.email !== undefined) data.email = clienteData.email;
      if (clienteData.telefono !== undefined) data.telefono = clienteData.telefono;
      if (clienteData.direccion !== undefined) data.direccion = clienteData.direccion;
      if (clienteData.cuit !== undefined) data.cuit = clienteData.cuit;
      if (clienteData.condicionIva !== undefined) data.condicionIva = clienteData.condicionIva;
      if (clienteData.comentarios !== undefined) data.comentarios = clienteData.comentarios;
      if (clienteData.fechaRecordatorio !== undefined) data.fechaRecordatorio = clienteData.fechaRecordatorio;
      if (clienteData.tag !== undefined) data.tag = clienteData.tag;

      // 📊 Comparar campos y construir descripción detallada de cambios
      const camposAuditar = [
        { campo: 'nombre', label: 'Nombre' },
        { campo: 'razonSocial', label: 'Razón Social' },
        { campo: 'email', label: 'Email' },
        { campo: 'telefono', label: 'Teléfono' },
        { campo: 'direccion', label: 'Dirección' },
        { campo: 'cuit', label: 'CUIT' },
        { campo: 'condicionIva', label: 'Condición IVA' },
        { campo: 'comentarios', label: 'Comentarios' },
        { campo: 'fechaRecordatorio', label: 'Fecha Recordatorio' },
        { campo: 'tag', label: 'Tag' }
      ];

      const cambiosDetectados: string[] = [];
      const camposModificados: { campo: string; valorAnterior: any; valorNuevo: any }[] = [];

      for (const { campo, label } of camposAuditar) {
        const valorAnterior = (oldCli as any)[campo];
        const valorNuevo = (data as any)[campo];

        // Normalizar valores para comparación (null, undefined, '' se consideran iguales)
        const normalizar = (v: any) => (v === null || v === undefined || v === '') ? null : v;
        const oldNorm = normalizar(valorAnterior);
        const newNorm = normalizar(valorNuevo);

        if (oldNorm !== newNorm) {
          const oldDisplay = oldNorm ?? '(vacío)';
          const newDisplay = newNorm ?? '(vacío)';
          cambiosDetectados.push(`${label}: "${oldDisplay}" → "${newDisplay}"`);
          camposModificados.push({ campo, valorAnterior: oldNorm, valorNuevo: newNorm });
        }
      }

      // 💾 Actualizar cliente
      const cli = await tx.cliente.update({ where: { id: clienteId }, data });

      // 📝 Solo crear log si hubo cambios reales
      if (cambiosDetectados.length > 0) {
        const descripcionCambios = cambiosDetectados.join(' | ');

        await tx.auditLog.create({
          data: {
            accion: 'MODIFICACION_CLIENTE',
            tablaAfectada: 'CLIENTE',
            registroId: cli.id,
            valorAnterior: {
              cambios: descripcionCambios,
              detalles: camposModificados
            } as any,
            valorNuevo: cli as any,
            usuarioId,
            empresaId: empresaIdUsuario
          }
        });
      }

      return cli;
    });

    return cliente;
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Error al actualizar cliente: ${error.message}`, 500);
  }
}

// ==========================================
// ❌ DELETE - Eliminar cliente
// ==========================================
export async function deleteCliente(
  clienteId: string,
  usuarioId: string,
  empresaIdUsuario: string
) {
  try {
    await prisma.$transaction(async (tx) => {
      // 🔍 Obtener cliente con relaciones
      const oldCli = await tx.cliente.findUnique({
        where: { id: clienteId },
        include: {
          _count: {
            select: { ventas: true }
          }
        }
      });

      if (!oldCli) {
        throw new AppError('Cliente no encontrado', 404);
      }

      // 🔒 SEGURIDAD: Validar que el cliente pertenezca a la empresa del usuario
      if (oldCli.empresaId !== empresaIdUsuario) {
        throw new AppError('No tienes permiso para eliminar este cliente', 403);
      }

      // 🚫 Validar que no tenga ventas asociadas
      if (oldCli._count && oldCli._count.ventas > 0) {
        throw new AppError(
          'No se puede eliminar: Este cliente tiene ventas registradas.',
          400
        );
      }

      // 💾 Eliminar cliente
      await tx.cliente.delete({ where: { id: clienteId } });

      // 📝 Registrar en auditoría
      await tx.auditLog.create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'CLIENTE',
          registroId: clienteId,
          valorAnterior: oldCli as any,
          usuarioId,
          empresaId: empresaIdUsuario
        }
      });
    });

    return { success: true, message: 'Cliente eliminado correctamente' };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Error al eliminar cliente: ${error.message}`, 500);
  }
}
