import { appConfig } from '../../config/appConfig';

/**
 * Cliente para comunicación con el backend
 * Por ahora solo contiene métodos mock
 */
export class BackendClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = appConfig.backend.baseUrl;
  }

  /**
   * Obtiene un token de sesión (mock)
   * @returns Promise con un token simulado
   */
  async getSessionToken(): Promise<string> {
    // Mock: retorna un token simulado
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('mock-session-token-' + Date.now());
      }, 100);
    });
  }

  /**
   * Método helper para construir URLs del backend
   */
  getUrl(endpoint: string): string {
    return `${this.baseUrl}${endpoint}`;
  }
}

// Instancia singleton
export const backendClient = new BackendClient();

