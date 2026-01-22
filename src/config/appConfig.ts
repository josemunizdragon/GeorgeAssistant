/**
 * Configuración de la aplicación
 */

export const appConfig = {
  assistant: {
    name: 'George',
    language: 'es-MX',
  },
  backend: {
    baseUrl: 'http://localhost:8787',
  },
  unity: {
    // Configuración futura para Unity
    enabled: true,
  },
} as const;

