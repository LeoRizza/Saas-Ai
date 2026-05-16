/**
 * Redondea un número a 2 decimales para evitar errores de punto flotante.
 * Ejemplo: 0.1 + 0.2 = 0.30000000000000004 → redondear() → 0.30
 */
export const redondear = (valor: number): number => {
  return Math.round(valor * 100) / 100;
};