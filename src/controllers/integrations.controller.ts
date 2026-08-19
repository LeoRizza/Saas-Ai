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
 * Requiere middleware verifySystemBot para validar x-bot-api-key e inyectar tenantId
 *
 * @param req - Request con tenantId inyectado por middleware (verificado con x-bot-api-key y x-tenant-id)
 * @param res - Response con datos de artículos
 * @headers x-bot-api-key - API Key del bot (requerida)
 * @headers x-tenant-id - ID del tenant (requerida)
 * @queryParam q - Parámetro de búsqueda (requerido)
 */
export const consultarStock = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
                // El tenantId ya viene validado e inyectado por tu middleware verifySystemBot
        const tenantId = (req as any).tenantId || (req.headers['x-tenant-id'] as string);
        const q = req.query.q as string;

        if (!q || q.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El parámetro de búsqueda "q" es obligatorio',
            });
            return;
        }

        // Buscar artículos optimizado para el Bot
        const articulos = await prisma.articulo.findMany({
            where: {
                empresaId: tenantId,
                nombre: {
                    contains: q.trim(),
                    // Eliminamos mode: 'insensitive' porque MySQL ya lo hace por defecto
                },
            },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
                precio: true,
                stockUnidades: true,
                imagenes: true,
                categoria: true,
            },
            take: 3,
        });

        // Convertir las rutas relativas en URLs absolutas para WhatsApp/n8n
        const articulosMapeados = articulos.map((art: any) => {
            const imagenesAbsolutas = (art.imagenes || []).map((img: string) => {
                // Si por alguna razón ya tiene el http, lo dejamos como está
                if (img.startsWith('http')) return img;
                // Si no, le pegamos tu dominio oficial
                return `https://laris.com.ar${img}`;
            });

            return {
                ...art,
                imagenes: imagenesAbsolutas
            };
        });

        // Respuesta exitosa
        res.status(200).json({
            status: 'success',
            data: articulosMapeados,
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