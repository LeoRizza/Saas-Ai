import axios, { AxiosError } from 'axios';

/**
 * Cliente Axios dedicado al microservicio de facturación (El Búnker)
 * Configurado con timeout crítico de 8 segundos y manejo de errores de timeout
 */
const bunkerClient = axios.create({
    timeout: 8000, // 8 segundos máximo (CRÍTICO)
});

/**
 * Interceptor de respuesta para capturar y manejar errores de timeout
 */
bunkerClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        // Verificar si es un error de timeout
        if (
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT'
        ) {
            const timeoutError = new Error(
                'El servicio de AFIP tardó demasiado en responder. La factura quedará en estado pendiente.'
            );
            timeoutError.name = 'TimeoutError';
            return Promise.reject(timeoutError);
        }

        // Re-lanzar otros errores sin modificar
        return Promise.reject(error);
    }
);

export default bunkerClient;