import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

// @ts-ignore
import * as pdfMakeModule from 'pdfmake/build/pdfmake.js';
// @ts-ignore
import * as pdfFontsModule from 'pdfmake/build/vfs_fonts.js';

// Casting a "any" para silenciar por completo a TypeScript
const pdfMake: any = pdfMakeModule && (pdfMakeModule as any).default ? (pdfMakeModule as any).default : pdfMakeModule;
const pdfFonts: any = pdfFontsModule && (pdfFontsModule as any).default ? (pdfFontsModule as any).default : pdfFontsModule;

// Inicializar las fuentes universales (Roboto)
if (pdfMake && pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
} else if (pdfMake && pdfFonts && pdfFonts.vfs) {
  pdfMake.vfs = pdfFonts.vfs;
}

export function renderCustomTemplate(
  htmlCustom: string,
  datos: {
    nombreCliente: string;
    nombreEmpresa: string;
    subtotal: number;
    total: number;
    impuestos?: number;
    moneda?: string;
    items: CartItem[];
  },
  htmlFilaCustom?: string
): string {
  const moneda = datos.moneda || '$';

  const itemsHTML = datos.items.map((item) => {
    const precioUnitario = item.articulo.precio || 0;
    const cantidad = item.cantidad;
    const descuento = item.descuento || 0;
    const itemSubtotal = (precioUnitario * cantidad) * (1 - descuento / 100);

    if (htmlFilaCustom) {
      return htmlFilaCustom
        .replace(/{{articulo\.nombre}}/g, item.articulo.nombre)
        .replace(/{{articulo\.precio}}/g, `${moneda}${precioUnitario.toFixed(2)}`)
        .replace(/{{cantidad}}/g, cantidad.toString())
        .replace(/{{subtotal}}/g, `${moneda}${itemSubtotal.toFixed(2)}`)
        .replace(/{{moneda}}/g, moneda);
    }

    return `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 12px 10px; text-align: left; color: #334155; font-size: 12px;">${item.articulo.nombre}</td>
      <td style="padding: 12px 10px; text-align: center; color: #334155; font-size: 12px;">${cantidad}</td>
      <td style="padding: 12px 10px; text-align: right; color: #334155; font-size: 12px;">${moneda}${precioUnitario.toFixed(2)}</td>
      <td style="padding: 12px 10px; text-align: right; color: #0f172a; font-weight: bold; font-size: 12px;">${moneda}${itemSubtotal.toFixed(2)}</td>
    </tr>
    `;
  }).join('');

  let renderizado = htmlCustom
    .replace(/{{nombreCliente}}/g, datos.nombreCliente)
    .replace(/{{nombreEmpresa}}/g, datos.nombreEmpresa)
    .replace(/{{subtotal}}/g, `${moneda} ${datos.subtotal.toFixed(2)}`)
    .replace(/{{total}}/g, `${moneda} ${datos.total.toFixed(2)}`)
    .replace(/{{impuestos}}/g, datos.impuestos ? `${moneda} ${datos.impuestos.toFixed(2)}` : `${moneda} 0.00`)
    .replace(/{{moneda}}/g, moneda)
    .replace(/{{fecha}}/g, new Date().toLocaleDateString('es-AR'))
    .replace(/{{tablaItems}}/g, itemsHTML);

  return renderizado;
}

const prisma = new PrismaClient();

export const safeDecode = (str: string | null | undefined): string => {
  if (!str) return '';
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch (e1) {
    try {
      return decodeURIComponent(str);
    } catch (e2) {
      return str;
    }
  }
};

export interface CartItem {
  articulo: { nombre: string; precio: number; };
  cantidad: number;
  descuento: number;
}

export interface SendQuoteEmailBody {
  emailCliente: string;
  nombreCliente: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  nombreEmpresa: string;
  empresaId: string;
  impuestos?: number;
  moneda?: string;
  mensaje?: string;
}

