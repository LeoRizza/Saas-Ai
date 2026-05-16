import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extender el tipo Request para incluir el usuario decodificado
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    nombre: string;
    rol: string;
    empresaId: string;
  };
}

/**
 * Middleware de autenticación JWT.
 * Verifica el token en el header Authorization y adjunta el usuario al request.
 */
export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Token format invalid' });
    return;
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error('❌ JWT_SECRET no está definido en el middleware de autenticación');
      res.status(500).json({ message: 'Error de configuración del servidor' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedRequest['user'];
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

/**
 * Middleware de verificación de API Key.
 * Verifica la API Key en el header x-api-key y valida que corresponda a una empresa existente.
 */
export const verifyApiKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ message: 'API Key requerida' });
    return;
  }

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { apiKey },
    });

    if (!empresa || !apiKey) {
      res.status(401).json({ message: 'API Key inválida' });
      return;
    }

    req.user = { empresaId: empresa.id } as any;
    next();
  } catch (error) {
    console.error('Error en verifyApiKey:', error);
    res.status(500).json({ message: 'Error al verificar API Key' });
  }
};

/**
 * Middleware de Autorización por Roles.
 * Debe ir SIEMPRE después del middleware 'authenticate'.
 */
export const authorize = (rolesPermitidos: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.rol) {
      res.status(403).json({ message: 'Acceso denegado: Usuario sin rol definido.' });
      return;
    }

    // El SUPER_ADMIN tiene acceso total por defecto (opcional, pero útil)
    if (req.user.rol === 'SUPER_ADMIN') {
      return next();
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      res.status(403).json({ message: 'Acceso denegado: No tienes permisos para esta acción.' });
      return;
    }

    next();
  };
};

/**
 * Middleware de Feature Flags (Módulos Dinámicos por Empresa).
 * Verifica la configuración de módulos de la empresa en la base de datos.
 * Permite que SUPER_ADMIN tenga acceso total.
 */
export const checkModule = (moduleName: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // El SUPER_ADMIN no tiene empresaId, o tiene acceso total.
      if (req.user?.rol === 'SUPER_ADMIN') {
        return next();
      }

      if (!req.user?.empresaId) {
        res.status(403).json({ message: 'Usuario sin empresa asignada.' });
        return;
      }

      const empresa = await prisma.empresa.findUnique({
        where: { id: req.user.empresaId },
        select: { config: true },
      });

      // Casteamos el Json a un objeto manejable
      const config = empresa?.config as { modules?: string[] } | null;

      if (!config?.modules || !config.modules.includes(moduleName)) {
        res.status(403).json({
          message: `Tu plan actual no incluye el módulo: ${moduleName}. Contacta a soporte para mejorar tu plan.`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error(`Error al verificar módulo "${moduleName}":`, error);
      res.status(500).json({ message: 'Error al verificar módulos de la empresa.' });
    }
  };
};
