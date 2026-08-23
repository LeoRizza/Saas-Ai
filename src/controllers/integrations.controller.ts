import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Rate limiter para endpoints de integración externa
 * Funciona como fail-safe contra loops infinitos de n8n/Make o posibles ataques
 * Máximo: 300 peticiones por minuto por IP
 * Se salta el rate limit si la request incluye el header x-bot-api-key (bot interno)
 */
export const externalApiLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minuto
    max: 300, // Máximo 300 peticiones por minuto por IP
    message: 'Bloqueo temporal por anomalía de tráfico detectada. Por favor intenta de nuevo en unos momentos',
    standardHeaders: true, // Retorna el rate limit info en el header `RateLimit-*`
    legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
    skip: (req: Request) => {
        // Si la request incluye el header x-bot-api-key, saltar el rate limit
        return !!req.headers['x-bot-api-key'];
    },
});
/**
 * Crea un nuevo pedido (Prospecto) desde una integración externa
 * (Chatbot, formulario Web, n8n, etc.)
 * Requiere middleware verifySystemBot para validar x-api-key e inyectar tenantId
 *
 * @param req - Request con tenantId inyectado por middleware (verificado con x-api-key y x-tenant-id)
 * @param res - Response para retornar el resultado
 * @headers x-api-key - API Key del bot (requerida)
 * @headers x-tenant-id - ID del tenant (requerida)
 */
export const createExternalPedido = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // El tenantId ya viene validado e inyectado por el middleware verifySystemBot
        const tenantId = (req as any).tenantId || (req.headers['x-tenant-id'] as string);

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