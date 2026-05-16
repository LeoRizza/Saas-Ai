import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { AppError, handleError } from '../utils/errors';

const prisma = new PrismaClient();

// GET /api/clientes
export async function getClientes(req: Request, res: Response) {
  try {
    const user = (req as any).user;

    const clientes = await prisma.cliente.findMany({
      where: { empresaId: user.empresaId, activo: true }
    });

    res.json(clientes);
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El cliente está protegido porque ya tiene registros asociados (ventas, historial, etc). Recomendamos no eliminarlo si ya tuvo actividad.'
      });
      return;
    }
    handleError(res, error);
  }
}

// POST /api/clientes
export async function createCliente(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const {
      nombre, razonSocial, email, telefono, direccion,
      cuit, condicionIva, comentarios, fechaRecordatorio, tag
    } = req.body;

    // Validación de duplicados: Email y Teléfono
    if (email && email.trim() !== '') {
      const existingEmail = await prisma.cliente.findFirst({
        where: { email: email.trim(), empresaId: user.empresaId, activo: true }
      });
      if (existingEmail) {
        return res.status(400).json({ message: 'El email ya existe' });
      }
    }
    if (telefono && telefono.trim() !== '') {
      const existingPhone = await prisma.cliente.findFirst({
        where: { telefono: telefono.trim(), empresaId: user.empresaId, activo: true }
      });
      if (existingPhone) {
        return res.status(400).json({ message: 'El teléfono ya existe' });
      }
    }

    const data = {
      nombre,
      razonSocial,
      email,
      telefono,
      direccion,
      cuit,
      condicionIva,
      comentarios,
      fechaRecordatorio,
      tag,
      empresaId: user.empresaId
    };

    const cliente = await prisma.$transaction(async (tx) => {
      const cli = await tx.cliente.create({ data });

      await tx.auditLog.create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'CLIENTE',
          registroId: cli.id,
          valorNuevo: cli as any,
          usuarioId: user.id,
          empresaId: user.empresaId
        }
      });

      return cli;
    });

    res.json(cliente);
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El cliente está protegido porque ya tiene registros asociados (ventas, historial, etc). Recomendamos no eliminarlo si ya tuvo actividad.'
      });
      return;
    }
    handleError(res, error);
  }
}

// PUT /api/clientes/:id
export async function updateCliente(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const {
      nombre, razonSocial, email, telefono, direccion,
      cuit, condicionIva, comentarios, fechaRecordatorio, tag
    } = req.body;

    const data = {
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
    };

    const cliente = await prisma.$transaction(async (tx) => {
      const oldCli = await tx.cliente.findUnique({ where: { id } });
      if (!oldCli) throw new AppError('Cliente no encontrado', 404);

      // 🔒 SEGURIDAD: Validar que el cliente pertenezca a la empresa del usuario
      if (oldCli.empresaId !== user.empresaId) {
        throw new AppError('No tienes permiso para modificar este cliente', 403);
      }

      // 🔥 Comparar campos y construir descripción detallada de cambios
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

      const cli = await tx.cliente.update({ where: { id }, data });

      // Solo crear log si hubo cambios reales
      if (cambiosDetectados.length > 0) {
        const descripcionCambios = cambiosDetectados.join(' | ');

        await tx.auditLog.create({
          data: {
            accion: 'MODIFICACION_CLIENTE',
            tablaAfectada: 'CLIENTE',
            registroId: cli.id,
            valorAnterior: { cambios: descripcionCambios, detalles: camposModificados } as any,
            valorNuevo: cli as any,
            usuarioId: user.id,
            empresaId: user.empresaId
          }
        });
      }

      return cli;
    });

    res.json(cliente);
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El cliente está protegido porque ya tiene registros asociados (ventas, historial, etc). Recomendamos no eliminarlo si ya tuvo actividad.'
      });
      return;
    }
    handleError(res, error);
  }
}

// DELETE /api/clientes/:id
export async function deleteCliente(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const oldCli = await tx.cliente.findUnique({
        where: { id },
        include: {
          _count: {
            select: { ventas: true }
          }
        }
      });

      if (!oldCli) throw new AppError('Cliente no encontrado', 404);

      // 🔒 SEGURIDAD: Validar que el cliente pertenezca a la empresa del usuario
      if (oldCli.empresaId !== user.empresaId) {
        throw new AppError('No tienes permiso para eliminar este cliente', 403);
      }

      if (oldCli._count && oldCli._count.ventas > 0) {
        throw new AppError('No se puede eliminar: Este cliente tiene ventas registradas.', 400);
      }

      await tx.cliente.update({ where: { id }, data: { activo: false } });

      await tx.auditLog.create({
        data: {
          accion: 'AJUSTE_MANUAL',
          tablaAfectada: 'CLIENTE',
          registroId: id,
          valorAnterior: oldCli as any,
          usuarioId: user.id,
          empresaId: user.empresaId
        }
      });
    });

    res.json({ success: true, message: 'Cliente eliminado correctamente (baja lógica)' });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'No se puede completar la acción: El cliente está protegido porque ya tiene registros asociados (ventas, historial, etc). Recomendamos no eliminarlo si ya tuvo actividad.'
      });
      return;
    }
    handleError(res, error);
  }
}

// POST /api/clientes/bulk
export async function bulkImportClientes(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!req.file) throw new AppError('Archivo CSV requerido', 400);

    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
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
      const clients_processed: any[] = [];
      const logs: any[] = [];

      for (const item of items) {
        if (!item.nombre || item.nombre.trim() === '') continue;

        const email = item.email ? item.email.trim() : null;
        const telefono = item.telefono ? item.telefono.trim() : null;

        // Validar duplicados para no romper la transacción
        if (email) {
          const exists = await tx.cliente.findFirst({
            where: { email, empresaId: user.empresaId, activo: true }
          });
          if (exists) continue; // Omitir duplicado
        }
        if (telefono) {
          const exists = await tx.cliente.findFirst({
            where: { telefono, empresaId: user.empresaId, activo: true }
          });
          if (exists) continue; // Omitir duplicado
        }

        const data = {
          nombre: item.nombre.trim(),
          razonSocial: item.razon_social ? item.razon_social.trim() : item.nombre.trim(),
          email: email,
          telefono: telefono,
          direccion: item.direccion ? item.direccion.trim() : null,
          cuit: item.cuit ? item.cuit.trim() : null,
          condicionIva: item.condicion_iva ? item.condicion_iva.trim() : 'Consumidor Final',
          comentarios: item.comentarios ? item.comentarios.trim() : null,
          tag: item.tag ? item.tag.trim() : null,
          empresaId: user.empresaId
        };

        const cli = await tx.cliente.create({ data });

        logs.push({
          accion: 'IMPORTACION_CSV',
          tablaAfectada: 'CLIENTE',
          registroId: cli.id,
          valorNuevo: cli as any,
          usuarioId: user.id,
          empresaId: user.empresaId
        });

        clients_processed.push(cli);
      }

      return { processed: clients_processed, auditLogsToCreate: logs };
    });

    // Logs fuera de la transacción
    auditLogsToCreate.forEach((logData) => {
      prisma.auditLog.create({ data: logData }).catch(err => console.error(err));
    });

    res.status(201).json({
      success: true,
      message: `${processed.length} clientes importados correctamente (se omitieron los duplicados).`,
      clientes: processed
    });
  } catch (error: any) {
    handleError(res, error);
  }
}
