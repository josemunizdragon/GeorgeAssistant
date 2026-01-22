import { AssistantState } from '../../types/georgeMessages';
import Tts from 'react-native-tts';
import Voice from '@react-native-voice/voice';

type VoiceResponseCallback = (text: string) => void;
type StateChangeCallback = (state: AssistantState) => void;
type WakeWordCallback = () => void;

/**
 * Servicio de voz con TTS y Speech Recognition
 * 
 * Usa react-native-tts para que George hable
 * y @react-native-voice/voice para escuchar al usuario.
 */
export class VoiceService {
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  private wakeWordCallbacks: Set<WakeWordCallback> = new Set();
  private isListening: boolean = false;
  private recognizedText: string = '';
  private isContinuousListening: boolean = false;
  private wakeWordDetected: boolean = false;

  constructor() {
    this.initializeTTS();
    this.initializeVoice();
  }

  /**
   * Inicializa Text-to-Speech
   */
  private async initializeTTS(): Promise<void> {
    try {
      await Tts.setDefaultLanguage('es-MX');
      
      // Configuración para voz más natural (menos robotizada)
      await Tts.setDefaultRate(0.48); // Velocidad ligeramente más lenta para sonar más natural
      await Tts.setDefaultPitch(0.95); // Tono ligeramente más bajo para voz masculina
      
      // Obtener todas las voces disponibles
      try {
        const voices = await Tts.voices();
        console.log('[VoiceService] Voces disponibles:', voices.length);
        
        // Buscar voces masculinas en español (múltiples criterios)
        const maleVoices = voices.filter((voice: any) => {
          const name = voice.name?.toLowerCase() || '';
          const id = voice.id?.toLowerCase() || '';
          const language = voice.language?.toLowerCase() || '';
          
          return language.startsWith('es') && (
            name.includes('masculino') || 
            name.includes('male') ||
            name.includes('hombre') ||
            name.includes('mexico') ||
            name.includes('mexican') ||
            id.includes('male') ||
            id.includes('masculino') ||
            voice.gender === 'male' ||
            // Algunas voces específicas conocidas
            name.includes('juan') ||
            name.includes('carlos') ||
            name.includes('diego') ||
            name.includes('luis')
          );
        });
        
        if (maleVoices.length > 0) {
          // Priorizar voces mexicanas o de mejor calidad
          const preferredVoice = maleVoices.find((v: any) => 
            v.name?.toLowerCase().includes('mexico') || 
            v.name?.toLowerCase().includes('mexican')
          ) || maleVoices[0];
          
          await Tts.setDefaultVoice(preferredVoice.id);
          console.log('[VoiceService] Voz masculina configurada:', preferredVoice.name, preferredVoice.id);
        } else {
          // Si no hay voces masculinas, buscar cualquier voz en español mexicano
          const mexicanVoices = voices.filter((voice: any) => 
            voice.language?.toLowerCase().includes('es-mx') || 
            voice.language?.toLowerCase().includes('es_mx')
          );
          
          if (mexicanVoices.length > 0) {
            await Tts.setDefaultVoice(mexicanVoices[0].id);
            console.log('[VoiceService] Voz mexicana configurada:', mexicanVoices[0].name);
          } else {
            console.log('[VoiceService] Usando voz por defecto del sistema');
          }
        }
      } catch (voiceError) {
        console.warn('[VoiceService] Error al configurar voz personalizada:', voiceError);
      }
      
      // Eventos globales de TTS (solo para logging)
      // Estos se mantienen durante toda la vida de la app
      try {
        const startSubscription = Tts.addEventListener('tts-start', () => {
          console.log('[VoiceService] TTS empezó a hablar');
        });
        // Guardamos la suscripción para poder removerla si es necesario
        // Por ahora la dejamos activa durante toda la vida de la app
      } catch (e) {
        // Ignorar si hay error
        console.warn('[VoiceService] Error al agregar listener de tts-start:', e);
      }
    } catch (error) {
      console.error('[VoiceService] Error inicializando TTS:', error);
    }
  }

