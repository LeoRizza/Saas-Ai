import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';


const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET as string;

// ==========================================
// --- RATE LIMITING ---
// ==========================================

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 5 intentos máximo
  message: { message: 'Demasiados intentos de login. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ==========================================
// --- EMPRESAS CONTROLLERS ---
// ==========================================

/**
 * GET /api/empresas
 * Obtiene todas las empresas (solo SUPER_ADMIN)
 */
export const getEmpresas = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const empresas = await prisma.empresa.findMany();
    res.json(empresas);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/empresas
 * Crea una nueva empresa (solo SUPER_ADMIN)
 */
export const createEmpresa = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const { nombre, activa, logoUrl, emailContacto, telefonoContacto, smtpUser, smtpPass, apiKey, config } = req.body;

    // Manejar apiKey: si viene vacío o nulo, generar uno nuevo; si viene válido, usarlo
    const finalApiKey = apiKey && apiKey.trim() ? apiKey : randomUUID();

    const empresa = await prisma.empresa.create({
      data: { 
        nombre, 
        activa, 
        logoUrl,
        emailContacto,
        telefonoContacto,
        smtpUser,
        smtpPass,
        apiKey: finalApiKey,
        config
      }
    });

    res.json(empresa);
  } catch (error: any) {
    console.error('Error en controlador auth:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen datos vinculados (ventas, registros, etc.) que dependen de este elemento. Prueba desactivándolo en su lugar.' 
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

/**
 * PUT /api/empresas/:id
 * Actualiza una empresa existente (solo SUPER_ADMIN)
 */
export const updateEmpresa = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const { id } = req.params;
    const { nombre, activa, logoUrl, emailContacto, telefonoContacto, smtpUser, smtpPass, apiKey, config } = req.body;

    // Manejar apiKey: si viene vacío o nulo, generar uno nuevo; si viene válido, usarlo
    const dataToUpdate: any = {
      nombre,
      activa,
      logoUrl,
      emailContacto,
      telefonoContacto,
      smtpUser,
      smtpPass,
      config
    };

    // Solo actualizar apiKey si viene presente y no vacío
    if (apiKey && apiKey.trim()) {
      dataToUpdate.apiKey = apiKey;
    } else if (apiKey === '') {
      // Si viene explícitamente vacío, generar uno nuevo
      dataToUpdate.apiKey = randomUUID();
    }
    // Si no viene el campo, no lo incluimos para mantener el actual

    const empresa = await prisma.empresa.update({
      where: { id },
      data: dataToUpdate
    });

    res.json(empresa);
  } catch (error: any) {
    console.error('Error en controlador auth:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen datos vinculados (ventas, registros, etc.) que dependen de este elemento. Prueba desactivándolo en su lugar.' 
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/empresas/:id
 * Elimina una empresa (solo SUPER_ADMIN)
 */
export const deleteEmpresa = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const { id } = req.params;
    await prisma.empresa.delete({ where: { id } });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error en controlador auth:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen datos vinculados (ventas, registros, etc.) que dependen de este elemento. Prueba desactivándolo en su lugar.' 
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

// ==========================================
// --- USUARIOS CONTROLLERS ---
// ==========================================

/**
 * GET /api/usuarios
 * Obtiene todos los usuarios (solo SUPER_ADMIN)
 */
export const getUsuarios = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const usuarios = await prisma.usuario.findMany();
    res.json(usuarios);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/usuarios
 * Crea un nuevo usuario (solo SUPER_ADMIN)
 */
export const createUsuario = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const { nombre, email, password, rol, empresaId } = req.body;

    // Validar que el email no esté registrado
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email }
    });

    if (usuarioExistente) {
      return res.status(400).json({
        message: 'Este correo electrónico ya está registrado en el sistema.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        password: hashedPassword,
        rol,
        empresaId: empresaId || null
      }
    });

    res.json(usuario);
  } catch (error: any) {
    console.error('Error en controlador auth:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen datos vinculados (ventas, registros, etc.) que dependen de este elemento. Prueba desactivándolo en su lugar.' 
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

/**
 * PUT /api/usuarios/:id
 * Actualiza un usuario existente (solo SUPER_ADMIN)
 */
export const updateUsuario = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const { id } = req.params;
    const { nombre, email, password, rol, empresaId } = req.body;

    // Validar que el nuevo email no esté registrado por otro usuario
    if (email) {
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { email }
      });

      if (usuarioExistente && usuarioExistente.id !== id) {
        return res.status(400).json({
          message: 'Este correo electrónico ya está registrado en el sistema.'
        });
      }
    }

    const dataToUpdate: any = {
      nombre,
      email,
      rol,
      empresaId: empresaId || null
    };

    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: dataToUpdate
    });

    res.json(usuario);
  } catch (error: any) {
    console.error('Error en controlador auth:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen datos vinculados (ventas, registros, etc.) que dependen de este elemento. Prueba desactivándolo en su lugar.' 
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario (solo SUPER_ADMIN)
 */
export const deleteUsuario = async (req: any, res: any) => {
  try {
    if (req.user.rol !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Prohibido' });
    }

    const { id } = req.params;
    await prisma.usuario.delete({ where: { id } });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error en controlador auth:', error);
    if (error.code === 'P2003') {
      res.status(400).json({ 
        message: 'No se puede completar la acción: existen datos vinculados (ventas, registros, etc.) que dependen de este elemento. Prueba desactivándolo en su lugar.' 
      });
      return;
    }
    res.status(500).json({ message: error.message || 'Error interno del servidor' });
  }
};

// ==========================================
// --- LOGIN CONTROLLER ---
// ==========================================

/**
 * POST /api/auth/login
 * Autentica un usuario y retorna un JWT
 */
export const login = async (req: any, res: any) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email y contraseña son requeridos'
      });
    }

    const user = await prisma.usuario.findFirst({
      where: { email },
      include: { empresa: true }
    });

    if (!user) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
      });
    }

    // Verificar contraseña con bcrypt
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
      });
    }

    // Bloquear usuarios sin empresa asignada (excepto SUPER_ADMIN)
    if (user.rol !== 'SUPER_ADMIN' && !user.empresaId) {
      return res.status(403).json({
        message: 'Tu cuenta no tiene una empresa asignada. Contacta al administrador.',
        code: 'NO_EMPRESA_ASIGNADA'
      });
    }

    // Verificar que la empresa esté activa (si tiene empresa)
    if (user.empresa && !user.empresa.activa) {
      return res.status(403).json({
        message: 'La empresa asociada a tu cuenta está desactivada. Contacta al administrador.',
        code: 'EMPRESA_INACTIVA'
      });
    }

    // Generar JWT
    const token = jwt.sign(
      {
        id: user.id,
        nombre: user.nombre,
        rol: user.rol,
        empresaId: user.empresaId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // No enviar la contraseña al frontend
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: userWithoutPassword,
      empresa: user.empresa
    });
  } catch (error: any) {
    console.error('❌ Error en login:', error);
    res.status(500).json({
      message: 'Error interno del servidor'
    });
  }
};
