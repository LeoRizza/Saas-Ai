import { Response } from 'express';

/**
 * Clase de error controlado para errores operacionales
 * que pueden mostrarse al usuario de forma segura.
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Manejador centralizado de errores para las respuestas HTTP.
 * Registra el error internamente y devuelve una respuesta apropiada.
 */
export const handleError = (res: Response, error: unknown): Response => {
  // Log interno completo para debugging
  console.error('❌ Error interno:', {
    mensaje: error instanceof Error ? error.message : 'Error desconocido',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });

  // Si es un error controlado (AppError), devolver su mensaje
  if (error instanceof AppError && error.isOperational) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  // Para errores no controlados, devolver mensaje genérico
  return res.status(500).json({ message: 'Error interno del servidor' });
};
