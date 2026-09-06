// src/types/index.ts

export enum RolUsuario {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  VENDEDOR = 'VENDEDOR',
  CAJA = 'CAJA',
  OPERARIO = 'OPERARIO'
}

export enum AccionAudit {
  PRODUCCION = 'PRODUCCION',
  VENTA = 'VENTA',
  AJUSTE_MANUAL = 'AJUSTE_MANUAL',
  MODIFICACION_CLIENTE = 'MODIFICACION_CLIENTE',
  IMPORTACION_CSV = 'IMPORTACION_CSV',
  ACTUALIZACION_MASIVA_CSV = 'ACTUALIZACION_MASIVA_CSV',
  CREACION_PEDIDO = 'CREACION_PEDIDO',
  ACTUALIZACION_PEDIDO = 'ACTUALIZACION_PEDIDO',
  CREACION_ARTICULO = 'CREACION_ARTICULO',
  ACTUALIZACION_ARTICULO = 'ACTUALIZACION_ARTICULO',
  CREACION_USUARIO = 'CREACION_USUARIO',
  ACTUALIZACION_USUARIO = 'ACTUALIZACION_USUARIO',
  CREACION_EMPRESA = 'CREACION_EMPRESA',
  ACTUALIZACION_EMPRESA = 'ACTUALIZACION_EMPRESA',
  INGRESO_COMPRA = 'INGRESO_COMPRA',
  CREACION_PEDIDO_BOT = 'CREACION_PEDIDO_BOT'
}

export enum TablaAudit {
  ARTICULO = 'ARTICULO',
  CLIENTE = 'CLIENTE',
  EMPRESA = 'EMPRESA',
  USUARIO = 'USUARIO',
  PEDIDO = 'PEDIDO',
  INVENTARIO = 'INVENTARIO',
  VENTA = 'VENTA'
}

export enum EstadoFiscal {
  NO_ENVIADO = 'NO_ENVIADO',
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO'
}

export interface Empresa {
  id: string;
  nombre: string;
  activa: boolean;
  logoUrl?: string;
  razonSocial?: string;
  cuit?: string;
  condicionIva?: string;
  emailContacto?: string;
  telefonoContacto?: string;
  smtpUser?: string;
  smtpPass?: string;
  apiKey?: string;
  config?: { modules?: string[]; maxImagenes?: number } | any;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Inventario {
  id: string;
  nombre: string;
  empresaId: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  empresaId?: string; // Opcional para SUPER_ADMIN
  password?: string;
  activo: boolean;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Articulo {
  id: string;
  nombre: string;
  categoria: string;
  codigoBarras?: string;
  stockKilos: number;
  stockUnidades: number;
  unidadesPorCaja: number;
  updatedAt: string;
  imagenes?: any;
  precio?: number;
  costo?: number;
  descripcion?: string; 
  longDescription?: string;
  subcategoria?: string;
  sku?: string;
  serie?: string;
  videoUrl?: string;
  empresaId: string;
  inventarioId: string;
  metadata?: any;
  createdAt: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  razonSocial: string;
  email: string;
  telefono: string;
  direccion: string;
  cuit: string;
  condicionIva: string;
  comentarios?: string;
  fechaRecordatorio?: string;
  tag?: string;
  empresaId: string;
  activo: boolean;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  usuarioId: string;
  empresaId: string;
  accion: AccionAudit;
  tablaAfectada: TablaAudit;
  registroId: string;
  valorAnterior: any;
  valorNuevo: any;
  motivo?: string;
  createdAt: string;
  metadata?: any;
}

export interface InsumoConsumidoLog {
  insumoId: string;
  insumoNombre: string;
  kilos: number;
  unidades: number;
  metadata?: any;
}

export interface ProduccionLog {
  id: string;
  fecha: string;
  productoNombre: string;
  unidades: number;
  peso: number;
  usuarioNombre: string;
  empresaId: string;
  inventarioOrigenId: string;
  inventarioDestinoId: string;
  metadata?: any;
}

export interface ProduccionLogFrontend {
  id: string;
  productoId: string;
  productoNombre: string;
  unidades: number;
  peso: number;
  insumos: InsumoConsumidoLog[];
  fecha: string;
  usuario: string;
  empresaId: string;
  inventarioOrigenId: string;
  inventarioDestinoId: string;
  metadata?: any;
}

export interface VentaItem {
  id: string;
  ventaId: string;
  productoId?: string;
  articuloId: string;
  productoNombre?: string;
  articulo?: { nombre: string;[key: string]: any };
  cantidadUnidades: number;
  cantidadKilos?: number;
  precioUnitario?: number;
  subtotal?: number;
  inventarioId: string;
  metadata?: any;
}

export interface Venta {
  id: string;
  numeroFactura?: string;
  montoFactura?: number;
  montoTotal?: number;
  descuento: number;
  puntoVenta?: number;
  tipoComprobante?: string;
  estadoFiscal: EstadoFiscal;
  fiscalData?: any;
  recargo: number;
  clienteId: string;
  clienteNombre?: string;
  cliente?: { nombre: string;[key: string]: any };
  fecha: string;
  createdAt?: string;
  facturada?: boolean;
  cae?: string;
  items: VentaItem[];
  usuarioId: string;
  empresaId: string;
  metadata?: any;
}

export enum PedidoStatus {
  PENDIENTE = 'PENDIENTE',
  EN_CONTACTO = 'EN_CONTACTO',
  COTIZADO = 'COTIZADO',
  CONFIRMADO = 'CONFIRMADO',
  CANCELADO = 'CANCELADO'
}

export interface PedidoItem {
  id: string;
  pedidoId: string;
  articuloId?: string;
  articulo?: Articulo;
  nombreArticulo: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  metadata?: any;
}

export interface Pedido {
  id: string;
  nombre: string;
  razonSocial?: string;
  email?: string;
  telefono?: string;
  mensaje?: string;
  tag?: string;
  status: PedidoStatus;
  recordatorio?: string;
  fechaCreacion: string;
  
  subtotal?: number;
  impuestos?: number;
  total?: number;
  moneda?: string;
  notas?: any; // Añadido para el historial de notas JSON
  metadata?: any;

  empresaId: string;
  cuit?: string;
  clienteId?: string;
  cliente?: Cliente;
  items?: PedidoItem[]; // Añadido para los ítems de la cotización
}