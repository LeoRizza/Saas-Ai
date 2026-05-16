import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

const prisma = new PrismaClient();

// GET /api/inventarios
export async function getInventarios(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const whereClause = user.rol === 'SUPER_ADMIN' ? {} : { empresaId: user.empresaId };
        const inventarios = await prisma.inventario.findMany({ where: whereClause });
        res.json(inventarios);
        } catch (error: any) {
        console.error('Error en controlador de inventarios (warehouse):', error);
        if (error.code === 'P2003') {
            res.status(400).json({ 
                message: 'No se puede completar la acción: el inventario está protegido porque tiene datos vinculados (artículos, ventas o producciones).' 
            });
            return;
        }
        res.status(error.message?.includes('No se puede eliminar') ? 400 : 500).json({ 
            message: error.message || 'Error interno del servidor' 
        });
    }
}

// POST /api/inventarios
export async function createInventario(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        if (user.rol !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });
        const { nombre, empresaId } = req.body;

        const inventario = await prisma.$transaction(async (tx) => {
            const inv = await tx.inventario.create({
                data: { nombre, empresaId: empresaId || user.empresaId }
            });
            await tx.auditLog.create({
                data: {
                    accion: 'AJUSTE_MANUAL',
                    tablaAfectada: 'INVENTARIO',
                    registroId: inv.id,
                    valorNuevo: inv as any,
                    usuarioId: user.id,
                    empresaId: inv.empresaId
                }
            });
            return inv;
        });
                res.json(inventario);
    } catch (error: any) {
        console.error('Error en controlador de inventarios (warehouse):', error);
        if (error.code === 'P2003') {
            res.status(400).json({ 
                message: 'No se puede completar la acción: el inventario está protegido porque tiene datos vinculados (artículos, ventas o producciones).' 
            });
            return;
        }
        res.status(error.message?.includes('No se puede eliminar') ? 400 : 500).json({ 
            message: error.message || 'Error interno del servidor' 
        });
    }
}

// PUT /api/inventarios/:id
export async function updateInventario(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        if (user.rol !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });
        const { id } = req.params;
        const { nombre } = req.body;

        const inventario = await prisma.$transaction(async (tx) => {
            const oldInv = await tx.inventario.findUnique({ where: { id } });
            const inv = await tx.inventario.update({
                where: { id },
                data: { nombre }
            });
            await tx.auditLog.create({
                data: {
                    accion: 'AJUSTE_MANUAL',
                    tablaAfectada: 'INVENTARIO',
                    registroId: inv.id,
                    valorAnterior: oldInv as any,
                    valorNuevo: inv as any,
                    usuarioId: user.id,
                    empresaId: inv.empresaId
                }
            });
            return inv;
        });
                res.json(inventario);
    } catch (error: any) {
        console.error('Error en controlador de inventarios (warehouse):', error);
        if (error.code === 'P2003') {
            res.status(400).json({ 
                message: 'No se puede completar la acción: el inventario está protegido porque tiene datos vinculados (artículos, ventas o producciones).' 
            });
            return;
        }
        res.status(error.message?.includes('No se puede eliminar') ? 400 : 500).json({ 
            message: error.message || 'Error interno del servidor' 
        });
    }
}

// DELETE /api/inventarios/:id
export async function deleteInventario(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        if (user.rol !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });
        const { id } = req.params;

        await prisma.$transaction(async (tx) => {
            const oldInv = await tx.inventario.findUnique({
                where: { id },
                include: {
                    _count: {
                        select: { articulos: true, ventasItems: true, produccionesOrigen: true, produccionesDestino: true }
                    }
                }
            });
            if (!oldInv) throw new Error('Inventario no encontrado');

            const hasRelations = oldInv._count.articulos > 0 ||
                oldInv._count.ventasItems > 0 ||
                oldInv._count.produccionesOrigen > 0 ||
                oldInv._count.produccionesDestino > 0;

            if (hasRelations) {
                throw new Error('No se puede eliminar el inventario porque tiene artículos, ventas o producciones asociadas.');
            }

            await tx.inventario.delete({ where: { id } });
            await tx.auditLog.create({
                data: {
                    accion: 'AJUSTE_MANUAL',
                    tablaAfectada: 'INVENTARIO',
                    registroId: id,
                    valorAnterior: oldInv as any,
                    usuarioId: user.id,
                    empresaId: oldInv.empresaId
                }
            });
        });
                res.json({ success: true });
    } catch (error: any) {
        console.error('Error en controlador de inventarios (warehouse):', error);
        if (error.code === 'P2003') {
            res.status(400).json({ 
                message: 'No se puede completar la acción: el inventario está protegido porque tiene datos vinculados (artículos, ventas o producciones).' 
            });
            return;
        }
        res.status(error.message?.includes('No se puede eliminar') ? 400 : 500).json({ 
            message: error.message || 'Error interno del servidor' 
        });
    }
}