import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

import { JSDOM } from 'jsdom';
// @ts-ignore
import * as pdfMakeModule from 'pdfmake/build/pdfmake.js';
// @ts-ignore
import * as pdfFontsModule from 'pdfmake/build/vfs_fonts.js';
// @ts-ignore
import htmlToPdfmakeModule from 'html-to-pdfmake';

// Casting a "any" para silenciar por completo a TypeScript
const pdfMake: any = pdfMakeModule && (pdfMakeModule as any).default ? (pdfMakeModule as any).default : pdfMakeModule;
const pdfFonts: any = pdfFontsModule && (pdfFontsModule as any).default ? (pdfFontsModule as any).default : pdfFontsModule;
const htmlToPdfmake: any = htmlToPdfmakeModule && (htmlToPdfmakeModule as any).default ? (htmlToPdfmakeModule as any).default : htmlToPdfmakeModule;

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
  mensaje?: string
): string {
  const fechaGeneracion = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const itemsHTML = items.map((item) => {
    const precioUnitario = item.articulo.precio || 0;
    const cantidad = item.cantidad;
    const descuento = item.descuento || 0;
    const itemSubtotal = (precioUnitario * cantidad) * (1 - descuento / 100);
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; color: #334155; font-size: 12px;">${item.articulo.nombre}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155; font-size: 12px;">${cantidad}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155; font-size: 12px;">$${precioUnitario.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #0f172a; font-weight: bold; font-size: 12px;">$${itemSubtotal.toFixed(2)}</td>
      </tr>`;
  }).join('');

  const impuestosHTML = impuestos && impuestos > 0 ? `
    <tr>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #64748b;">Impuestos (IVA):</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #0f172a;">$${impuestos.toFixed(2)}</td>
    </tr>` : '';

  return `
    <div style="font-family: Helvetica, Arial, sans-serif; color: #334155; padding: 20px;">
      
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
        <tr>
          <td width="50%" style="vertical-align: top;">
            <h1 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: bold; text-transform: uppercase;">${titulo}</h1>
            <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">${nombreEmpresa}</p>
          </td>
          <td width="50%" style="text-align: right; vertical-align: top;">
            <table width="100%" cellpadding="6" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
              <tr>
                <td style="text-align: right; font-size: 11px; color: #475569;"><strong>Fecha:</strong></td>
                <td style="text-align: left; font-size: 11px; color: #475569;">${fechaGeneracion}</td>
              </tr>
              <tr>
                <td style="text-align: right; font-size: 11px; color: #475569;"><strong>Cliente:</strong></td>
                <td style="text-align: left; font-size: 11px; color: #475569;">${nombreCliente}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="font-size: 13px; margin-bottom: 20px; line-height: 1.5;">${mensaje || 'Detalle de la cotización solicitada:'}</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr>
            <th style="padding: 10px; background-color: #0f172a; color: #ffffff; text-align: left; font-size: 11px; font-weight: bold; text-transform: uppercase; border: 1px solid #0f172a;">Concepto / Artículo</th>
            <th style="padding: 10px; background-color: #0f172a; color: #ffffff; text-align: center; font-size: 11px; font-weight: bold; text-transform: uppercase; border: 1px solid #0f172a;">Cant.</th>
            <th style="padding: 10px; background-color: #0f172a; color: #ffffff; text-align: right; font-size: 11px; font-weight: bold; text-transform: uppercase; border: 1px solid #0f172a;">Precio Unit.</th>
            <th style="padding: 10px; background-color: #0f172a; color: #ffffff; text-align: right; font-size: 11px; font-weight: bold; text-transform: uppercase; border: 1px solid #0f172a;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 40px;">
        <tr>
          <td width="55%"></td>
          <td width="45%">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #f8fafc; border: 1px solid #e2e8f0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #64748b;">Subtotal:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #0f172a; font-weight: bold;">$${subtotal.toFixed(2)}</td>
              </tr>
              ${impuestosHTML}
              <tr>
                <td style="padding: 12px 10px; text-align: right; font-size: 14px; font-weight: bold; color: #0f172a;">TOTAL:</td>
                <td style="padding: 12px 10px; text-align: right; font-size: 16px; font-weight: bold; color: #2563eb;">$${total.toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">
        <p style="margin: 0; font-size: 10px; color: #94a3b8;">Documento emitido por <strong>${nombreEmpresa}</strong></p>
        <p style="margin: 5px 0 0 0; font-size: 10px; color: #94a3b8;">${emailEmpresa} ${telefonoEmpresa ? `| Tel: ${telefonoEmpresa}` : ''}</p>
      </div>

    </div>
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
  impuestos?: number
): string {
  return generateEmailTemplate(nombreCliente, items, subtotal, total, '📋 COTIZACIÓN', nombreEmpresa, emailEmpresa, telefonoEmpresa, impuestos, 'Tu cotización personalizada:');
}

export async function sendQuoteEmail(req: Request, res: Response): Promise<void> {
  let transporter: Transporter | null = null;
  try {
    const user = (req as any).user;
    const { emailCliente, nombreCliente, items, subtotal, total, empresaId, impuestos } = req.body as SendQuoteEmailBody;

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
    const { moneda } = req.body as SendQuoteEmailBody;

    let htmlTemplate: string;
    if (empresa.config) {
      try {
        const configData = typeof empresa.config === 'string' ? JSON.parse(empresa.config) : empresa.config;
        if (configData.templateCotizacion) {
          const htmlFilaCustom = configData.templateFilaCotizacion ? safeDecode(configData.templateFilaCotizacion) : undefined;
          htmlTemplate = renderCustomTemplate(safeDecode(configData.templateCotizacion), { nombreCliente, nombreEmpresa: empresa.nombre, subtotal, total, impuestos, moneda: moneda || '$', items }, htmlFilaCustom);
        } else {
          htmlTemplate = generateQuoteTemplate(nombreCliente, items, subtotal, total, empresa.nombre, emailContacto, telefonoContacto, impuestos);
        }
      } catch (err) {
        htmlTemplate = generateQuoteTemplate(nombreCliente, items, subtotal, total, empresa.nombre, emailContacto, telefonoContacto, impuestos);
      }
    } else {
      htmlTemplate = generateQuoteTemplate(nombreCliente, items, subtotal, total, empresa.nombre, emailContacto, telefonoContacto, impuestos);
    }

    let pdfBuffer: any = null;
    try {
      let cleanHtml = htmlTemplate.replace(/font-family:[^;"]+;?/gi, '');
      cleanHtml = cleanHtml.replace(/<img[^>]*>/gi, '');

      const { window } = new JSDOM('');
      const pdfMakeContent = htmlToPdfmake(cleanHtml, { window });

      const docDefinition = { content: pdfMakeContent, defaultStyle: { font: 'Roboto' } };
      const pdfDocGenerator: any = pdfMake.createPdf(docDefinition);

      // ¡Esperamos la Promesa!
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
    if (venta.empresa.config) {
      try {
        const configData = typeof venta.empresa.config === 'string' ? JSON.parse(venta.empresa.config) : venta.empresa.config;
        if (configData.templateTicket) {
          const htmlFilaCustom = configData.templateFilaTicket ? safeDecode(configData.templateFilaTicket) : undefined;
          htmlTemplate = renderCustomTemplate(safeDecode(configData.templateTicket), { nombreCliente: venta.cliente.nombre, nombreEmpresa: venta.empresa.nombre, subtotal, total, impuestos: descuentoTotal > 0 ? descuentoTotal : undefined, moneda: '$', items }, htmlFilaCustom);
        } else { htmlTemplate = generateEmailTemplate(venta.cliente.nombre, items, subtotal, total, '🧾 TICKET DE VENTA', venta.empresa.nombre, emailContacto, telefonoContacto, descuentoTotal > 0 ? descuentoTotal : undefined, 'Gracias por tu compra.'); }
      } catch (err) { htmlTemplate = generateEmailTemplate(venta.cliente.nombre, items, subtotal, total, '🧾 TICKET DE VENTA', venta.empresa.nombre, emailContacto, telefonoContacto, descuentoTotal > 0 ? descuentoTotal : undefined, 'Gracias por tu compra.'); }
    } else { htmlTemplate = generateEmailTemplate(venta.cliente.nombre, items, subtotal, total, '🧾 TICKET DE VENTA', venta.empresa.nombre, emailContacto, telefonoContacto, descuentoTotal > 0 ? descuentoTotal : undefined, 'Gracias por tu compra.'); }

    let pdfBuffer: Buffer | null = null;
    try {
      let cleanHtml = htmlTemplate.replace(/font-family:[^;"]+;?/gi, '');
      cleanHtml = cleanHtml.replace(/<img[^>]*>/gi, '');

      const { window } = new JSDOM('');
      const pdfMakeContent = htmlToPdfmake(cleanHtml, { window });

      const docDefinition = { content: pdfMakeContent, defaultStyle: { font: 'Roboto' } };
      const pdfDocGenerator: any = pdfMake.createPdf(docDefinition);

      // ¡Esperamos la Promesa!
      pdfBuffer = await pdfDocGenerator.getBuffer();
    } catch (pdfError) { console.error('⚠️ Error generando PDF ticket:', pdfError); }

    const fechaFormateada = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(venta.fecha));
    const fromEmail = venta.empresa.smtpUser || process.env.EMAIL_USER || 'noreply@empresa.com';
    const mailOptions: SendMailOptions = { from: `${venta.empresa.nombre} <${fromEmail}>`, to: venta.cliente.email, subject: `🧾 Ticket de Venta ${fechaFormateada}`, html: htmlTemplate, replyTo: emailContacto };

    if (pdfBuffer) mailOptions.attachments = [{ filename: `Ticket_${venta.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];

    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Ticket enviado', messageId: info.messageId });
  } catch (error) { res.status(500).json({ success: false, message: 'Error al enviar ticket' }); }
}

export default { sendQuoteEmail, sendTicket, verifyTransporter };