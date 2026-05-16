import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import timeout from 'connect-timeout';

// Utilidades y middlewares extraídos
import { authenticate, authorize, verifyApiKey, checkModule } from './src/middleware/auth';
import { getVentas, createVenta } from './src/controllers/sales.controller';


// Controladores
import { getClientes, createCliente, updateCliente, deleteCliente, bulkImportClientes } from './src/controllers/clients.controller';
import { getInventory, createArticulo, updateArticulo, deleteArticulo, bulkImportArticulos, transferirStock, exportInventoryCSV } from './src/controllers/inventory.controller';
import { getInventarios, createInventario, updateInventario, deleteInventario } from './src/controllers/warehouse.controller';
import { getStats, getAuditLogs } from './src/controllers/stats.controller';
import { getPublicInventory, catalogoLimiter } from './src/controllers/public.controller';
import { getProduccion, createProduccion } from './src/controllers/production.controller';
import { getEmpresas, createEmpresa, updateEmpresa, deleteEmpresa, getUsuarios, createUsuario, updateUsuario, deleteUsuario, login, loginLimiter } from './src/controllers/auth.controller';
import { sendQuoteEmail, sendTicket } from './src/controllers/mailer.controller';
import { createExternalPedido, externalApiLimiter } from './src/controllers/integrations.controller';
import { getPedidos, createPedido, updatePedidoStatus, updatePedido } from './src/controllers/pedidos.controller';

// ==========================================
// --- VALIDACIÓN DE VARIABLES DE ENTORNO CRÍTICAS ---
// ==========================================
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: La variable de entorno JWT_SECRET no está definida.');
  console.error('   Por favor, configúrala antes de iniciar el servidor.');
}

const PORT = process.env.PORT || 3000;