export interface EmpresaData {
  id: string;
  nombre: string;
  smtpUser?: string | null;
  smtpPass?: string | null;
  emailContacto?: string | null;
  telefonoContacto?: string | null;
  config?: any | null;
}

export async function createTransporter(empresa: EmpresaData): Promise<Transporter> {
  if (empresa.smtpUser && empresa.smtpPass) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: empresa.smtpUser, pass: empresa.smtpPass }
    });
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

export function generateEmailTemplate(
  nombreCliente: string,
  items: CartItem[],
  subtotal: number,
  total: number,
  titulo: string,
  nombreEmpresa: string,
  emailEmpresa: string,
  telefonoEmpresa: string,
  impuestos?: number,
  mensaje?: string,
  moneda?: string,
  colorBrand: string = '#F06543'
): string {
  const currencySymbol = moneda || '$';
  const fechaActual = new Date().toLocaleDateString('es-AR');

  // Generar filas de tabla de artículos
  const itemsHTML = items.map((item) => {
    const precioUnitario = item.articulo.precio || 0;
    const cantidad = item.cantidad;
    const descuento = item.descuento || 0;
    const importeNeto = (precioUnitario * cantidad) * (1 - descuento / 100);

    return `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 14px 12px; text-align: left; color: #333333; font-size: 13px; font-family: Arial, sans-serif;">${item.articulo.nombre}</td>
        <td style="padding: 14px 12px; text-align: center; color: #333333; font-size: 13px; font-family: Arial, sans-serif;">${cantidad}</td>
        <td style="padding: 14px 12px; text-align: right; color: #333333; font-size: 13px; font-family: Arial, sans-serif;">${currencySymbol} ${precioUnitario.toFixed(2)}</td>
        <td style="padding: 14px 12px; text-align: right; color: #000000; font-weight: bold; font-size: 13px; font-family: Arial, sans-serif;">${currencySymbol} ${importeNeto.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Bloque de aclaraciones (si existe mensaje)
  const aclaracionesBloque = mensaje ? `
    <tr>
      <td colspan="4" style="padding: 20px 12px 0 12px;">
        <p style="margin: 0 0 8px 0; color: ${colorBrand}; font-weight: bold; font-size: 12px; font-family: Arial, sans-serif; text-transform: uppercase;">ACLARACIONES:</p>
        <p style="margin: 0; color: #555555; font-size: 12px; line-height: 1.5; font-family: Arial, sans-serif;">${mensaje}</p>
      </td>
    </tr>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <table width="100%" style="background-color: #ffffff; max-width: 650px; margin: 0 auto; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- ENCABEZADO -->
        <tr>
          <td style="padding: 30px 30px 20px 30px; border-bottom: 3px solid ${colorBrand};">
            <table width="100%" style="border-collapse: collapse;">
              <tr>
                <td style="vertical-align: top;">
                  <h1 style="margin: 0 0 8px 0; color: ${colorBrand}; font-size: 28px; font-weight: bold; text-transform: uppercase; font-family: Arial, sans-serif;">${titulo.replace('📋 ', '').replace('🧾 ', '')}</h1>
                  <p style="margin: 0; color: #666666; font-size: 11px; font-family: Arial, sans-serif;">Fecha: ${fechaActual}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DATOS DEL CLIENTE -->
        <tr>
          <td style="padding: 20px 30px;">
            <h3 style="margin: 0 0 12px 0; color: ${colorBrand}; font-size: 12px; text-transform: uppercase; font-weight: bold; border-bottom: 2px solid ${colorBrand}; padding-bottom: 6px; font-family: Arial, sans-serif;">DATOS DEL CLIENTE</h3>
            <table width="100%" style="border-collapse: collapse; font-size: 12px; color: #333333;">
              <tr>
                <td style="padding: 4px 0; font-family: Arial, sans-serif;"><strong>Nombre:</strong></td>
                <td style="padding: 4px 0; font-family: Arial, sans-serif;">${nombreCliente}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- TABLA DE ARTÍCULOS -->
        <tr>
          <td style="padding: 20px 30px;">
            <table width="100%" style="border-collapse: collapse; margin-top: 10px;">
              <!-- Encabezados de tabla -->
              <tr style="background-color: ${colorBrand};">
                <th style="padding: 12px 12px; text-align: left; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: Arial, sans-serif; border: none;">DESCRIPCIÓN</th>
                <th style="padding: 12px 12px; text-align: center; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: Arial, sans-serif; border: none;">CANTIDAD</th>
                <th style="padding: 12px 12px; text-align: right; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: Arial, sans-serif; border: none;">PRECIO UNIT.</th>
                <th style="padding: 12px 12px; text-align: right; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: Arial, sans-serif; border: none;">IMPORTE NETO</th>
              </tr>
              <!-- Filas de artículos -->
              ${itemsHTML}
              <!-- Aclaraciones (si existen) -->
              ${aclaracionesBloque}
            </table>
          </td>
        </tr>

        <!-- RESUMEN DE IMPORTES -->
        <tr>
          <td style="padding: 20px 30px;">
            <table width="100%" style="border-collapse: collapse; margin-top: 20px;">
              <tr>
                <td style="text-align: right; padding: 8px 0; color: #333333; font-size: 12px; font-family: Arial, sans-serif;"><strong>Subtotal:</strong></td>
                <td style="text-align: right; padding: 8px 12px; color: #333333; font-size: 12px; font-weight: bold; font-family: Arial, sans-serif; width: 100px;">${currencySymbol} ${subtotal.toFixed(2)}</td>
              </tr>
              ${impuestos && impuestos > 0 ? `
              <tr>
                <td style="text-align: right; padding: 8px 0; color: #333333; font-size: 12px; font-family: Arial, sans-serif;"><strong>RECARGOS / IMPUESTOS:</strong></td>
                <td style="text-align: right; padding: 8px 12px; color: #333333; font-size: 12px; font-weight: bold; font-family: Arial, sans-serif; width: 100px;">${currencySymbol} ${impuestos.toFixed(2)}</td>
              </tr>
              ` : ''}
              <tr style="border-top: 2px solid ${colorBrand}; border-bottom: 2px solid ${colorBrand};">
                <td style="text-align: right; padding: 12px 0; color: ${colorBrand}; font-size: 14px; font-weight: bold; font-family: Arial, sans-serif;">
                  <span style="text-transform: uppercase;">TOTAL:</span>
                </td>
                <td style="text-align: right; padding: 12px 12px; color: ${colorBrand}; font-size: 18px; font-weight: bold; font-family: Arial, sans-serif; width: 100px;">${currencySymbol} ${total.toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- INFORMACIÓN DE CONTACTO -->
        <tr>
          <td style="padding: 25px 30px; border-top: 1px solid #e0e0e0; text-align: center; background-color: #fafafa;">
            <p style="margin: 0 0 10px 0; color: #000000; font-size: 13px; font-weight: bold; font-family: Arial, sans-serif;">${nombreEmpresa}</p>
            <p style="margin: 0; color: #666666; font-size: 11px; font-family: Arial, sans-serif;">
              ${emailEmpresa}
              ${telefonoEmpresa ? `<br />${telefonoEmpresa}` : ''}
            </p>
          </td>
        </tr>

        <!-- PIE DE PÁGINA -->
        <tr>
          <td style="padding: 15px 30px; background-color: #f0f0f0; text-align: center; font-size: 10px; color: #999999; border-top: 1px solid #e0e0e0; font-family: Arial, sans-serif;">
            <p style="margin: 0;">Este documento fue generado automáticamente. Gracias por tu preferencia.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export function generateQuoteTemplate(
  nombreCliente: string,
  items: CartItem[],
  subtotal: number,
  total: number,
  nombreEmpresa: string,
  emailEmpresa: string,
  telefonoEmpresa: string,
  impuestos?: number,
  moneda?: string,
  mensaje?: string,
  colorBrand?: string
): string {
  return generateEmailTemplate(
    nombreCliente,
    items,
    subtotal,
    total,
    '📋 COTIZACIÓN',
    nombreEmpresa,
    emailEmpresa,
    telefonoEmpresa,
    impuestos,
    mensaje || 'Tu cotización personalizada está adjunta en formato PDF.',
    moneda,
    colorBrand
  );
}

export async function sendQuoteEmail(req: Request, res: Response): Promise<void> {
  let transporter: Transporter | null = null;
  try {
    const user = (req as any).user;
    const { emailCliente, nombreCliente, items, subtotal, total, empresaId, impuestos, moneda, mensaje } = req.body as SendQuoteEmailBody;

    if (!emailCliente || !nombreCliente || !items || subtotal === undefined || total === undefined || !empresaId) {
      res.status(400).json({ success: false, message: 'Faltan datos requeridos' }); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente)) {
      res.status(400).json({ success: false, message: 'Correo no válido' }); return;
    }

    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, nombre: true, smtpUser: true, smtpPass: true, emailContacto: true, telefonoContacto: true, config: true } });
    if (!empresa) { res.status(404).json({ success: false, message: 'La empresa no fue encontrada' }); return; }

    transporter = await createTransporter(empresa);
    const emailContacto = empresa.emailContacto || process.env.COMPANY_EMAIL || 'contacto@empresa.com';
    const telefonoContacto = empresa.telefonoContacto || process.env.COMPANY_PHONE || '+34 XXX XXX XXX';

    // --- GENERAR HTML DEL CORREO (SIMPLE) ---
    let htmlTemplate: string;
    let colorPdf = '#F06543';
    if (empresa.config) {
      try {
        const configData = typeof empresa.config === 'string' ? JSON.parse(empresa.config) : empresa.config;
        colorPdf = configData?.colorPdf || '#F06543';
        if (configData.templateCotizacion) {
          const htmlFilaCustom = configData.templateFilaCotizacion ? safeDecode(configData.templateFilaCotizacion) : undefined;
          htmlTemplate = renderCustomTemplate(safeDecode(configData.templateCotizacion), { nombreCliente, nombreEmpresa: empresa.nombre, subtotal, total, impuestos, moneda: moneda || '$', items }, htmlFilaCustom);
        } else {
          htmlTemplate = generateQuoteTemplate(nombreCliente, items, subtotal, total, empresa.nombre, emailContacto, telefonoContacto, impuestos, moneda, mensaje, colorPdf);
        }
      } catch (err) {
        htmlTemplate = generateQuoteTemplate(nombreCliente, items, subtotal, total, empresa.nombre, emailContacto, telefonoContacto, impuestos, moneda, mensaje, colorPdf);
      }
    } else {
      htmlTemplate = generateQuoteTemplate(nombreCliente, items, subtotal, total, empresa.nombre, emailContacto, telefonoContacto, impuestos, moneda, mensaje, colorPdf);
    }

    // --- GENERAR PDF ADJUNTO USANDO generatePdfDefinition ---
    let pdfBuffer: any = null;
    try {
      // Importamos dinámicamente la función desde pedidos.controller
      const { generatePdfDefinition } = require('./pedidos.controller');

      // Crear un objeto tipo "pedido" compatible con generatePdfDefinition
      const mockPedido = {
        id: 'COTIZACION-' + Date.now(),
        nombre: nombreCliente,
        razonSocial: null,
        cuit: null,
        email: emailCliente,
        telefono: null,
        empresa: {
          nombre: empresa.nombre,
          emailContacto: emailContacto,
          telefonoContacto: telefonoContacto
        },
        items: items.map((item: CartItem) => ({
          nombreArticulo: item.articulo.nombre,
          cantidad: item.cantidad,
          precioUnitario: item.articulo.precio,
          descuento: item.descuento || 0
        })),
        subtotal: subtotal,
        impuestos: impuestos || 0,
        total: total,
        moneda: moneda || 'ARS',
        notas: mensaje ? [{ texto: mensaje }] : []
      };

      const configEmpresa = empresa.config 
        ? (typeof empresa.config === 'string' ? JSON.parse(empresa.config) : empresa.config)
        : {};

      const docDefinition = await generatePdfDefinition(mockPedido, configEmpresa);

      const pdfDocGenerator: any = pdfMake.createPdf(docDefinition);
      pdfBuffer = await pdfDocGenerator.getBuffer();
    } catch (pdfError) {
      console.error('⚠️ Error generando el PDF adjunto:', pdfError);
    }

    const fromEmail = empresa.smtpUser || process.env.EMAIL_USER || 'noreply@empresa.com';
    const mailOptions: SendMailOptions = {
      from: `${empresa.nombre} <${fromEmail}>`,
      to: emailCliente,
      subject: `📋 Cotización de ${empresa.nombre}`,
      html: htmlTemplate,
      replyTo: emailContacto
    };

    if (pdfBuffer) {
      const cleanName = nombreCliente.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      mailOptions.attachments = [{ filename: `Cotizacion_${cleanName}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
    }

    if (!transporter) {
      throw new Error('No se pudo inicializar el transportador de correo');
    }

    const info = await transporter.sendMail(mailOptions);

    prisma.auditLog.create({
      data: {
        usuarioId: user?.id || 'SISTEMA', empresaId, accion: 'ACTUALIZACION_PEDIDO', tablaAfectada: 'PEDIDO', registroId: 'SISTEMA',
        motivo: `📧 Cotización enviada a: ${emailCliente}`, valorNuevo: { nombre: nombreCliente } as any
      }
    }).catch(err => console.error('Error auditoría:', err));

    res.status(200).json({ success: true, message: 'Cotización enviada exitosamente', messageId: info.messageId });
  } catch (error) {
    console.error('Error al enviar cotización:', error);
    res.status(500).json({ success: false, message: 'Error al enviar la cotización' });
  }
}

export async function verifyTransporter(): Promise<boolean> {
  try {
    const defaultTransporter = await createTransporter({ id: 'default', nombre: 'Default' });
    await defaultTransporter.verify();
    return true;
  } catch (error) {
    return false;
  }
}

export async function sendTicket(req: Request, res: Response): Promise<void> {
  let transporter: Transporter | null = null;
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!id) { res.status(400).json({ success: false, message: 'ID requerido' }); return; }

    const venta = await prisma.venta.findUnique({
      where: { id: id },
      include: { cliente: true, items: { include: { articulo: true } }, empresa: { select: { id: true, nombre: true, smtpUser: true, smtpPass: true, emailContacto: true, telefonoContacto: true, config: true } } }
    });

    if (!venta || !venta.empresa || !venta.cliente.email) { res.status(400).json({ success: false, message: 'Datos faltantes' }); return; }

    transporter = await createTransporter(venta.empresa);
    const emailContacto = venta.empresa.emailContacto || process.env.COMPANY_EMAIL || 'contacto@empresa.com';
    const telefonoContacto = venta.empresa.telefonoContacto || process.env.COMPANY_PHONE || '+34 XXX XXX XXX';

    const items: CartItem[] = venta.items.map((item: any) => ({
      articulo: { nombre: item.articulo?.nombre || 'Eliminado', precio: item.subtotal / (item.cantidadUnidades > 0 ? item.cantidadUnidades : item.cantidadKilos) },
      cantidad: item.cantidadUnidades > 0 ? item.cantidadUnidades : item.cantidadKilos,
      descuento: item.descuento || 0
    }));

    const subtotal = venta.items.reduce((acc: number, item: any) => acc + parseFloat(item.subtotal.toString()), 0);
    const descuentoTotal = venta.descuento ? parseFloat(venta.descuento.toString()) : 0;
    const total = parseFloat(venta.montoTotal.toString());

    let htmlTemplate: string;
    let colorBrand = '#F06543';
    if (venta.empresa.config) {
      try {
        const configData = typeof venta.empresa.config === 'string' ? JSON.parse(venta.empresa.config) : venta.empresa.config;
        colorBrand = configData?.colorPdf || '#F06543';
        if (configData.templateTicket) {
          const htmlFilaCustom = configData.templateFilaTicket ? safeDecode(configData.templateFilaTicket) : undefined;
          htmlTemplate = renderCustomTemplate(safeDecode(configData.templateTicket), { nombreCliente: venta.cliente.nombre, nombreEmpresa: venta.empresa.nombre, subtotal, total, impuestos: descuentoTotal > 0 ? descuentoTotal : undefined, moneda: '$', items }, htmlFilaCustom);
        } else { htmlTemplate = generateEmailTemplate(venta.cliente.nombre, items, subtotal, total, '🧾 TICKET DE VENTA', venta.empresa.nombre, emailContacto, telefonoContacto, descuentoTotal > 0 ? descuentoTotal : undefined, 'Gracias por tu compra. El comprobante está adjunto.', '$', colorBrand); }
      } catch (err) { htmlTemplate = generateEmailTemplate(venta.cliente.nombre, items, subtotal, total, '🧾 TICKET DE VENTA', venta.empresa.nombre, emailContacto, telefonoContacto, descuentoTotal > 0 ? descuentoTotal : undefined, 'Gracias por tu compra. El comprobante está adjunto.', '$', colorBrand); }
    } else { htmlTemplate = generateEmailTemplate(venta.cliente.nombre, items, subtotal, total, '🧾 TICKET DE VENTA', venta.empresa.nombre, emailContacto, telefonoContacto, descuentoTotal > 0 ? descuentoTotal : undefined, 'Gracias por tu compra. El comprobante está adjunto.', '$', colorBrand); }

    let pdfBuffer: Buffer | null = null;
    try {
      const { generatePdfDefinition } = require('./pedidos.controller');

      const mockPedido = {
        id: 'TICKET-' + venta.id,
        nombre: venta.cliente.nombre,
        razonSocial: null,
        cuit: null,
        email: venta.cliente.email,
        telefono: null,
        empresa: {
          nombre: venta.empresa.nombre,
          emailContacto: emailContacto,
          telefonoContacto: telefonoContacto
        },
        items: venta.items.map((item: any) => ({
          nombreArticulo: item.articulo?.nombre || 'Eliminado',
          cantidad: item.cantidadUnidades > 0 ? item.cantidadUnidades : item.cantidadKilos,
          precioUnitario: item.subtotal / (item.cantidadUnidades > 0 ? item.cantidadUnidades : item.cantidadKilos),
          descuento: item.descuento || 0
        })),
        subtotal: subtotal,
        impuestos: descuentoTotal > 0 ? descuentoTotal : 0,
        total: total,
        moneda: '$'
      };

      const configEmpresa = venta.empresa.config
        ? (typeof venta.empresa.config === 'string' ? JSON.parse(venta.empresa.config) : venta.empresa.config)
        : {};

      const docDefinition = await generatePdfDefinition(mockPedido, configEmpresa);

      const pdfDocGenerator: any = pdfMake.createPdf(docDefinition);
      pdfBuffer = await pdfDocGenerator.getBuffer();
    } catch (pdfError) { console.error('⚠️ Error generando PDF ticket:', pdfError); }

    const fechaFormateada = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(venta.fecha));
    const fromEmail = venta.empresa.smtpUser || process.env.EMAIL_USER || 'noreply@empresa.com';
    const mailOptions: SendMailOptions = { from: `${venta.empresa.nombre} <${fromEmail}>`, to: venta.cliente.email, subject: `🧾 Ticket de Venta ${fechaFormateada}`, html: htmlTemplate, replyTo: emailContacto };

    if (pdfBuffer) mailOptions.attachments = [{ filename: `Ticket_${venta.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];

    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Ticket enviado', messageId: info.messageId });
  } catch (error) {
    console.error('Error al enviar ticket:', error);
    res.status(500).json({ success: false, message: 'Error al enviar ticket' });
  }
}

export default { sendQuoteEmail, sendTicket, verifyTransporter };
