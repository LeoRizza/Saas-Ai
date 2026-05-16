import nodemailer, { Transporter } from 'nodemailer';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Interfaz para los items del carrito
interface CartItem {
  articulo: {
    nombre: string;
    precio: number;
  };
  cantidad: number;
  descuento: number;
}

// Interfaz para el body del request
interface SendQuoteEmailBody {
  emailCliente: string;
  nombreCliente: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  nombreEmpresa: string;
  empresaId: string;
  impuestos?: number;
}

// Interfaz para datos de empresa
interface EmpresaData {
  id: string;
  nombre: string;
  smtpUser?: string | null;
  smtpPass?: string | null;
  emailContacto?: string | null;
  telefonoContacto?: string | null;
}

/**
 * Función auxiliar para crear un transportador dinámico según la empresa
 * Si la empresa tiene credenciales SMTP propias, las usa.
 * Si no, utiliza las credenciales por defecto del sistema.
 * @param empresa - Datos de la empresa
 * @returns Transportador SMTP configurado
 */
async function createTransporter(empresa: EmpresaData): Promise<Transporter> {
  if (empresa.smtpUser && empresa.smtpPass) {
    // Usar credenciales SMTP de la empresa
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: empresa.smtpUser,
        pass: empresa.smtpPass
      }
    });
  }

  // Fallback a credenciales globales
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

/**
 * Función para generar el template HTML uniforme con diseño estandarizado
 * @param nombreCliente - Nombre del cliente
 * @param items - Items del carrito/venta
 * @param subtotal - Subtotal de la venta
 * @param total - Total de la venta
 * @param titulo - Título del email
 * @param emailEmpresa - Email de contacto de la empresa
 * @param telefonoEmpresa - Teléfono de contacto de la empresa
 * @param impuestos - Impuestos aplicados (opcional)
 * @param mensaje - Mensaje personalizado del email (opcional)
 */
