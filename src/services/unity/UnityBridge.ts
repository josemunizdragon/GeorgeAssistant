import { GeorgeToUnityMessage, UnityToGeorgeMessage } from '../../types/georgeMessages';

type MessageCallback = (message: UnityToGeorgeMessage) => void;

/**
 * Bridge para comunicación entre React Native y Unity
 * 
 * Por ahora simula la comunicación. En producción se conectará
 * con el módulo nativo de Unity.
 */
export class UnityBridge {
  private messageCallbacks: Set<MessageCallback> = new Set();
  private isUnityReady: boolean = false;

  /**
   * Envía un mensaje a Unity
   * @param message Mensaje a enviar
   */
  send(message: GeorgeToUnityMessage): void {
    // Por ahora solo loguea el mensaje
    // En producción se enviará al módulo nativo de Unity
    console.log('[UnityBridge] Sending to Unity:', JSON.stringify(message));

    // Simulación: si es INIT_ASSISTANT, después de un delay emite ASSISTANT_READY
    if (message.type === 'INIT_ASSISTANT') {
      setTimeout(() => {
        this.isUnityReady = true;
        this.emitMessage({
          type: 'ASSISTANT_READY',
        });
      }, 500);
    }

    // Simulación: responde a SET_STATE con un log
    if (message.type === 'SET_STATE') {
      setTimeout(() => {
        this.emitMessage({
          type: 'UNITY_LOG',
          message: `Estado cambiado a: ${message.state}`,
        });
      }, 100);
    }

    // Simulación: responde a GEORGE_SPEAK_START
    if (message.type === 'GEORGE_SPEAK_START') {
      setTimeout(() => {
        this.emitMessage({
          type: 'UNITY_LOG',
          message: `George está hablando: "${message.text}"`,
        });
      }, 100);
    }

    // Simulación: responde a GEORGE_SPEAK_END
    if (message.type === 'GEORGE_SPEAK_END') {
      setTimeout(() => {
        this.emitMessage({
          type: 'UNITY_LOG',
          message: 'George terminó de hablar',
        });
      }, 100);
    }
  }

  /**
   * Suscribe un callback para recibir mensajes de Unity
   * @param callback Función que se ejecutará cuando llegue un mensaje
   * @returns Función para desuscribirse
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);

    // Retorna función de desuscripción
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  /**
   * Emite un mensaje a todos los callbacks suscritos
   */
  private emitMessage(message: UnityToGeorgeMessage): void {
    this.messageCallbacks.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        console.error('[UnityBridge] Error en callback:', error);
      }
    });
  }

  /**
   * Verifica si Unity está listo
   */
  isReady(): boolean {
    return this.isUnityReady;
  }
}

// Instancia singleton
export const unityBridge = new UnityBridge();

