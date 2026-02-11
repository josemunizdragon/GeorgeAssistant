import type { SessionUser } from '../../contexts/SessionContext';

export type AuthLoginResult = {
  token: string;
  user: SessionUser;
};

/**
 * Servicio de autenticación. authLogin es stub; conectar con backend cuando exista.
 */
export class AuthService {
  /**
   * Login con email y contraseña. Stub: devuelve token y user simulados.
   */
  async authLogin(email: string, password: string): Promise<AuthLoginResult> {
    if (!email?.trim()) {
      throw new Error('El email es obligatorio');
    }
    if (!password?.trim()) {
      throw new Error('La contraseña es obligatoria');
    }
    // Stub: simular latencia y respuesta
    await new Promise((r) => setTimeout(r, 400));
    const token = 'auth-token-' + Date.now();
    const user: SessionUser = {
      id: 'user-' + Date.now(),
      email: email.trim(),
      role: 'user',
    };
    return { token, user };
  }
}

export const authService = new AuthService();
