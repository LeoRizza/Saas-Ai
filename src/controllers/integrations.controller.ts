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
 * (Chatbot, formulario Web, n8n, etc.)
 *
 * @param req - Request con x-api-key, x-tenant-id en headers y datos del pedido en req.body
 * @param res - Response para retornar el resultado
 */
export const createExternalPedido = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // Extraer y validar headers de seguridad
        const apiKey = req.headers['x-api-key'] as string;
        const tenantId = req.headers['x-tenant-id'] as string;

        // Validar x-api-key
        if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
            res.status(401).json({
                success: false,
                message: 'API Key inválida o no proporcionada',
            });
            return;
        }

        // Validar x-tenant-id
        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'x-tenant-id es obligatorio',
            });
            return;
        }

        // Extraer datos del pedido del cuerpo de la solicitud
        const { nombre, email, telefono, mensaje, tag, recordatorio, producto_confirmado } = req.body;

        // Validación: nombre es obligatorio
        if (!nombre || nombre.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El campo "nombre" es obligatorio',
            });
            return;
        }

        // Concatenar producto_confirmado al mensaje si existe
        let mensajeCompleto = mensaje?.trim() || '';
        if (producto_confirmado) {
            mensajeCompleto = mensajeCompleto
                ? `${mensajeCompleto} | Producto: ${producto_confirmado}`
                : `Producto: ${producto_confirmado}`;
        }

        // Crear el nuevo pedido en la base de datos
        const nuevoPedido = await prisma.pedido.create({
            data: {
                nombre: nombre.trim(),
                email: email?.trim() || null,
                telefono: telefono?.trim() || null,
                mensaje: mensajeCompleto || null,
                tag: tag?.trim() || null,
                recordatorio: recordatorio ? new Date(recordatorio).toISOString() : null,
                empresaId: tenantId,
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

/**
 * Consulta stock de artículos disponibles para una empresa/tenant
 *
 * @param req - Request con x-api-key, x-tenant-id en headers y query param 'q'
 * @param res - Response con datos de artículos
 */
export const consultarStock = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // Extraer y validar headers de seguridad
        const apiKey = req.headers['x-api-key'] as string;
        const tenantId = req.headers['x-tenant-id'] as string;

        // Validar x-api-key
        if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
            res.status(401).json({
                success: false,
                message: 'API Key inválida o no proporcionada',
            });
            return;
        }

        // Validar x-tenant-id
        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'x-tenant-id es obligatorio',
            });
            return;
        }

        // Extraer query param 'q'
        const q = req.query.q as string;

        // Validar que 'q' esté presente
        if (!q || q.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El parámetro de búsqueda "q" es obligatorio',
            });
            return;
        }

        // Buscar artículos que coincidan con el tenant y contengan 'q' en el nombre
        const articulos = await prisma.articulo.findMany({
            where: {
                empresaId: tenantId,
                nombre: {
                    contains: q.trim(),
                    mode: 'insensitive', // búsqueda case-insensitive
                },
            },
            take: 3, // Limitar a 3 resultados
        });

        // Respuesta exitosa
        res.status(200).json({
            status: 'success',
            data: articulos,
        });
    } catch (error: any) {
        console.error('Error al consultar stock:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error interno al procesar la solicitud.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};