function generateEmailTemplate(
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
  const fechaGeneracion = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const itemsHTML = items
    .map((item) => {
      const precioUnitario = item.articulo.precio || 0;
      const cantidad = item.cantidad;
      const descuento = item.descuento || 0;
      const itemSubtotal = (precioUnitario * cantidad) * (1 - descuento / 100);

      return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 15px; text-align: left; color: #1f2937; font-size: 14px;">${item.articulo.nombre}</td>
        <td style="padding: 12px 15px; text-align: center; color: #1f2937; font-size: 14px;">${cantidad}</td>
        <td style="padding: 12px 15px; text-align: right; color: #1f2937; font-size: 14px;">$${precioUnitario.toFixed(2)}</td>
        <td style="padding: 12px 15px; text-align: right; color: #1f2937; font-weight: 600; font-size: 14px;">$${itemSubtotal.toFixed(2)}</td>
      </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${titulo}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); overflow: hidden;">
        <!-- Header -->
        <div style="background-color: #1e293b; color: white; padding: 40px 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">${titulo}</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; color: #cbd5e1;">${nombreEmpresa}</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          <!-- Greeting -->
          <div style="color: #1f2937; margin-bottom: 20px; font-size: 16px; line-height: 1.5;">
            ¡Hola <strong style="font-weight: 600;">${nombreCliente}</strong>!
          </div>

          <p style="color: #6b7280; margin: 15px 0; font-size: 14px; line-height: 1.6;">
            ${mensaje || 'Te compartimos los detalles de tu transacción. Revisa la información a continuación:'}
          </p>

          <!-- Info Section -->
          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 5px; margin-bottom: 30px; font-size: 14px;">
            <p style="margin: 5px 0; color: #475569;"><strong>📅 Fecha:</strong> ${fechaGeneracion}</p>
            <p style="margin: 5px 0; color: #475569;"><strong>👤 Cliente:</strong> ${nombreCliente}</p>
          </div>

          <!-- Table Container -->
          <div style="margin: 30px 0; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #1e293b; color: white;">
                  <th style="padding: 15px; text-align: left; font-weight: 600; font-size: 14px;">Concepto</th>
                  <th style="padding: 15px; text-align: center; font-weight: 600; font-size: 14px;">Cantidad</th>
                  <th style="padding: 15px; text-align: right; font-weight: 600; font-size: 14px;">Precio Unitario</th>
                  <th style="padding: 15px; text-align: right; font-weight: 600; font-size: 14px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>
          </div>

          <!-- Summary -->
          <div style="margin-top: 30px; background-color: #f1f5f9; padding: 20px; border-radius: 5px;">
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #cbd5e1; font-size: 14px;">
              <span style="color: #475569;">Subtotal:</span>
              <span style="color: #1f2937; font-weight: 500;">$${subtotal.toFixed(2)}</span>
            </div>
            ${impuestos && impuestos > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #cbd5e1; font-size: 14px;">
              <span style="color: #475569;">Impuestos (IVA):</span>
              <span style="color: #1f2937; font-weight: 500;">$${impuestos.toFixed(2)}</span>
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 15px 0 0 0; font-size: 18px; font-weight: 700; color: #1e293b;">
              <span>TOTAL:</span>
              <span style="color: #0ea5e9;">$${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 20px 30px; text-align: center; border-top: 1px solid #cbd5e1;">
          <div style="margin-bottom: 15px;">
            <p style="margin: 5px 0; color: #475569; font-size: 12px;">
              <strong>Contáctanos:</strong>
            </p>
            <p style="margin: 5px 0; color: #475569; font-size: 12px;">
              📧 <a href="mailto:${emailEmpresa}" style="color: #0ea5e9; text-decoration: none;">${emailEmpresa}</a>
            </p>
            <p style="margin: 5px 0; color: #475569; font-size: 12px;">
              📱 ${telefonoEmpresa}
            </p>
          </div>
          <p style="margin: 5px 0; color: #475569; font-size: 12px; border-top: 1px solid #cbd5e1; padding-top: 10px;">Powered by <strong>LR|tech</strong></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Función para generar el template HTML del correo de cotización
 */
function generateQuoteTemplate(
  nombreCliente: string,
  items: CartItem[],
  subtotal: number,
  total: number,
  nombreEmpresa: string,
  emailEmpresa: string,
  telefonoEmpresa: string,
  impuestos?: number
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
    'Te compartimos tu cotización personalizada. Revisa los detalles a continuación:'
  );
}

/**
 * Controlador para enviar cotización por correo
 * @param req - Request con body: { emailCliente, nombreCliente, items, subtotal, total, empresaId, impuestos? }
 * @param res - Response
 */
export async function sendQuoteEmail(req: Request, res: Response): Promise<void> {
  let transporter: Transporter | null = null;

  try {
    const user = (req as any).user;
    const {
      emailCliente,
      nombreCliente,
      items,
      subtotal,
      total,
      empresaId,
      impuestos
    } = req.body as SendQuoteEmailBody;

    // Validar datos requeridos
    if (!emailCliente || !nombreCliente || !items || subtotal === undefined || total === undefined || !empresaId) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: emailCliente, nombreCliente, items, subtotal, total, empresaId'
      });
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailCliente)) {
      res.status(400).json({
        success: false,
        message: 'El formato del correo no es válido'
      });
      return;
    }

    // Validar que items sea un array
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un artículo en la cotización'
      });
      return;
    }

    // Buscar los datos de la empresa
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        nombre: true,
        smtpUser: true,
        smtpPass: true,
        emailContacto: true,
        telefonoContacto: true
      }
    });

    if (!empresa) {
      res.status(404).json({
        success: false,
        message: 'La empresa no fue encontrada'
      });
      return;
    }

    // Crear transportador dinámico
    transporter = await createTransporter(empresa);

    // Validar y usar fallbacks para datos de contacto
    const emailContacto = empresa.emailContacto || process.env.COMPANY_EMAIL || 'contacto@empresa.com';
    const telefonoContacto = empresa.telefonoContacto || process.env.COMPANY_PHONE || '+34 XXX XXX XXX';

    // Generar template HTML
    const htmlTemplate = generateQuoteTemplate(
      nombreCliente,
      items,
      subtotal,
      total,
      empresa.nombre,
      emailContacto,
      telefonoContacto,
      impuestos
    );

    // Configurar opciones del correo
    const fromEmail = empresa.smtpUser || process.env.EMAIL_USER || 'noreply@empresa.com';
    const mailOptions = {
      from: `${empresa.nombre} <${fromEmail}>`,
      to: emailCliente,
      subject: `📋 Cotización de ${empresa.nombre}`,
      html: htmlTemplate,
      replyTo: emailContacto
    };

    // Enviar correo
    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Cotización enviada a ${emailCliente}. MessageID: ${info.messageId}`);

    // Auditoría en Fire & Forget
    prisma.auditLog.create({
      data: {
        usuarioId: user?.id || 'SISTEMA',
        empresaId: empresaId,
        accion: 'ACTUALIZACION_PEDIDO',
        tablaAfectada: 'PEDIDO',
        registroId: 'SISTEMA',
        motivo: `Cotización enviada al email: ${emailCliente}`
      }
    }).catch(err => console.error('❌ Error registrando auditoría de cotización:', err));

    res.status(200).json({
      success: true,
      message: 'Cotización enviada exitosamente',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('❌ Error al enviar cotización:', error);

    res.status(500).json({
      success: false,
      message: 'Error al enviar la cotización',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}

/**
 * Función auxiliar para verificar la conexión del transportador con credenciales por defecto
 */
export async function verifyTransporter(): Promise<boolean> {
  try {
    const defaultTransporter = await createTransporter({
      id: 'default',
      nombre: 'Default'
    });
    await defaultTransporter.verify();
    console.log('✅ Transportador SMTP verificado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error al verificar transportador SMTP:', error);
    return false;
  }
}

/**
 * Controlador para enviar el ticket/venta por correo
 * @param req - Request con params: { id } - ID de la venta
 * @param res - Response
 */
export async function sendTicket(req: Request, res: Response): Promise<void> {
  let transporter: Transporter | null = null;

  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Validar que se proporcionó el ID de venta
    if (!id) {
      res.status(400).json({
        success: false,
        message: 'El ID de la venta es requerido'
      });
      return;
    }

    // Buscar la venta en Prisma con includes
    const venta = await prisma.venta.findUnique({
      where: { id: id },
      include: {
        cliente: true,
        items: {
          include: {
            articulo: true
          }
        },
        empresa: {
          select: {
            id: true,
            nombre: true,
            smtpUser: true,
            smtpPass: true,
            emailContacto: true,
            telefonoContacto: true
          }
        }
      }
    });

    // Validar que la venta existe
    if (!venta) {
      res.status(404).json({
        success: false,
        message: 'La venta no fue encontrada'
      });
      return;
    }

    // Validar que la venta tiene empresa asociada
    if (!venta.empresa) {
      res.status(400).json({
        success: false,
        message: 'La venta no tiene una empresa asociada'
      });
      return;
    }

    // Validar que el cliente tenga email
    if (!venta.cliente.email) {
      res.status(400).json({
        success: false,
        message: 'El cliente no tiene un email registrado'
      });
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(venta.cliente.email)) {
      res.status(400).json({
        success: false,
        message: 'El formato del correo del cliente no es válido'
      });
      return;
    }

    // Validar que la venta tenga items
    if (!venta.items || venta.items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La venta no tiene artículos asociados'
      });
      return;
    }

    // Crear transportador dinámico
    transporter = await createTransporter(venta.empresa);

    // Validar y usar fallbacks para datos de contacto
    const emailContacto = venta.empresa.emailContacto || process.env.COMPANY_EMAIL || 'contacto@empresa.com';
    const telefonoContacto = venta.empresa.telefonoContacto || process.env.COMPANY_PHONE || '+34 XXX XXX XXX';

    // Transformar items al formato esperado para el email
    const items: CartItem[] = venta.items.map((item: any) => {
      const cantidad = item.cantidadUnidades > 0 ? item.cantidadUnidades : item.cantidadKilos;
      return {
        articulo: {
          nombre: item.articulo?.nombre || 'Artículo eliminado',
          precio: item.subtotal / cantidad // Precio unitario calculado
        },
        cantidad: cantidad,
        descuento: item.descuento || 0
      };
    });

    // Calcular subtotal sumando los subtotales de cada item
    const subtotal = venta.items.reduce((acc: number, item: any) => {
      return acc + parseFloat(item.subtotal.toString());
    }, 0);

    // Usar montoTotal y descuento de la venta
    const descuentoTotal = venta.descuento ? parseFloat(venta.descuento.toString()) : 0;
    const total = parseFloat(venta.montoTotal.toString());

    // Generar template HTML
    const htmlTemplate = generateEmailTemplate(
      venta.cliente.nombre,
      items,
      subtotal,
      total,
      '🧾 TICKET DE VENTA',
      venta.empresa.nombre,
      emailContacto,
      telefonoContacto,
      descuentoTotal > 0 ? descuentoTotal : undefined,
      'Gracias por tu compra. Aquí se encuentran los detalles de tu transacción:'
    );

    // Configurar opciones del correo
    const fechaFormateada = new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(venta.fecha));
    const fromEmail = venta.empresa.smtpUser || process.env.EMAIL_USER || 'noreply@empresa.com';
    const mailOptions = {
      from: `${venta.empresa.nombre} <${fromEmail}>`,
      to: venta.cliente.email,
      subject: `🧾 Ticket de Venta ${fechaFormateada}`,
      html: htmlTemplate,
      replyTo: emailContacto
    };

    // Enviar correo
    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Ticket enviado a ${venta.cliente.email}. MessageID: ${info.messageId}`);

    // Auditoría en Fire & Forget
    prisma.auditLog.create({
      data: {
        usuarioId: user?.id || 'SISTEMA',
        empresaId: venta.empresa.id,
        accion: 'VENTA',
        tablaAfectada: 'VENTA',
        registroId: venta.id,
        motivo: `Ticket de venta enviado al email: ${venta.cliente.email}`
      }
    }).catch(err => console.error('❌ Error registrando auditoría de venta:', err));

    res.status(200).json({
      success: true,
      message: 'Ticket enviado exitosamente',
      messageId: info.messageId,
      ventaId: venta.id,
      email: venta.cliente.email
    });
  } catch (error) {
    console.error('❌ Error al enviar ticket:', error);

    res.status(500).json({
      success: false,
      message: 'Error al enviar el ticket',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}

export default {
  sendQuoteEmail,
  sendTicket,
  verifyTransporter
};
