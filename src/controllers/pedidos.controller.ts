import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /pedidos
 * Obtiene todos los pedidos de la empresa del usuario autenticado,
 * ordenados por fechaCreacion descendente e incluye datos básicos del cliente
 */
export const getPedidos = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const empresaId = user?.empresaId;

        if (!empresaId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const pedidos = await prisma.pedido.findMany({
            where: {
                empresaId,
            },
            include: {
                cliente: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        telefono: true,
                        razonSocial: true,
                    },
                },
            },
            orderBy: {
                fechaCreacion: 'desc',
            },
        });

        return res.status(200).json(pedidos);
    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        return res.status(500).json({ error: 'Error al obtener pedidos' });
    }
};

/**
 * POST /pedidos
 * Crea un nuevo pedido. Si viene email, busca si existe un Cliente
 * con ese email y empresaId, y lo vincula automáticamente.
 */
export const createPedido = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const empresaId = user?.empresaId;

        if (!empresaId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

                const { nombre, razonSocial, email, telefono, mensaje, tag, cuit, recordatorio } =
                    req.body;

                // Validaciones básicas
        if (!nombre) {
            return res.status(400).json({
                error: 'El campo nombre es requerido',
            });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: 'Formato de email inválido' });
        }

        if (telefono && !/^\d+$/.test(telefono.trim())) {
            return res.status(400).json({ error: 'Formato de teléfono inválido (exclusivamente números)' });
        }

        let clienteId: string | null = null;

        // Si viene email, buscar cliente existente
        if (email) {
            const clienteExistente = await prisma.cliente.findFirst({
                where: {
                    email,
                    empresaId,
                },
                select: {
                    id: true,
                },
            });

            if (clienteExistente) {
                clienteId = clienteExistente.id;
            }
        }

                                // Crear el pedido
                const pedido = await prisma.pedido.create({
                    data: {
                        nombre,
                        razonSocial: razonSocial || null,
                        email: email || null,
                        telefono: telefono || null,
                        mensaje: mensaje || null,
                        tag: tag || null,
                        cuit: cuit || null,
                        recordatorio: recordatorio ? new Date(recordatorio).toISOString() : null,
                        empresaId,
                        clienteId,
                    },
            include: {
                cliente: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        telefono: true,
                        razonSocial: true,
                    },
                },
            },
        });

                // Registrar auditoría (Fire & Forget)
        prisma.auditLog.create({
            data: {
                accion: 'CREACION_PEDIDO',
                tablaAfectada: 'PEDIDO',
                registroId: pedido.id,
                valorNuevo: pedido as any,
                usuarioId: user.id,
                empresaId: empresaId,
            },
        }).catch(err => console.error('Error al registrar auditoría de creación de pedido:', err));

        return res.status(201).json(pedido);
    } catch (error) {
        console.error('Error al crear pedido:', error);
                return res.status(500).json({ error: 'Error al crear pedido' });
    }
};

/**
 * PATCH /pedidos/:id/status
 * Actualiza el estado de un pedido. Solo el propietario de la empresa puede actualizar
 */
export const updatePedidoStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = (req as any).user;

                const pedido = await prisma.pedido.updateMany({
            where: { id, empresaId: user.empresaId },
            data: { status },
        });

        if (pedido.count === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado o sin permisos' });
        }

                // Registrar auditoría (Fire & Forget)
        prisma.auditLog.create({
            data: {
                accion: 'ACTUALIZACION_PEDIDO',
                tablaAfectada: 'PEDIDO',
                registroId: id,
                motivo: `Cambio de estado del pedido a: ${status}`,
                usuarioId: user.id,
                empresaId: user.empresaId,
            },
        }).catch(err => console.error('Error al registrar auditoría de actualización de estado:', err));

                return res.json({ success: true, message: 'Estado actualizado' });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        return res.status(500).json({ error: 'Error al actualizar estado' });
    }
};

/**
 * PATCH /pedidos/:id
 * Actualiza un pedido completo (campos editables, recordatorio, vinculación)
 */
export const updatePedido = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { nombre, razonSocial, email, telefono, mensaje, tag, cuit, recordatorio, clienteId } = req.body;
        const user = (req as any).user;

                // Validaciones de formato antes de actualizar
        if (email !== undefined && email !== null && email !== '') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                return res.status(400).json({ error: 'Formato de email inválido' });
            }
        }

        if (telefono !== undefined && telefono !== null && telefono !== '') {
            if (!/^\d+$/.test(telefono.trim())) {
                return res.status(400).json({ error: 'Formato de teléfono inválido (exclusivamente números)' });
            }
        }

        const updateData: any = {};
        if (nombre !== undefined) updateData.nombre = nombre;
        if (razonSocial !== undefined) updateData.razonSocial = razonSocial;
        if (email !== undefined) updateData.email = email;
        if (telefono !== undefined) updateData.telefono = telefono;
        if (mensaje !== undefined) updateData.mensaje = mensaje;
        if (tag !== undefined) updateData.tag = tag;
        if (cuit !== undefined) updateData.cuit = cuit;
        if (clienteId !== undefined) updateData.clienteId = clienteId;
        if (recordatorio !== undefined) {
            updateData.recordatorio = recordatorio ? new Date(recordatorio).toISOString() : null;
        }

        const pedido = await prisma.pedido.updateMany({
            where: { id, empresaId: user.empresaId },
            data: updateData,
        });

        if (pedido.count === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        // Opcional: Registrar auditoría de edición manual
        prisma.auditLog.create({
            data: {
                accion: 'ACTUALIZACION_PEDIDO',
                tablaAfectada: 'PEDIDO',
                registroId: id,
                motivo: 'Edición manual de datos del prospecto/pedido',
                usuarioId: user.id,
                empresaId: user.empresaId,
            }
        }).catch(err => console.error('Error log edit pedido:', err));

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error al actualizar pedido:', error);
        return res.status(500).json({ error: 'Error interno al actualizar pedido' });
    }
};