  /**
   * Inicializa Speech Recognition
   */
  private initializeVoice(): void {
    Voice.onSpeechStart = () => {
      console.log('[VoiceService] Reconocimiento de voz iniciado');
      this.isListening = true;
      // Solo cambiar estado si NO está en modo continuo (para no mostrar "listening" constantemente)
      if (!this.isContinuousListening) {
        this.notifyStateChange('listening');
      }
    };

    Voice.onSpeechRecognized = () => {
      console.log('[VoiceService] Voz reconocida');
    };

    Voice.onSpeechEnd = () => {
      console.log('[VoiceService] Reconocimiento de voz terminado');
      this.isListening = false;
      
      // Si está en modo continuo y no se detectó el wake word, reiniciar
      if (this.isContinuousListening && !this.wakeWordDetected) {
        console.log('[VoiceService] Reiniciando reconocimiento continuo...');
        setTimeout(() => {
          this.startContinuousListening().catch((error) => {
            console.error('[VoiceService] Error al reiniciar reconocimiento continuo:', error);
          });
        }, 500);
      }
    };

    Voice.onSpeechError = (e: any) => {
      const errorCode = e?.error?.code || e?.code || 'unknown';
      const errorMessage = e?.error?.message || e?.message || JSON.stringify(e);
      console.error('[VoiceService] Error en reconocimiento de voz:', {
        code: errorCode,
        message: errorMessage,
        fullError: e,
      });
      this.isListening = false;
      
      // Algunos errores son normales y no debemos reiniciar (como cuando el usuario cancela)
      const ignorableErrors = ['7', '9']; // 7 = recognition not available, 9 = recognition cancelled
      
      // Si está en modo continuo y no se detectó el wake word, reiniciar después de un error
      if (this.isContinuousListening && !this.wakeWordDetected && !ignorableErrors.includes(String(errorCode))) {
        console.log('[VoiceService] Reiniciando reconocimiento continuo después de error...');
        setTimeout(() => {
          this.startContinuousListening().catch((error) => {
            console.error('[VoiceService] Error al reiniciar reconocimiento continuo:', error);
          });
        }, 2000); // Esperar más tiempo después de un error
      } else if (!this.isContinuousListening) {
        this.notifyStateChange('idle');
      }
    };

    Voice.onSpeechResults = (e) => {
      if (e.value && e.value.length > 0) {
        const text = e.value[0];
        this.recognizedText = text;
        const lowerText = text.toLowerCase();
        console.log('[VoiceService] Texto reconocido:', text);
        
        // Detectar "hey geo" en resultados finales también (más variaciones)
        if (this.isContinuousListening && !this.wakeWordDetected) {
          const wakeWords = ['hey geo', 'hey jorge', 'hey george', 'ey geo', 'george', 'jorge'];
          const found = wakeWords.some(word => lowerText.includes(word));
          
          if (found) {
            console.log('[VoiceService] ¡Wake word detectado en resultado final!');
            this.wakeWordDetected = true;
            this.notifyWakeWord();
          }
        }
      }
    };

    Voice.onSpeechPartialResults = (e) => {
      if (e.value && e.value.length > 0) {
        const partialText = e.value[0].toLowerCase();
        console.log('[VoiceService] Resultado parcial:', partialText);
        
        // Detectar "hey geo" en resultados parciales (más variaciones)
        if (this.isContinuousListening && !this.wakeWordDetected) {
          const wakeWords = ['hey geo', 'hey jorge', 'hey george', 'ey geo', 'george', 'jorge'];
          const found = wakeWords.some(word => partialText.includes(word));
          
          if (found) {
            console.log('[VoiceService] ¡Wake word detectado en resultado parcial!');
            this.wakeWordDetected = true;
            this.notifyWakeWord();
          }
        }
      }
    };
  }

