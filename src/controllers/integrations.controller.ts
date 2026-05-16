import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Rate limiter para endpoints de integración externa
 * Máximo: 10 peticiones cada 15 minutos por IP
 */
export const externalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // Máximo 10 peticiones por IP
    message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde',
    standardHeaders: true, // Retorna el rate limit info en el header `RateLimit-*`
    legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
});
/**
 * Crea un nuevo pedido (Prospecto) desde una integración externa
 * (Chatbot, formulario Web, etc.)
 *
 * @param req - Request con empresaId en req.user y datos del pedido en req.body
 * @param res - Response para retornar el resultado
 */
export const createExternalPedido = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // Extraer empresaId del middleware
        const empresaId = (req as any).user.empresaId;

                // Extraer datos del pedido del cuerpo de la solicitud
        const { nombre, email, telefono, mensaje, tag, recordatorio } = req.body;

        // Validación: nombre es obligatorio
        if (!nombre || nombre.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El campo "nombre" es obligatorio',
            });
            return;
        }

                // Crear el nuevo pedido en la base de datos
        const nuevoPedido = await prisma.pedido.create({
            data: {
                nombre: nombre.trim(),
                email: email?.trim() || null,
                telefono: telefono?.trim() || null,
                mensaje: mensaje?.trim() || null,
                tag: tag?.trim() || null,
                recordatorio: recordatorio ? new Date(recordatorio).toISOString() : null,
                empresaId,
                status: 'PENDIENTE',
            },
        });

        // Respuesta exitosa
        res.status(201).json({
            success: true,
            message: 'Pedido (Prospecto) recibido exitosamente',
            pedido: nuevoPedido,
        });
    } catch (error: any) {
        console.error('Error al recibir pedido externo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno al procesar la solicitud.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};