import axios from 'axios';

/**
 * Cliente Axios aislado para comunicación con El Búnker (ARCA/AFIP)
 * Preconfigurado con baseURL desde variables de entorno y timeout de 15 segundos
 */
const bunkerApi = axios.create({
    baseURL: import.meta.env.VITE_BUNKER_API_URL || '',
    timeout: 15000, // 15 segundos
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Emite una factura a través del microservicio El Búnker
 * @param ventaPayload - Datos de la venta/factura a procesar
 * @param apiKey - Clave de API para autenticación Bearer
 * @returns Datos de la respuesta del servicio
 * @throws Error estructurado si la solicitud falla
 */
export async function emitirFacturaBunker(
    ventaPayload: any,
    apiKey: string
): Promise<any> {
        try {
        const response = await bunkerApi.post(
            '/api/v1/facturar',
            ventaPayload,
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(
                error.response?.data?.message || 'Error de conexión con El Búnker'
            );
        }
        throw error;
    }
}