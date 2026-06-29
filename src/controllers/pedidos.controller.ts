import { Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import {
    safeDecode,
    renderCustomTemplate,
    generateQuoteTemplate,
    generateEmailTemplate,
    sendQuoteEmail as mailerSendQuoteEmail,
    sendTicket as mailerSendTicket,
    verifyTransporter
} from './mailer.controller';
// @ts-ignore
import * as pdfMakeModule from 'pdfmake/build/pdfmake.js';
// @ts-ignore
import * as pdfFontsModule from 'pdfmake/build/vfs_fonts.js';
// Casting a "any" para silenciar por completo a TypeScript
const pdfMake: any = pdfMakeModule && (pdfMakeModule as any).default ? (pdfMakeModule as any).default : pdfMakeModule;
const pdfFonts: any = pdfFontsModule && (pdfFontsModule as any).default ? (pdfFontsModule as any).default : pdfFontsModule;
// Inicializar las fuentes universales incrustadas (Roboto)
if (pdfMake && pdfFonts && pdfFonts.pdfMake) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
} else if (pdfMake && pdfFonts && pdfFonts.vfs) {
    pdfMake.vfs = pdfFonts.vfs;
}
const prisma = new PrismaClient();
interface CartItem {
    articulo: { nombre: string; precio: number; };
    cantidad: number;
    descuento: number;
}
export const getPedidos = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const empresaId = user?.empresaId;
        if (!empresaId) return res.status(401).json({ error: 'No autorizado' });
        const pedidos = await prisma.pedido.findMany({
            where: { empresaId },
            include: {
                cliente: { select: { id: true, nombre: true, email: true, telefono: true, razonSocial: true } },
                items: true,
            },
            orderBy: { fechaCreacion: 'desc' },
        });
        return res.status(200).json(pedidos);
    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        return res.status(500).json({ error: 'Error al obtener pedidos' });
    }
};
export const createPedido = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const empresaId = user?.empresaId;
        if (!empresaId) return res.status(401).json({ error: 'No autorizado' });
        const { nombre, razonSocial, email, telefono, mensaje, tag, cuit, recordatorio, items, subtotal, impuestos, total, moneda } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El campo nombre es requerido' });
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Formato de email inválido' });
        if (telefono && !/^\d+$/.test(telefono.trim())) return res.status(400).json({ error: 'Formato de teléfono inválido' });
        let clienteId: string | null = null;
        if (email) {
            const clienteExistente = await prisma.cliente.findFirst({
                where: { email, empresaId },
                select: { id: true },
            });
            if (clienteExistente) clienteId = clienteExistente.id;
        }
        const pedido = await prisma.$transaction(async (tx) => {
            const newPedido = await tx.pedido.create({
                data: {
                    nombre,
                    razonSocial: razonSocial || null,
                    email: email || null,
                    telefono: telefono || null,
                    tag: tag || null,
                    cuit: cuit || null,
                    recordatorio: recordatorio ? new Date(recordatorio).toISOString() : null,
                    subtotal: subtotal || 0,
                    impuestos: impuestos || 0,
                    total: total || 0,
                    moneda: moneda || 'ARS',
                    notas: mensaje ? [{ fecha: new Date().toISOString(), texto: mensaje, usuario: user.nombre || 'Sistema' }] : [],
                    empresaId,
                    clienteId,
                    items: items && items.length > 0 ? {
                        create: items.map((item: any) => ({
                            articuloId: item.articulo?.id || item.articuloId,
                            nombreArticulo: item.articulo?.nombre || item.nombreArticulo || 'Artículo Genérico',
                            cantidad: Number(item.cantidad) || 1,
                            precioUnitario: Number(item.articulo?.precio) || 0,
                            descuento: Number(item.descuento) || 0,
                            subtotal: Number(item.subtotal) || 0
                        }))
                    } : undefined
                },
                include: {
                    cliente: { select: { id: true, nombre: true, email: true, telefono: true, razonSocial: true } },
                    items: true,
                },
            });
            await tx.auditLog.create({
                data: {
                    accion: 'CREACION_PEDIDO',
                    tablaAfectada: 'PEDIDO',
                    registroId: newPedido.id,
                    valorNuevo: newPedido as any,
                    motivo: '✨ Nueva cotización/pedido para: ' + newPedido.nombre,
                    usuarioId: user.id,
                    empresaId: empresaId,
                },
            });
            return newPedido;
        });
        return res.status(201).json(pedido);
    } catch (error) {
        console.error('Error al crear pedido:', error);
        return res.status(500).json({ error: 'Error al crear pedido' });
    }
};
export const updatePedidoStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = (req as any).user;
        const result = await prisma.$transaction(async (tx) => {
            const oldPedido = await tx.pedido.findFirst({ where: { id, empresaId: user.empresaId } });
            if (!oldPedido) throw new Error('Pedido no encontrado o sin permisos');
            const pedidoActualizado = await tx.pedido.update({
                where: { id },
                data: { status },
            });
            await tx.auditLog.create({
                data: {
                    accion: 'ACTUALIZACION_PEDIDO',
                    tablaAfectada: 'PEDIDO',
                    registroId: id,
                    motivo: `Cambio de estado del pedido a: ${status}`,
                    valorAnterior: oldPedido as any,
                    valorNuevo: pedidoActualizado as any,
                    usuarioId: user.id,
                    empresaId: user.empresaId,
                },
            });
            return pedidoActualizado;
        });
        return res.json({ success: true, message: 'Estado actualizado' });
    } catch (error) {
        if ((error as Error).message === 'Pedido no encontrado o sin permisos') return res.status(404).json({ error: 'Pedido no encontrado o sin permisos' });
        return res.status(500).json({ error: 'Error al actualizar estado' });
    }
};
export const updatePedido = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { nombre, razonSocial, email, telefono, tag, cuit, recordatorio, clienteId } = req.body;
        const user = (req as any).user;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Formato de email inválido' });
        if (telefono && !/^\d+$/.test(telefono.trim())) return res.status(400).json({ error: 'Formato de teléfono inválido' });
        const updateData: any = {};
        if (nombre !== undefined) updateData.nombre = nombre;
        if (razonSocial !== undefined) updateData.razonSocial = razonSocial;
        if (email !== undefined) updateData.email = email;
        if (telefono !== undefined) updateData.telefono = telefono;
        if (tag !== undefined) updateData.tag = tag;
        if (cuit !== undefined) updateData.cuit = cuit;
        if (clienteId !== undefined) updateData.clienteId = clienteId;
        if (recordatorio !== undefined) updateData.recordatorio = recordatorio ? new Date(recordatorio).toISOString() : null;
        const result = await prisma.$transaction(async (tx) => {
            const oldPedido = await tx.pedido.findFirst({ where: { id, empresaId: user.empresaId } });
            if (!oldPedido) throw new Error('Pedido no encontrado');
            if (req.body.nuevaNota && req.body.nuevaNota.trim() !== '') {
                const notasExistentes = Array.isArray(oldPedido.notas) ? oldPedido.notas : [];
                updateData.notas = [...notasExistentes, { fecha: new Date().toISOString(), texto: req.body.nuevaNota.trim(), usuario: user.nombre || 'Usuario' }];
            }
            const pedidoActualizado = await tx.pedido.update({ where: { id }, data: updateData });
            await tx.auditLog.create({
                data: {
                    accion: 'ACTUALIZACION_PEDIDO',
                    tablaAfectada: 'PEDIDO',
                    registroId: id,
                    motivo: 'Edición manual de datos del prospecto/pedido',
                    valorAnterior: oldPedido as any,
                    valorNuevo: pedidoActualizado as any,
                    usuarioId: user.id,
                    empresaId: user.empresaId,
                },
            });
            return pedidoActualizado;
        });
        return res.status(200).json({ success: true });
    } catch (error) {
        if ((error as Error).message === 'Pedido no encontrado') return res.status(404).json({ error: 'Pedido no encontrado' });
        return res.status(500).json({ error: 'Error interno al actualizar pedido' });
    }
};