  /**
   * Verifica y solicita permisos antes de iniciar el reconocimiento
   */
  private async checkPermissions(): Promise<boolean> {
    try {
      const isAvailable = await Voice.isAvailable();
      console.log('[VoiceService] Reconocimiento de voz disponible:', isAvailable);
      
      if (!isAvailable) {
        console.warn('[VoiceService] El reconocimiento de voz no está disponible');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[VoiceService] Error al verificar disponibilidad:', error);
      return false;
    }
  }

  /**
   * Inicia el reconocimiento de voz continuo (para detectar wake word)
   */
  async startContinuousListening(): Promise<void> {
    try {
      // Si ya está escuchando, no hacer nada
      if (this.isListening) {
        console.log('[VoiceService] Ya está escuchando, omitiendo inicio');
        return;
      }
      
      // Verificar permisos primero
      const hasPermissions = await this.checkPermissions();
      if (!hasPermissions) {
        console.warn('[VoiceService] No se pueden obtener permisos, reintentando...');
        setTimeout(() => {
          if (this.isContinuousListening) {
            this.startContinuousListening().catch((e) => {
              console.error('[VoiceService] Error en reintento de permisos:', e);
            });
          }
        }, 2000);
        return;
      }
      
      this.isContinuousListening = true;
      this.wakeWordDetected = false;
      this.recognizedText = '';
      
      // Intentar cancelar cualquier reconocimiento previo
      try {
        await Voice.cancel();
      } catch (e) {
        // Ignorar errores al cancelar
      }
      
      // Pequeña pausa antes de iniciar
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await Voice.start('es-MX');
      console.log('[VoiceService] Reconocimiento continuo iniciado (escuchando "hey geo")');
    } catch (error: any) {
      console.error('[VoiceService] Error al iniciar reconocimiento continuo:', {
        error,
        message: error?.message,
        code: error?.code,
      });
      
      // No desactivar el modo continuo, solo reintentar
      // Reintentar después de un segundo
      setTimeout(() => {
        if (this.isContinuousListening && !this.wakeWordDetected) {
          this.startContinuousListening().catch((e) => {
            console.error('[VoiceService] Error en reintento:', e);
          });
        }
      }, 2000);
    }
  }

  /**
   * Inicia el reconocimiento de voz (modo normal)
   */
  async startListening(): Promise<void> {
    try {
      // Verificar permisos primero
      const hasPermissions = await this.checkPermissions();
      if (!hasPermissions) {
        throw new Error('No se pueden obtener permisos de reconocimiento de voz');
      }
      
      this.recognizedText = '';
      this.wakeWordDetected = false;
      
      // Intentar cancelar cualquier reconocimiento previo
      try {
        await Voice.cancel();
      } catch (e) {
        // Ignorar errores al cancelar
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      await Voice.start('es-MX');
      this.notifyStateChange('listening');
    } catch (error: any) {
      console.error('[VoiceService] Error al iniciar reconocimiento:', {
        error,
        message: error?.message,
        code: error?.code,
      });
      throw error;
    }
  }

  /**
   * Detiene el reconocimiento de voz
   */
  async stopListening(): Promise<string> {
    try {
      await Voice.stop();
      this.isListening = false;
      this.isContinuousListening = false;
      const text = this.recognizedText;
      this.recognizedText = '';
      return text;
    } catch (error) {
      console.error('[VoiceService] Error al detener reconocimiento:', error);
      this.isContinuousListening = false;
      return '';
    }
  }

  /**
   * Cancela el reconocimiento de voz
   */
  async cancelListening(): Promise<void> {
    try {
      await Voice.cancel();
      this.isListening = false;
      this.isContinuousListening = false;
      this.wakeWordDetected = false;
      this.notifyStateChange('idle');
    } catch (error) {
      console.error('[VoiceService] Error al cancelar reconocimiento:', error);
    }
  }

  /**
   * Hace que George hable usando TTS
   * Retorna una Promise que se resuelve cuando termina de hablar
   */
  async speak(text: string): Promise<void> {
    // Mejorar el texto para que suene más natural
    const improvedText = this.improveTextNaturalness(text);
    console.log('[VoiceService] George va a decir:', improvedText);
    
    // Configurar parámetros específicos para esta frase (más naturales)
    await Tts.setDefaultRate(0.48); // Velocidad natural
    await Tts.setDefaultPitch(0.95); // Tono ligeramente más bajo
    
    return new Promise((resolve, reject) => {
      let isResolved = false;
      let finishSubscription: any = null;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        // No removemos el listener para evitar errores
        // El handler verifica internamente si ya se resolvió antes de ejecutar
        // Esto es seguro porque el handler tiene la verificación isResolved
        finishSubscription = null;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const resolveOnce = () => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve();
        }
      };

      try {
        
        // Handler para cuando termine de hablar
        const finishHandler = () => {
          if (!isResolved) {
            console.log('[VoiceService] TTS terminó de hablar');
            resolveOnce();
          }
        };
        
        // Timeout de seguridad (máximo 30 segundos)
        // Con velocidad más lenta, necesitamos más tiempo
        const estimatedTime = Math.max(improvedText.length * 200, 3000); // ~200ms por carácter con velocidad más lenta
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            console.warn('[VoiceService] Timeout esperando TTS, forzando resolución');
            resolveOnce();
          }
        }, Math.min(estimatedTime, 30000));
        
        // Agregar el listener de finish
        Tts.addEventListener('tts-finish', finishHandler);
        finishSubscription = finishHandler;
        
        // Iniciar el habla con el texto mejorado
        try {
          Tts.speak(improvedText);
        } catch (error: any) {
          cleanup();
          reject(error);
        }
      } catch (error: any) {
        console.error('[VoiceService] Error al hablar:', error);
        cleanup();
        reject(error);
      }
    });
  }

  /**
   * Detiene el habla de George
   */
  async stopSpeaking(): Promise<void> {
    try {
      await Tts.stop();
    } catch (error) {
      console.error('[VoiceService] Error al detener habla:', error);
    }
  }

  /**
   * Proceso completo de conversación: escuchar, pensar y responder
   */
  async simulateConversation(
    onResponse: VoiceResponseCallback,
    onStateChange?: (state: AssistantState) => void
  ): Promise<void> {
    try {
      // Estado: listening - Escuchar al usuario
      onStateChange?.('listening');
      this.notifyStateChange('listening');
      
      await this.startListening();
      
      // Escuchar por máximo 5 segundos
      await this.delay(5000);
      
      // Detener escucha y obtener texto
      const userText = await this.stopListening();
      console.log('[VoiceService] Usuario dijo:', userText || '(sin texto reconocido)');

      // Estado: thinking
      onStateChange?.('thinking');
      this.notifyStateChange('thinking');

      // Simula pensar por 1.5 segundos
      await this.delay(1500);

      // Generar respuesta (por ahora mock, luego será con API)
      const responseText = userText 
        ? this.generateResponse(userText)
        : this.addClosingPhrase('No pude escuchar bien. ¿Podrías repetir tu pregunta?');

      // Estado: speaking
      onStateChange?.('speaking');
      this.notifyStateChange('speaking');

      // Hacer que George hable (espera hasta que termine)
      await this.speak(responseText);
      
      // Notificar la respuesta después de que termine de hablar
      onResponse(responseText);

      // Estado: idle
      onStateChange?.('idle');
      this.notifyStateChange('idle');
    } catch (error) {
      console.error('[VoiceService] Error en conversación:', error);
      await this.cancelListening();
      await this.stopSpeaking();
      onStateChange?.('idle');
      this.notifyStateChange('idle');
      throw error;
    }
  }

  /**
   * Mejora el texto para que suene más natural (agrega pausas estratégicas)
   */
  private improveTextNaturalness(text: string): string {
    // Agregar pausas estratégicas para mejor prosodia
    let improved = text
      // Pausas después de comas (ya están, pero asegurarse)
      .replace(/,/g, ', ')
      // Pausas más largas después de puntos
      .replace(/\./g, '. ')
      // Pausas después de dos puntos
      .replace(/:/g, ': ')
      // Pausas antes de preguntas
      .replace(/\?/g, '? ')
      // Pausas antes de exclamaciones
      .replace(/!/g, '! ')
      // Pausa antes de "y" cuando conecta ideas largas
      .replace(/ y /g, ' y ')
      // Pausa antes de "o" cuando es una opción
      .replace(/ o /g, ' o ')
      // Pausa después de enumeraciones
      .replace(/(\d+\.)/g, '$1 ')
      // Limpiar espacios múltiples
      .replace(/\s+/g, ' ')
      .trim();
    
    return improved;
  }

  /**
   * Mejora el texto para que suene más natural (sin frase final)
   */
  addClosingPhrase(response: string): string {
    const improvedResponse = this.improveTextNaturalness(response);
    return improvedResponse;
  }

  /**
   * Genera una respuesta basada en el texto del usuario
   */
  generateResponse(userText: string): string {
    const lowerText = userText.toLowerCase();
    
    // Respuesta predeterminada para todas las preguntas
    const defaultResponse = 'Soy tu asistente virtual experto en aires acondicionados.';
    
    // Respuestas específicas solo para saludos y despedidas
    if (lowerText.includes('hola') || lowerText.includes('buenos días') || lowerText.includes('buenas tardes')) {
      return this.addClosingPhrase('¡Hola! Soy tu asistente virtual experto en aires acondicionados.');
    }
    
    if (lowerText.includes('adiós') || lowerText.includes('hasta luego') || lowerText.includes('nos vemos')) {
      return this.addClosingPhrase('¡Hasta luego!');
    }
    
    if (lowerText.includes('gracias')) {
      return this.addClosingPhrase('De nada.');
    }
    
    // Para todas las demás preguntas, usar la respuesta predeterminada
    return this.addClosingPhrase(defaultResponse);
  }

  /**
   * Suscribe un callback para cambios de estado
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Suscribe un callback para cuando se detecta el wake word "hey geo"
   */
  onWakeWord(callback: WakeWordCallback): () => void {
    this.wakeWordCallbacks.add(callback);
    return () => {
      this.wakeWordCallbacks.delete(callback);
    };
  }

  /**
   * Notifica cuando se detecta el wake word
   */
  private notifyWakeWord(): void {
    this.wakeWordCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[VoiceService] Error en callback de wake word:', error);
      }
    });
  }

  /**
   * Resetea el estado del wake word (para volver a escuchar)
   */
  resetWakeWord(): void {
    this.wakeWordDetected = false;
  }

  /**
   * Notifica cambios de estado a todos los suscriptores
   */
  private notifyStateChange(state: AssistantState): void {
    this.stateChangeCallbacks.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.error('[VoiceService] Error en callback de estado:', error);
      }
    });
  }

  /**
   * Obtiene una respuesta mock de George (fallback)
   */
  private getMockResponse(): string {
    const responses = [
      'Hola, soy George. ¿En qué puedo ayudarte?',
      'Entiendo tu pregunta. Déjame pensar...',
      'Basándome en lo que me has dicho, creo que la mejor opción es...',
      'Gracias por tu consulta. Aquí está mi respuesta.',
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Helper para delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Limpia recursos al destruir el servicio
   */
  destroy(): void {
    Voice.destroy().then(() => {
      console.log('[VoiceService] Voice destruido');
    }).catch((error) => {
      console.error('[VoiceService] Error al destruir Voice:', error);
    });
    
    Tts.stop();
  }
}

// Instancia singleton
export const voiceService = new VoiceService();
