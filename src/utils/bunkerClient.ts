import axios, { AxiosError, AxiosResponse } from 'axios';

/**
 * Cliente Axios aislado para comunicación con El Búnker (ARCA/AFIP)
 * Preconfigurado con baseURL desde variables de entorno y timeout de 10 segundos
 */
const bunkerApi = axios.create({
    baseURL: process.env.BUNKER_API_URL || '',
    timeout: 10000, // 10 segundos
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
        const response: AxiosResponse = await bunkerApi.post(
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
            const axiosError = error as AxiosError;
            throw new Error(
                `Error al emitir factura en El Búnker: ${axiosError.message}. Status: ${axiosError.response?.status || 'desconocido'}`
            );
        }
        throw error;
    }
}