// ==========================================
// --- CONFIGURACIÓN DE CORS (LISTA BLANCA) ---
// ==========================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://lightgreen-badger-438485.hostingersite.com',
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin origin (apps móviles, Postman, etc. en desarrollo)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS bloqueado para origen: ${origin}`);
      callback(new Error('No autorizado por CORS'));
    }
  },
  credentials: true
};

// ==========================================
// --- MIDDLEWARE DE TIMEOUT ---
// ==========================================
// Función para detener la respuesta si la conexión se cortó por timeout
function haltOnTimedout(req: any, res: any, next: any) {
  if (!req.timedout) next();
}

const app = express();
const prisma = new PrismaClient();

// ==========================================
// --- CREACIÓN DE CARPETA UPLOADS ---
// ==========================================
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Carpeta de uploads creada:', uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.webp';
    const prefix = (ext.toLowerCase() === '.csv') ? 'file' : 'img';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(compression());
app.use(cors(corsOptions));
app.use(timeout('15s'));
app.use(express.json());
app.use(haltOnTimedout);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ==========================================
// --- ENDPOINTS DE SUPER ADMIN (EMPRESAS Y USUARIOS) ---
// ==========================================

// Empresas
app.get('/api/empresas', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), getEmpresas);
app.post('/api/empresas', authenticate, authorize(['SUPER_ADMIN']), createEmpresa);
app.put('/api/empresas/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), updateEmpresa);
app.delete('/api/empresas/:id', authenticate, authorize(['SUPER_ADMIN']), deleteEmpresa);

// Usuarios
app.get('/api/usuarios', authenticate, authorize(['SUPER_ADMIN']), getUsuarios);
app.post('/api/usuarios', authenticate, authorize(['SUPER_ADMIN']), createUsuario);
app.put('/api/usuarios/:id', authenticate, authorize(['SUPER_ADMIN']), updateUsuario);
app.delete('/api/usuarios/:id', authenticate, authorize(['SUPER_ADMIN']), deleteUsuario);

// --- INVENTARIOS CRUD ---

app.get('/api/inventory', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA', 'OPERARIO']), checkModule('INVENTARIO'), getInventory);
app.get('/api/inventory/export', authenticate, authorize(['ADMIN']), checkModule('INVENTARIO'), exportInventoryCSV);
app.post('/api/inventory', authenticate, authorize(['ADMIN']), checkModule('INVENTARIO'), upload.array('imagenes', 50), createArticulo);
app.put('/api/inventory/:id', authenticate, authorize(['ADMIN']), checkModule('INVENTARIO'), upload.array('imagenes', 50), updateArticulo);
app.delete('/api/inventory/:id', authenticate, authorize(['ADMIN']), checkModule('INVENTARIO'), deleteArticulo);
app.post('/api/inventory/bulk', authenticate, authorize(['ADMIN']), checkModule('INVENTARIO'), upload.single('file'), bulkImportArticulos);
app.post('/api/inventory/transfer', authenticate, authorize(['ADMIN']), checkModule('INVENTARIO'), transferirStock);

// --- GESTIÓN DE DEPÓSITOS (Warehouses) ---
app.get('/api/inventarios', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA', 'OPERARIO']), getInventarios);
app.post('/api/inventarios', authenticate, authorize(['ADMIN']), createInventario);
app.put('/api/inventarios/:id', authenticate, authorize(['ADMIN']), updateInventario);
app.delete('/api/inventarios/:id', authenticate, authorize(['ADMIN']), deleteInventario);

// --- VENTAS CRUD ---
app.get('/api/ventas', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA']), checkModule('VENTAS'), getVentas);
app.post('/api/ventas', authenticate, authorize(['ADMIN', 'CAJA']), checkModule('VENTAS'), createVenta);
app.post('/api/ventas/:id/ticket', authenticate, authorize(['ADMIN', 'CAJA']), checkModule('VENTAS'), sendTicket);

// --- Clientes CRUD ---
app.get('/api/clientes', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA']), getClientes);
app.post('/api/clientes', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA']), createCliente);
app.put('/api/clientes/:id', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA']), updateCliente);
app.delete('/api/clientes/:id', authenticate, authorize(['ADMIN']), deleteCliente);
app.post('/api/clientes/bulk', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA']), upload.single('file'), bulkImportClientes);

// --- Producción CRUD ---
// GET /api/produccion
app.get('/api/produccion', authenticate, authorize(['ADMIN', 'OPERARIO']), checkModule('PRODUCCION'), getProduccion);
app.post('/api/produccion', authenticate, authorize(['ADMIN', 'OPERARIO']), checkModule('PRODUCCION'), createProduccion);

// --- Pedidos CRUD ---
app.get('/api/pedidos', authenticate, authorize(['ADMIN', 'VENDEDOR']), getPedidos);
app.post('/api/pedidos', authenticate, authorize(['ADMIN', 'VENDEDOR']), createPedido);
app.patch('/api/pedidos/:id/status', authenticate, authorize(['ADMIN', 'VENDEDOR']), updatePedidoStatus);
app.patch('/api/pedidos/:id', authenticate, authorize(['ADMIN', 'VENDEDOR']), updatePedido);

// --- MAILER (Envíos de Correo) ---
app.post('/api/mailer/quote', authenticate, authorize(['ADMIN', 'VENDEDOR', 'CAJA']), sendQuoteEmail);

// GET /api/audit
app.get('/api/audit', authenticate, authorize(['ADMIN']), getAuditLogs);

// ==========================================
// --- ENDPOINT DE ESTADÍSTICAS Y GANANCIAS ---
// ==========================================

app.get('/api/stats', authenticate, authorize(['ADMIN']), getStats);

// ==========================================
// --- ENDPOINTS PARA INTEGRACIONES (WEBHOOKS) ---
// ==========================================
app.post('/api/integrations/pedidos', externalApiLimiter, verifyApiKey, createExternalPedido);
app.post('/api/webhooks/bunker', express.json(), handleBunkerWebhook);


// ==========================================
// --- ENDPOINTS PÚBLICOS (CATÁLOGO WEB) ---
// ==========================================

// GET /api/public/inventory/:empresaId
app.get('/api/public/inventory/:empresaId', catalogoLimiter, getPublicInventory);

// --- AUTH Y ADMIN ---
app.post('/api/auth/login', loginLimiter, login);

// ==========================================
// --- WEBHOOK DE EL BÚNKER (Fiscalización) ---
// ==========================================

async function handleBunkerWebhook(req: express.Request, res: express.Response) {
  const secret = req.headers['x-bunker-secret'];
  if (secret !== process.env.BUNKER_SECRET) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const { ventaId, estadoFiscal, cae, fiscalData } = req.body;

  try {
    // Paso 1: Buscar la venta original
    const ventaOriginal = await prisma.venta.findUnique({
      where: { id: ventaId },
    });

    // Si no existe la venta, devolver 404
    if (!ventaOriginal) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    // Paso 2: Mantener el update actual
    await prisma.venta.update({
      where: { id: ventaId },
      data: {
        estadoFiscal,
        cae,
        fiscalData,
        facturada: estadoFiscal === 'APROBADO',
      },
    });

    // Paso 3: Crear auditLog en Fire & Forget mode
    const motivo = `Estado fiscal AFIP actualizado a: ${estadoFiscal}${cae ? ` (CAE: ${cae})` : ''}`;
    prisma.auditLog.create({
      data: {
        accion: 'VENTA',
        tablaAfectada: 'VENTA',
        registroId: ventaId,
        motivo,
        usuarioId: ventaOriginal.usuarioId,
        empresaId: ventaOriginal.empresaId,
      },
    }).catch((error) => {
      console.error('⚠️  Error registrando auditLog para cambio de estado fiscal:', error);
    });

    res.json({ message: 'Venta actualizada por El Búnker' });
  } catch (error) {
    console.error('❌ Error en handleBunkerWebhook:', error);
    res.status(500).json({ error: 'Error actualizando venta' });
  }
}

// Middleware de error global para timeout
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.code === 'ETIMEDOUT' || req.timedout) {
    return res.status(408).json({
      error: 'La solicitud tardó demasiado',
      message: 'El servidor no pudo procesar la solicitud en el tiempo esperado (15s)',
    });
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Cacheamos los assets estáticos por 30 días para ahorrar ancho de banda
    app.use(express.static(distPath, { maxAge: '30d' }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();