export const downloadPedidoPdf = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const user = (req as any).user;

        const pedido = await prisma.pedido.findFirst({
            where: { id, empresaId: user.empresaId },
            include: { empresa: true, cliente: true, items: { include: { articulo: true } } }
        });

        if (!pedido) {
            res.status(404).json({ error: 'Pedido no encontrado' });
            return;
        }

        // --- 1. CONFIGURACIÓN DINÁMICA DE EMPRESA ---
        let configEmpresa: any = {};
        if (pedido.empresa.config) {
            configEmpresa = typeof pedido.empresa.config === 'string'
                ? JSON.parse(pedido.empresa.config)
                : pedido.empresa.config;
        }

        const cuitEmpresa = configEmpresa.cuit || '';
        const direccionEmpresa = configEmpresa.direccion || '';
        const emailEmpresa = pedido.empresa.emailContacto || 'email@empresa.com';
        const telEmpresa = pedido.empresa.telefonoContacto || '';
        const webEmpresa = configEmpresa.web || '';
        const diasVigencia = configEmpresa.diasVigencia || '';
        const colorPdf = configEmpresa.colorPdf || '#4A6984';
        // Buscar logoUrl con fallbacks
        const logoUrl = configEmpresa.logoUrl || (pedido.empresa as any).logoUrl || (pedido.empresa as any).logo || null;
        const moneda = pedido.moneda || 'ARS';

        // Descarga de logo asíncrona segura con validación robusta
        let logoBase64 = null;
        if (logoUrl) {
            try {
                const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const buffer = Buffer.from(response.data);

                // Envolvemos en String() para que TypeScript no moleste con los tipos de Axios
                const contentType = String(response.headers['content-type'] || 'image/jpeg');
                const mimeType = contentType.split(';')[0].trim();

                logoBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
            } catch (err) {
                // Registrar error en consola para debugging, pero no romper el PDF
                console.error('Error descargando logo:', (err as any).message);
                logoBase64 = null;
            }
        }

        // --- 2. ARRAY DINÁMICO DE INFO EMPRESA (El condicional que pediste) ---
        const infoEmpresaBody: any[] = [];
        infoEmpresaBody.push([{ text: 'RAZÓN SOCIAL:', bold: true, fontSize: 9, border: [false, false, false, false] }, { text: pedido.empresa.nombre, fontSize: 9, border: [false, false, false, false] }]);

        if (direccionEmpresa.trim() !== '') {
            infoEmpresaBody.push([{ text: 'DOMICILIO:', bold: true, fontSize: 9, border: [false, false, false, false] }, { text: direccionEmpresa, fontSize: 9, border: [false, false, false, false] }]);
        }
        if (cuitEmpresa.trim() !== '') {
            infoEmpresaBody.push([{ text: 'CUIT:', bold: true, fontSize: 9, border: [false, false, false, false] }, { text: cuitEmpresa, fontSize: 9, border: [false, false, false, false] }]);
        }
        if (telEmpresa.trim() !== '') {
            infoEmpresaBody.push([{ text: 'TELÉFONO:', bold: true, fontSize: 9, border: [false, false, false, false] }, { text: telEmpresa, fontSize: 9, border: [false, false, false, false] }]);
        }
        if (webEmpresa.trim() !== '') {
            infoEmpresaBody.push([{ text: 'WEB:', bold: true, fontSize: 9, border: [false, false, false, false] }, { text: webEmpresa, fontSize: 9, border: [false, false, false, false] }]);
        }

        infoEmpresaBody.push([{ text: 'EMAIL:', bold: true, fontSize: 9, border: [false, false, false, false] }, { text: emailEmpresa, fontSize: 9, border: [false, false, false, false] }]);

        // --- 3. CONSTRUCCIÓN DE LA TABLA DE PRODUCTOS ---
        const tableBody = [
            [
                { text: 'DESCRIPCIÓN DEL ARTÍCULO / CONCEPTO', fillColor: colorPdf, color: '#ffffff', bold: true, fontSize: 10, border: [false, false, false, false], margin: [5, 5] },
                { text: 'CANTIDAD', fillColor: colorPdf, color: '#ffffff', bold: true, fontSize: 10, alignment: 'center', border: [false, false, false, false], margin: [5, 5] },
                { text: 'PRECIO UNITARIO', fillColor: colorPdf, color: '#ffffff', bold: true, fontSize: 10, alignment: 'right', border: [false, false, false, false], margin: [5, 5] },
                { text: 'IMPORTE NETO', fillColor: colorPdf, color: '#ffffff', bold: true, fontSize: 10, alignment: 'right', border: [false, false, false, false], margin: [5, 5] }
            ]
        ];

        pedido.items.forEach((item: any, index: number) => {
            const precio = item.precioUnitario || 0;
            const cantidad = item.cantidad || 1;
            const descuento = item.descuento || 0;
            const subtotalItem = (precio * cantidad) * (1 - descuento / 100);

            const fillColor = index % 2 === 0 ? '#F8FAFC' : '#ffffff';

            tableBody.push([
                { text: item.nombreArticulo, fontSize: 10, fillColor, margin: [5, 5], border: [true, true, true, true] },
                { text: cantidad.toString(), fontSize: 10, alignment: 'center', fillColor, margin: [5, 5], border: [true, true, true, true] },
                { text: `${moneda} ${precio.toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor, margin: [5, 5], border: [true, true, true, true] },
                { text: `${moneda} ${subtotalItem.toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor, margin: [5, 5], border: [true, true, true, true] }
            ] as any);
        });

        // --- 4. DEFINICIÓN DEL DOCUMENTO ---
        const docDefinition: any = {
            pageSize: 'A4',
            pageMargins: [40, 40, 40, 40],
            defaultStyle: { color: '#334155' },
            content: [
                {
                    columns: [
                        {
                            width: '60%',
                            stack: [
                                logoBase64
                                    ? { image: logoBase64, width: 140, margin: [0, 0, 0, 15] }
                                    : { text: '[ LOGOTIPO EMPRESA ]', fontSize: 12, bold: true, color: '#94a3b8', margin: [0, 0, 0, 15] },
                                {
                                    table: {
                                        widths: [80, '*'],
                                        body: infoEmpresaBody // Usamos el array dinámico aquí
                                    },
                                    layout: 'noBorders'
                                }
                            ]
                        },
                        {
                            width: '40%',
                            stack: [
                                { text: 'COTIZACIÓN', fontSize: 26, bold: true, alignment: 'right', color: colorPdf, margin: [0, 0, 0, 10] },
                                {
                                    table: {
                                        widths: ['*', 'auto'],
                                        body: (() => {
                                            const detallesCotizacionBody: any[] = [];
                                            detallesCotizacionBody.push([{ text: 'No. Cotización:', alignment: 'right', fontSize: 10, bold: true, border: [false, false, false, false] }, { text: pedido.id.split('-')[0].toUpperCase(), fontSize: 10, border: [false, false, false, false] }]);
                                            detallesCotizacionBody.push([{ text: 'Fecha de Emisión:', alignment: 'right', fontSize: 10, bold: true, border: [false, false, false, false] }, { text: new Date().toLocaleDateString('es-AR'), fontSize: 10, border: [false, false, false, false] }]);
                                            if (diasVigencia.trim() !== '') {
                                                detallesCotizacionBody.push([{ text: 'Válida por:', alignment: 'right', fontSize: 10, bold: true, border: [false, false, false, false] }, { text: diasVigencia, fontSize: 10, border: [false, false, false, false] }]);
                                            }
                                            return detallesCotizacionBody;
                                        })()
                                    },
                                    layout: 'noBorders'
                                }
                            ]
                        }
                    ],
                    margin: [0, 0, 0, 30]
                },

                {
                    table: {
                        widths: ['*'],
                        body: [
                            [{ text: 'DATOS DEL CLIENTE', bold: true, fontSize: 11, color: colorPdf, margin: [5, 5, 0, 5], border: [false, false, false, true] }],
                            [
                                {
                                    table: {
                                        widths: [120, '*'],
                                        body: [
                                            [{ text: 'Razón Social / Cliente:', fontSize: 10, border: [false, false, false, false], margin: [5, 2] }, { text: pedido.razonSocial || pedido.nombre, fontSize: 10, border: [false, false, false, false], margin: [0, 2] }],
                                            [{ text: 'Atención (Nombre):', fontSize: 10, border: [false, false, false, false], margin: [5, 2] }, { text: pedido.nombre, fontSize: 10, border: [false, false, false, false], margin: [0, 2] }],
                                            [{ text: 'CUIT / DNI:', fontSize: 10, border: [false, false, false, false], margin: [5, 2] }, { text: pedido.cuit || '-', fontSize: 10, border: [false, false, false, false], margin: [0, 2] }],
                                            [{ text: 'Email:', fontSize: 10, border: [false, false, false, false], margin: [5, 2] }, { text: pedido.email || '-', fontSize: 10, border: [false, false, false, false], margin: [0, 2] }]
                                        ]
                                    },
                                    layout: 'noBorders',
                                    margin: [0, 5, 0, 5]
                                }
                            ]
                        ]
                    },
                    layout: {
                        hLineWidth: function (i: any) { return 1; },
                        vLineWidth: function (i: any) { return 1; },
                        hLineColor: function (i: any) { return '#cbd5e1'; },
                        vLineColor: function (i: any) { return '#cbd5e1'; },
                        fillColor: function (i: number) { return i === 0 ? '#f8fafc' : null; }
                    },
                    margin: [0, 0, 0, 20]
                },

                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 60, 90, 90],
                        body: tableBody
                    },
                    layout: {
                        hLineWidth: function (i: any) { return 1; },
                        vLineWidth: function (i: any) { return 1; },
                        hLineColor: function (i: any) { return '#cbd5e1'; },
                        vLineColor: function (i: any) { return '#cbd5e1'; }
                    },
                    margin: [0, 0, 0, 20]
                },

                {
                    columns: [
                        { width: '*', text: '' },
                        {
                            width: 250,
                            table: {
                                widths: ['*', 100],
                                body: [
                                    [{ text: 'RESUMEN DE IMPORTES', colSpan: 2, alignment: 'center', bold: true, fontSize: 10, fillColor: '#e2e8f0', margin: [0, 5], border: [true, true, true, true] }, {}],
                                    [{ text: 'SUBTOTAL OPERACIÓN', fontSize: 9, alignment: 'right', margin: [0, 5], border: [true, true, true, true] }, { text: `${moneda} ${(pedido.subtotal || 0).toFixed(2)}`, fontSize: 10, alignment: 'right', margin: [0, 5], border: [true, true, true, true] }],
                                    [{ text: 'IMPUESTOS / OTROS', fontSize: 9, alignment: 'right', margin: [0, 5], border: [true, true, true, true] }, { text: `${moneda} ${(pedido.impuestos || 0).toFixed(2)}`, fontSize: 10, alignment: 'right', margin: [0, 5], border: [true, true, true, true] }],
                                    [{ text: 'IMPORTE TOTAL', bold: true, fontSize: 11, alignment: 'right', fillColor: '#e2e8f0', margin: [0, 8], border: [true, true, true, true] }, { text: `${moneda} ${(pedido.total || 0).toFixed(2)}`, bold: true, fontSize: 12, alignment: 'right', fillColor: '#e2e8f0', margin: [0, 8], border: [true, true, true, true] }]
                                ]
                            },
                            layout: {
                                hLineWidth: function () { return 1; },
                                vLineWidth: function () { return 1; },
                                hLineColor: function () { return '#cbd5e1'; },
                                vLineColor: function () { return '#cbd5e1'; }
                            }
                        }
                    ]
                },

                {
                    text: 'Los precios expresados están sujetos a modificaciones sin previo aviso.',
                    fontSize: 8,
                    color: '#64748b',
                    alignment: 'center',
                    margin: [0, 40, 0, 0]
                }
            ]
        };

        const pdfDocGenerator: any = pdfMake.createPdf(docDefinition);
        const base64String: string = await new Promise((resolve, reject) => {
            try {
                const result = pdfDocGenerator.getBase64((data: string) => resolve(data));
                if (result && typeof result.then === 'function') {
                    result.then(resolve).catch(reject);
                }
            } catch (err) {
                reject(err);
            }
        });

        const binaryBuffer = Buffer.from(base64String, 'base64');
        const cleanName = pedido.nombre.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Cotizacion_${cleanName}.pdf"`);
        res.setHeader('Content-Length', binaryBuffer.length.toString());
        res.end(binaryBuffer);

    } catch (error) {
        console.error('Error al generar PDF con pdfmake:', error);
        res.status(500).json({ error: 'Error interno al generar el PDF' });
    }
};

export { sendQuoteEmail, sendTicket, verifyTransporter } from './mailer.controller';
export default {
    getPedidos,
    createPedido,
    updatePedidoStatus,
    updatePedido,
    downloadPedidoPdf
};
