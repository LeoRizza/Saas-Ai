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
        // NOTA: NO incluimos subtotal, impuestos, total del body - se calculan en el backend
        const {
            nombre,
            email,
            telefono,
            mensaje,
            tag,
            recordatorio,
            producto_confirmado,
            items = [],
            moneda = 'ARS',
            usuarioId,
        } = req.body;

                // Validación: nombre es obligatorio
        if (!nombre || nombre.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El campo "nombre" es obligatorio',
            });
            return;
        }

        // Validación: usuarioId es obligatorio
        if (!usuarioId || usuarioId.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'usuarioId es obligatorio para el registro de auditoría',
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

        // Preparar notas con formato de auditoría
        const notas = mensajeCompleto
            ? [
                {
                    fecha: new Date().toISOString(),
                    texto: mensajeCompleto,
                    usuario: 'Bot/Integración',
                },
            ]
            : [];

                // Paso 1: Extraer IDs únicos de los items para consultar la BD
        const articuloIds = Array.from(
            new Set((items || []).map((item: any) => item.articuloId || item.id))
        ).filter(Boolean) as string[];

                // Paso 2: Consultar artículos de la BD para obtener precios reales
        const articulosDeBD = await prisma.articulo.findMany({
            where: {
                id: { in: articuloIds },
                empresaId: tenantId,
            },
            select: {
                id: true,
                nombre: true,
                precio: true,
            },
        });

                // Crear un mapa de artículos para búsqueda rápida
        const articulosMap = new Map(
            articulosDeBD.map((art) => [art.id, { precio: art.precio, nombre: art.nombre }])
        );

                // Paso 3: Mapear items cruzando con datos de la BD
        const itemsMapeados = (items || [])
            .map((item: any) => {
                const articuloId = item.articuloId || item.id;
                const articuloInfo = articulosMap.get(articuloId) || { precio: 0, nombre: 'Artículo sin nombre' };
                const precioUnitario = articuloInfo.precio; // Precio real de la BD
                const nombreArticulo = articuloInfo.nombre || 'Artículo sin nombre'; // Nombre del artículo
                const cantidad = Number(item.cantidad) || 1;
                const descuento = Number(item.descuento) || 0;
                const subtotal = cantidad * precioUnitario; // Calculado en el backend

                return {
                    articuloId,
                    nombreArticulo,
                    cantidad,
                    precioUnitario,
                    descuento,
                    subtotal,
                };
            })
            .filter((item: any) => item.articuloId); // Filtrar items sin articuloId válido

        // Paso 4: Calcular totales de forma segura en el backend
        const subtotalParsed = itemsMapeados.reduce(
            (sum: number, item: any) => sum + item.subtotal,
            0
        );
        const impuestosParsed = 0; // Por ahora sin impuestos, se puede ajustar según lógica futura
        const totalParsed = subtotalParsed + impuestosParsed;

        // Ejecutar transacción: crear pedido y registrar auditoría
        const [nuevoPedido] = await prisma.$transaction([
            // Operación A: Crear el pedido con items
            prisma.pedido.create({
                data: {
                    nombre: nombre.trim(),
                    email: email?.trim() || null,
                    telefono: telefono?.trim() || null,
                    tag: tag?.trim() || null,
                    recordatorio: recordatorio ? new Date(recordatorio).toISOString() : null,
                    empresaId: tenantId,
                    status: 'PENDIENTE',
                    notas,
                    subtotal: subtotalParsed,
                    impuestos: impuestosParsed,
                    total: totalParsed,
                    moneda,
                    items: {
                        create: itemsMapeados,
                    },
                },
                include: {
                    items: true,
                },
            }),
                        // Operación B: Registrar en auditoría
            prisma.auditLog.create({
                data: {
                    accion: 'CREACION_PEDIDO_BOT',
                    tablaAfectada: 'PEDIDO',
                    registroId: nombre,
                    valorNuevo: { origen: req.headers['user-agent'] || 'desconocido' } as any,
                    usuarioId: usuarioId,
                    empresaId: tenantId,
                },
            }),
        ]);

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