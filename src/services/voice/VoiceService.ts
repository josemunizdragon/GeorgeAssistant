import { AssistantState } from '../../types/georgeMessages';
import Tts from 'react-native-tts';
import Voice from '@react-native-voice/voice';
import { NativeModules, Platform } from 'react-native';

const { AudioSessionManager } = NativeModules;

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
  private consecutiveErrors: number = 0;
  private lastErrorTime: number = 0;
  
  // Mutex/cooldown para evitar loops de start/stop
  private startInFlight: Promise<void> | null = null;
  private lastStopTime: number = 0;
  private readonly MIN_COOLDOWN_MS = 800; // Mínimo tiempo entre stop/cancel y start
  
  // TTS listeners (una sola vez)
  private ttsListenersInitialized: boolean = false;
  private currentUtteranceResolve: (() => void) | null = null;
  private currentUtteranceReject: ((error: any) => void) | null = null;
  
  // Backoff para error 1101
  private error1101RetryDelay: number = 1000; // Empieza en 1s, max 10s

  constructor() {
    this.initializeTTS();
    this.initializeVoice();
  }

  /**
   * Helper seguro para agregar listeners de TTS
   * Maneja errores si el evento no está soportado
   */
  private safeAddTtsListener(eventName: 'tts-start' | 'tts-finish' | 'tts-cancel' | 'tts-error', handler: (...args: any[]) => void): boolean {
    try {
      // TypeScript puede quejarse, pero en runtime estos eventos pueden no estar disponibles
      (Tts.addEventListener as any)(eventName, handler);
      return true;
    } catch (error: any) {
      console.warn(`[VoiceService] ⚠️ Evento TTS '${eventName}' no soportado o error al registrar:`, error?.message || error);
      return false;
    }
  }

  /**
   * Inicializa Text-to-Speech
   */
  private async initializeTTS(): Promise<void> {
    try {
      await Tts.setDefaultLanguage('es-MX');
      
      // Configuración para voz más natural (menos robotizada)
      // Rate: 0.45-0.52 es más natural (no muy lento, no muy rápido)
      await Tts.setDefaultRate(0.50);
      // Pitch: 0.95-1.05 es más natural (ligeramente más bajo para masculina)
      await Tts.setDefaultPitch(0.98);
      
      // Obtener todas las voces disponibles
      try {
        const voices = await Tts.voices();
        console.log('[VoiceService] Voces disponibles:', voices.length);
        
        // Buscar voces en español (priorizar Enhanced, luego es-MX)
        const spanishVoices = voices.filter((voice: any) => {
          const language = voice.language?.toLowerCase() || '';
          const notInstalled = voice.notInstalled === true;
          return language.startsWith('es') && !notInstalled;
        });
        
        if (spanishVoices.length > 0) {
          // Priorizar: 1) Enhanced quality, 2) es-MX locale, 3) masculina
          const enhancedVoices = spanishVoices.filter((v: any) => {
            const quality = (v.quality || '').toLowerCase();
            return quality.includes('enhanced') || quality.includes('premium');
          });
          
          const mexicanVoices = spanishVoices.filter((v: any) => {
            const lang = v.language?.toLowerCase() || '';
            return lang.includes('es-mx') || lang.includes('es_mx');
          });
          
          const maleVoices = spanishVoices.filter((v: any) => {
            const name = (v.name || '').toLowerCase();
            const id = (v.id || '').toLowerCase();
            return v.gender === 'male' || 
                   name.includes('male') || 
                   name.includes('masculino') ||
                   id.includes('male');
          });
          
          // Seleccionar mejor voz: Enhanced + es-MX + male > Enhanced + es-MX > Enhanced > es-MX + male > es-MX > male > cualquier español
          let selectedVoice = enhancedVoices.find((v: any) => {
            const lang = v.language?.toLowerCase() || '';
            const isMexican = lang.includes('es-mx') || lang.includes('es_mx');
            const isMale = v.gender === 'male' || (v.name || '').toLowerCase().includes('male');
            return isMexican && isMale;
          });
          
          if (!selectedVoice) {
            selectedVoice = enhancedVoices.find((v: any) => {
              const lang = v.language?.toLowerCase() || '';
              return lang.includes('es-mx') || lang.includes('es_mx');
            });
          }
          
          if (!selectedVoice && enhancedVoices.length > 0) {
            selectedVoice = enhancedVoices[0];
          }
          
          if (!selectedVoice) {
            selectedVoice = mexicanVoices.find((v: any) => {
              return v.gender === 'male' || (v.name || '').toLowerCase().includes('male');
            });
          }
          
          if (!selectedVoice && mexicanVoices.length > 0) {
            selectedVoice = mexicanVoices[0];
          }
          
          if (!selectedVoice && maleVoices.length > 0) {
            selectedVoice = maleVoices[0];
          }
          
          if (!selectedVoice) {
            selectedVoice = spanishVoices[0];
          }
          
          if (selectedVoice) {
            await Tts.setDefaultVoice(selectedVoice.id);
            const quality = selectedVoice.quality || 'standard';
            console.log('[VoiceService] ✅ Voz configurada:', selectedVoice.name, `(${quality}, ${selectedVoice.language})`);
          }
        } else {
          console.log('[VoiceService] ⚠️ No se encontraron voces en español, usando defecto');
        }
      } catch (voiceError) {
        console.warn('[VoiceService] Error al configurar voz personalizada:', voiceError);
      }
      
      // Inicializar listeners de TTS UNA SOLA VEZ (evitar acumulación)
      if (!this.ttsListenersInitialized) {
        // Listener de tts-start (solo logging) - soportado en iOS y Android
        this.safeAddTtsListener('tts-start', () => {
          console.log('[VoiceService] TTS empezó a hablar');
        });
        
        // Listener de tts-finish (resuelve promise actual) - soportado en iOS y Android
        this.safeAddTtsListener('tts-finish', () => {
          if (this.currentUtteranceResolve) {
            console.log('[VoiceService] TTS terminó de hablar');
            this.currentUtteranceResolve();
            this.currentUtteranceResolve = null;
            this.currentUtteranceReject = null;
          }
        });
        
        // Listener de tts-cancel - soportado en iOS y Android
        this.safeAddTtsListener('tts-cancel', () => {
          console.log('[VoiceService] TTS cancelado');
          if (this.currentUtteranceResolve) {
            this.currentUtteranceResolve();
            this.currentUtteranceResolve = null;
            this.currentUtteranceReject = null;
          }
        });
        
        // Listener de tts-error - solo en Android (iOS no lo soporta)
        if (Platform.OS === 'android') {
          this.safeAddTtsListener('tts-error', (error: any) => {
            console.error('[VoiceService] TTS error:', error);
            if (this.currentUtteranceReject) {
              this.currentUtteranceReject(error);
              this.currentUtteranceResolve = null;
              this.currentUtteranceReject = null;
            }
          });
        }
        
        this.ttsListenersInitialized = true;
        console.log('[VoiceService] ✅ Listeners de TTS inicializados (una sola vez)');
      }
      
      // Configurar ignoreSilentSwitch en iOS (si está disponible)
      if (Platform.OS === 'ios') {
        try {
          if (typeof (Tts as any).setIgnoreSilentSwitch === 'function') {
            await (Tts as any).setIgnoreSilentSwitch('ignore');
            console.log('[VoiceService] ✅ setIgnoreSilentSwitch configurado');
          }
        } catch (e) {
          // Ignorar si no está disponible en esta versión
          console.warn('[VoiceService] setIgnoreSilentSwitch no disponible:', e);
        }
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
      
      // NO reiniciar si:
      // 1. Ya hay un start in flight (evitar loops)
      // 2. Se detectó wake word (ya se maneja en otro lugar)
      // 3. No está en modo continuo
      if (this.startInFlight || this.wakeWordDetected || !this.isContinuousListening) {
        return;
      }
      
      // Reiniciar solo si no hay start en curso y está en modo continuo
      console.log('[VoiceService] Reiniciando reconocimiento continuo después de onSpeechEnd...');
      setTimeout(() => {
        // Verificar de nuevo antes de iniciar (puede haber cambiado el estado)
        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
          this.startContinuousListening().catch((error) => {
            console.error('[VoiceService] Error al reiniciar reconocimiento continuo:', error);
          });
        }
      }, 500);
    };

    // IMPORTANTE: onSpeechError es handler sync, no puede usar await
    // Llamamos a handleSpeechError async de forma fire-and-forget
    Voice.onSpeechError = (e: any) => {
      void this.handleSpeechError(e);
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
   * Maneja errores de reconocimiento de voz (async, llamado desde onSpeechError)
   */
  private async handleSpeechError(e: any): Promise<void> {
    const errorCode = e?.error?.code || e?.code || 'unknown';
    const errorMessage = String(e?.error?.message ?? e?.message ?? '');
    this.isListening = false;

    // Identificar errores ignorables
    const isNoSpeech = errorCode === '110' || 
                       errorCode === '1110' ||
                       (errorCode === 'recognition_fail' && /(110|1110|no speech)/i.test(errorMessage));
    
    const is1101Error = errorCode === '1101' || 
                        errorMessage.includes('1101') || 
                        errorMessage.includes('kAFAssistantErrorDomain');
    
    const isNullEngineError = errorMessage.includes('NULL != engine') || 
                               errorCode === 'start_recording';
    
    const ignorableErrors = ['7', '9', '110', '1110', '1101'];
    const isIgnorable = ignorableErrors.includes(String(errorCode)) || 
                       isNoSpeech || 
                       is1101Error || 
                       isNullEngineError;

    // Logging mejorado con diagnóstico
    if (is1101Error) {
      console.warn('[VoiceService] ⚠️ Error 1101 (on-device recognition falló, usando server-based)');
      console.warn('[VoiceService] 💡 Esto es normal si on-device no está disponible. El reconocimiento continuará con servidor.');
    } else if (isNoSpeech) {
      // No loguear "no speech" - es muy común
    } else if (isNullEngineError) {
      console.error('[VoiceService] ❌ Error de audio engine (NULL != engine)');
      console.error('[VoiceService] 💡 Esto puede indicar que AVAudioSession no está configurado correctamente');
    } else if (!isIgnorable) {
      console.error('[VoiceService] ❌ Error en reconocimiento de voz:', {
        code: errorCode,
        message: errorMessage,
      });
    }

    if (!this.isContinuousListening) {
      if (!isIgnorable) {
        this.notifyStateChange('idle');
      }
      return;
    }

    // Para errores ignorables, no hacer nada (solo continuar escuchando)
    if (isIgnorable && !is1101Error && !isNullEngineError) {
      return;
    }

    // Para errores de engine (NULL != engine), usar destroy() y esperar más tiempo
    if (isNullEngineError) {
      console.warn('[VoiceService] ⚠️ Error de audio engine (NULL != engine). Limpiando y esperando...');
      
      // Reconfigurar audio session
      if (Platform.OS === 'ios' && AudioSessionManager) {
        const configureRecord = AudioSessionManager.configureRecordSession;
        if (configureRecord) {
          try {
            await configureRecord();
            console.log('[VoiceService] ✅ AVAudioSession reconfigurado');
          } catch (err) {
            console.error('[VoiceService] ❌ Error al reconfigurar AVAudioSession:', err);
          }
        }
      }
      
      // Limpiar completamente: destroy + removeAllListeners + rebind
      try {
        await Voice.destroy();
        Voice.removeAllListeners?.();
        // Rebind handlers después de destroy
        this.initializeVoice();
        
        // Esperar antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
          await this.startContinuousListening();
        }
      } catch (err) {
        console.error('[VoiceService] ❌ Error en cleanup de engine:', err);
        // Reintentar de todas formas después de esperar
        setTimeout(() => {
          if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
            this.startContinuousListening().catch((err2) => {
              console.error('[VoiceService] ❌ Error al reiniciar:', err2);
            });
          }
        }, 5000);
      }
      return;
    }
    
    // Fallback para error 1101: NO reiniciar inmediatamente, usar backoff
    if (is1101Error) {
      console.warn('[VoiceService] ⚠️ Error 1101 (on-device recognition falló)');
      console.warn('[VoiceService] 💡 Usando reconocimiento server-based (más confiable)');
      console.warn('[VoiceService] 💡 Programando retry con backoff:', this.error1101RetryDelay, 'ms');
      
      // NO reiniciar si hay start in flight
      if (this.startInFlight || this.wakeWordDetected) {
        return;
      }
      
      // Backoff exponencial: 1s, 2s, 4s, 8s, max 10s
      const retryDelay = this.error1101RetryDelay;
      this.error1101RetryDelay = Math.min(this.error1101RetryDelay * 2, 10000);
      
      setTimeout(async () => {
        // Resetear backoff si se inicia correctamente
        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
          try {
            await this.startContinuousListening();
            this.error1101RetryDelay = 1000; // Reset backoff en éxito
          } catch (err) {
            console.error('[VoiceService] ❌ Error en retry después de 1101:', err);
          }
        }
      }, retryDelay);
      return;
    }

    // Para otros errores no ignorables, reiniciar después de un tiempo
    // Pero evitar reinicios en bucle
    const now = Date.now();
    if (now - this.lastErrorTime < 10000) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 1;
    }
    this.lastErrorTime = now;

    if (this.consecutiveErrors > 3) {
      console.warn('[VoiceService] Demasiados errores consecutivos. Esperando más tiempo...');
      this.consecutiveErrors = 0;
      setTimeout(() => {
        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
          this.startContinuousListening().catch((error) => {
            console.error('[VoiceService] Error al reiniciar después de muchos errores:', error);
          });
        }
      }, 10000);
      return;
    }

    if (!this.wakeWordDetected && !this.startInFlight) {
      console.log('[VoiceService] Reiniciando reconocimiento continuo después de error...');
      setTimeout(() => {
        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
          this.startContinuousListening().catch((error) => {
            console.error('[VoiceService] Error al reiniciar reconocimiento continuo:', error);
          });
        }
      }, 3000);
    }
  }

  /**
   * Verifica y solicita permisos antes de iniciar el reconocimiento
   */
  private async checkPermissions(): Promise<boolean> {
    try {
      console.log('[VoiceService] 🔍 Verificando permisos...');
      
      // 1. Configurar AVAudioSession para RECORDING (antes de Voice.start)
      if (Platform.OS === 'ios' && AudioSessionManager?.configureRecordSession) {
        try {
          const audioConfig = await AudioSessionManager.configureRecordSession();
          console.log('[VoiceService] ✅ AVAudioSession (record) configurado:', audioConfig.category, audioConfig.mode);
        } catch (error) {
          console.error('[VoiceService] ❌ Error configurando AVAudioSession (record):', error);
          // Continuar de todas formas, puede que ya esté configurado
        }
      }

      // 2. Verificar permisos de micrófono (AVAudioSession)
      if (Platform.OS === 'ios' && AudioSessionManager?.checkMicrophonePermission) {
        const micPermission = await AudioSessionManager.checkMicrophonePermission();
        console.log('[VoiceService] 📱 Permiso de micrófono (AVAudioSession):', micPermission.status);
        
        if (micPermission.status === 'undetermined') {
          console.log('[VoiceService] 📱 Solicitando permiso de micrófono...');
          if (AudioSessionManager.requestMicrophonePermission) {
            const result = await AudioSessionManager.requestMicrophonePermission();
            if (!result.granted) {
              console.error('[VoiceService] ❌ Permiso de micrófono DENEGADO');
              return false;
            }
            console.log('[VoiceService] ✅ Permiso de micrófono otorgado');
          }
        } else if (micPermission.status === 'denied') {
          console.error('[VoiceService] ❌ Permiso de micrófono DENEGADO (ir a Settings → Privacy → Microphone)');
          return false;
        }
      }

      // 3. Verificar y solicitar autorización de SFSpeechRecognizer
      if (Platform.OS === 'ios' && AudioSessionManager?.requestSpeechRecognitionAuthorization) {
        try {
          const speechAuth = await AudioSessionManager.requestSpeechRecognitionAuthorization();
          console.log('[VoiceService] 🗣️ Autorización SFSpeechRecognizer:', speechAuth.status, `(code: ${speechAuth.code})`);
          
          if (speechAuth.status === 'denied' || speechAuth.status === 'restricted') {
            console.error('[VoiceService] ❌ Autorización de reconocimiento de voz DENEGADA (ir a Settings → Privacy → Speech Recognition)');
            return false;
          }
          
          if (speechAuth.status === 'authorized') {
            console.log('[VoiceService] ✅ Autorización de reconocimiento de voz otorgada');
          }
        } catch (e) {
          console.warn('[VoiceService] ⚠️ No se pudo verificar autorización SFSpeechRecognizer:', e);
        }
      }

      // 4. Verificar disponibilidad de reconocimiento de voz
      const isAvailable = await Voice.isAvailable();
      console.log('[VoiceService] 🎤 Reconocimiento de voz disponible (Voice.isAvailable):', isAvailable);
      
      if (!isAvailable) {
        console.error('[VoiceService] ❌ El reconocimiento de voz no está disponible');
        return false;
      }

      // 5. Verificar disponibilidad de SFSpeechRecognizer (iOS)
      if (Platform.OS === 'ios' && AudioSessionManager?.checkSpeechRecognitionAvailability) {
        try {
          const speechAvailable = await AudioSessionManager.checkSpeechRecognitionAvailability();
          console.log('[VoiceService] 🎤 SFSpeechRecognizer disponible:', speechAvailable.available);
        } catch (e) {
          console.warn('[VoiceService] ⚠️ No se pudo verificar disponibilidad SFSpeechRecognizer:', e);
        }
      }

      // 6. Verificar locale (es-MX o es-ES)
      const locale = 'es-MX'; // o 'es-ES'
      if (Platform.OS === 'ios' && AudioSessionManager?.checkLocaleAvailability) {
        try {
          const localeAvailable = await AudioSessionManager.checkLocaleAvailability(locale);
          console.log('[VoiceService] 🌍 Locale disponible:', locale, '=', localeAvailable.available);
          if (!localeAvailable.available) {
            console.warn('[VoiceService] ⚠️ Locale', locale, 'no disponible, intentando con es-ES...');
            const esESAvailable = await AudioSessionManager.checkLocaleAvailability('es-ES');
            console.log('[VoiceService] 🌍 Locale es-ES disponible:', esESAvailable.available);
          }
        } catch (e) {
          console.warn('[VoiceService] ⚠️ No se pudo verificar locale:', e);
        }
      }
      
      console.log('[VoiceService] ✅ Todos los permisos verificados correctamente');
      return true;
    } catch (error) {
      console.error('[VoiceService] ❌ Error al verificar permisos:', error);
      return false;
    }
  }

  /**
   * Inicia el reconocimiento de voz continuo (para detectar wake word)
   * Con mutex/cooldown para evitar loops
   */
  async startContinuousListening(): Promise<void> {
    // Mutex: si ya hay un start en curso, esperar
    if (this.startInFlight) {
      console.log('[VoiceService] ⏳ Start ya en curso, esperando...');
      try {
        await this.startInFlight;
      } catch (e) {
        // Ignorar errores del start anterior
      }
      // Después de esperar, verificar si aún necesitamos iniciar
      if (this.isListening || !this.isContinuousListening || this.wakeWordDetected) {
        return;
      }
    }
    
    // Cooldown: esperar mínimo tiempo desde último stop/cancel
    const timeSinceLastStop = Date.now() - this.lastStopTime;
    if (timeSinceLastStop < this.MIN_COOLDOWN_MS) {
      const waitTime = this.MIN_COOLDOWN_MS - timeSinceLastStop;
      console.log(`[VoiceService] ⏳ Cooldown: esperando ${waitTime}ms antes de start...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Crear promise para mutex
    this.startInFlight = (async () => {
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
            if (this.isContinuousListening && !this.startInFlight) {
              this.startContinuousListening().catch((e) => {
                console.error('[VoiceService] Error en reintento de permisos:', e);
              });
            }
          }, 2000);
          return;
        }
        
        // Configurar AudioSession para RECORDING antes de Voice.start
        if (Platform.OS === 'ios' && AudioSessionManager?.configureRecordSession) {
          try {
            await AudioSessionManager.configureRecordSession();
            console.log('[VoiceService] ✅ AudioSession (record) configurado antes de Voice.start');
          } catch (error) {
            console.error('[VoiceService] ❌ Error configurando AudioSession (record):', error);
          }
        }
        
        // Limpiar cualquier reconocimiento previo completamente
        try {
          await Voice.cancel();
          // Esperar suficiente tiempo para que el sistema libere el request anterior
          await new Promise(resolve => setTimeout(resolve, this.MIN_COOLDOWN_MS));
        } catch (e) {
          // Si hay error al cancelar, esperar igual
          await new Promise(resolve => setTimeout(resolve, this.MIN_COOLDOWN_MS));
        }
        
        this.isContinuousListening = true;
        this.wakeWordDetected = false;
        this.recognizedText = '';
        this.isListening = false; // Asegurar que el flag esté limpio
        
        // IMPORTANTE: NO usar requiresOnDeviceRecognition = true
        // Usar reconocimiento server-based (más confiable, evita error 1101)
        console.log('[VoiceService] 🚀 Iniciando reconocimiento (server-based, locale: es-MX)...');
        await Voice.start('es-MX');
        
        // Resetear contador de errores cuando se inicia correctamente
        this.consecutiveErrors = 0;
        this.error1101RetryDelay = 1000; // Reset backoff en éxito
        console.log('[VoiceService] ✅ Reconocimiento continuo iniciado (server-based, escuchando "hey geo")');
      } catch (error: any) {
        console.error('[VoiceService] Error al iniciar reconocimiento continuo:', {
          error,
          message: error?.message,
          code: error?.code,
        });
        throw error; // Re-throw para que el catch externo lo maneje
      } finally {
        // Limpiar mutex
        this.startInFlight = null;
      }
    })();
    
    try {
      await this.startInFlight;
    } catch (error: any) {
      // Error ya fue logueado arriba
      // No reintentar aquí, se maneja en handleSpeechError o callers
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
      
      // Cooldown: esperar mínimo tiempo desde último stop/cancel
      const timeSinceLastStop = Date.now() - this.lastStopTime;
      if (timeSinceLastStop < this.MIN_COOLDOWN_MS) {
        const waitTime = this.MIN_COOLDOWN_MS - timeSinceLastStop;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Si ya está escuchando, cancelar primero
      if (this.isListening) {
        try {
          await Voice.cancel();
          await new Promise(resolve => setTimeout(resolve, this.MIN_COOLDOWN_MS));
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, this.MIN_COOLDOWN_MS));
        }
      }
      
      this.recognizedText = '';
      this.wakeWordDetected = false;
      this.isListening = false; // Asegurar que el flag esté limpio
      
      // Limpiar cualquier reconocimiento previo
      try {
        await Voice.cancel();
        // Esperar suficiente tiempo para que el sistema libere el request anterior
        await new Promise(resolve => setTimeout(resolve, this.MIN_COOLDOWN_MS));
      } catch (e) {
        // Ignorar errores al cancelar, pero esperar igual
        await new Promise(resolve => setTimeout(resolve, this.MIN_COOLDOWN_MS));
      }
      
      // Configurar AudioSession para RECORDING antes de Voice.start
      if (Platform.OS === 'ios' && AudioSessionManager?.configureRecordSession) {
        try {
          await AudioSessionManager.configureRecordSession();
          console.log('[VoiceService] ✅ AudioSession (record) configurado antes de Voice.start');
        } catch (error) {
          console.error('[VoiceService] ❌ Error configurando AudioSession (record):', error);
        }
      }
      
      // IMPORTANTE: NO usar requiresOnDeviceRecognition = true
      // Usar reconocimiento server-based (más confiable, evita error 1101)
      console.log('[VoiceService] 🚀 Iniciando reconocimiento (server-based, locale: es-MX)...');
      await Voice.start('es-MX');
      console.log('[VoiceService] ✅ Reconocimiento iniciado (server-based)');
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
      if (!this.isListening) {
        // Si no está escuchando, solo devolver el texto reconocido
        const text = this.recognizedText;
        this.recognizedText = '';
        return text || '';
      }
      
      await Voice.stop();
      this.isListening = false;
      this.lastStopTime = Date.now(); // Registrar tiempo de stop para cooldown
      const text = this.recognizedText;
      this.recognizedText = '';
      
      // Esperar un momento antes de permitir otro reconocimiento
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return text || '';
    } catch (error) {
      console.error('[VoiceService] Error al detener reconocimiento:', error);
      this.isListening = false;
      this.lastStopTime = Date.now();
      const text = this.recognizedText;
      this.recognizedText = '';
      // Esperar antes de permitir otro reconocimiento
      await new Promise(resolve => setTimeout(resolve, 500));
      return text || '';
    }
  }

  /**
   * Cancela el reconocimiento de voz
   */
  async cancelListening(): Promise<void> {
    try {
      if (this.isListening) {
        await Voice.cancel();
        this.lastStopTime = Date.now(); // Registrar tiempo de cancel para cooldown
        // Esperar para que el sistema limpie el request
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      this.isListening = false;
      this.wakeWordDetected = false;
      this.notifyStateChange('idle');
    } catch (error) {
      console.error('[VoiceService] Error al cancelar reconocimiento:', error);
      // Asegurar que los flags estén limpios incluso si hay error
      this.isListening = false;
      this.lastStopTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Configura TTS para hablar fuerte (playback session)
   */
  async setSpeechLoud(): Promise<void> {
    if (Platform.OS === 'ios' && AudioSessionManager?.configurePlaybackSession) {
      try {
        await AudioSessionManager.configurePlaybackSession();
        console.log('[VoiceService] 🔊 Playback session configurado (TTS fuerte)');
      } catch (error) {
        console.error('[VoiceService] ❌ Error configurando playback session:', error);
        console.log('[VoiceService] 💡 Sugerencia: Verifica que el volumen del sistema esté alto');
      }
    } else if (Platform.OS === 'android' && AudioSessionManager) {
      try {
        // TypeScript puede no reconocer setSpeakerphoneOn, pero existe en runtime en Android
        const setSpeakerphoneOn = (AudioSessionManager as any).setSpeakerphoneOn;
        if (typeof setSpeakerphoneOn === 'function') {
          await setSpeakerphoneOn(true);
          console.log('[VoiceService] 🔊 Speakerphone activado (TTS fuerte en Android)');
        } else {
          console.warn('[VoiceService] ⚠️ setSpeakerphoneOn no disponible en AudioSessionManager');
        }
      } catch (error) {
        console.error('[VoiceService] ❌ Error activando speakerphone:', error);
      }
    }
  }

  /**
   * Hace que George hable usando TTS
   * Retorna una Promise que se resuelve cuando termina de hablar
   * NO depende de tts-error (no está soportado en iOS)
   */
  async speak(text: string): Promise<void> {
    // Mejorar el texto para que suene más natural
    const improvedText = this.improveTextNaturalness(text);
    console.log('[VoiceService] George va a decir:', improvedText);
    
    // Configurar AudioSession para PLAYBACK antes de Tts.speak (TTS fuerte)
    await this.setSpeechLoud();
    
    // Configurar parámetros específicos para esta frase
    await Tts.setDefaultRate(0.50);
    await Tts.setDefaultPitch(0.98);
    
    // Detener cualquier TTS anterior para evitar cola
    try {
      await Tts.stop();
    } catch (e) {
      // Ignorar si no hay nada reproduciéndose
    }
    
    return new Promise((resolve, reject) => {
      // Si ya hay un utterance en curso, resolver el anterior (no rechazar, solo limpiar)
      if (this.currentUtteranceResolve) {
        console.log('[VoiceService] Cancelando utterance anterior por nuevo');
        this.currentUtteranceResolve();
        this.currentUtteranceResolve = null;
        this.currentUtteranceReject = null;
      }
      
      // Guardar resolve/reject para el listener global
      this.currentUtteranceResolve = resolve;
      this.currentUtteranceReject = reject;
      
      // Timeout de seguridad (máximo 30 segundos)
      const estimatedTime = Math.max(improvedText.length * 200, 3000);
      let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
        if (this.currentUtteranceResolve === resolve) {
          console.warn('[VoiceService] Timeout esperando TTS, forzando resolución');
          this.currentUtteranceResolve = null;
          this.currentUtteranceReject = null;
          resolve();
        }
        timeoutId = null;
      }, Math.min(estimatedTime, 30000));
      
      // Iniciar el habla con el texto mejorado
      // Si Tts.speak lanza error síncrono, rechazar inmediatamente
      try {
        Tts.speak(improvedText);
        // El listener global tts-finish o tts-cancel resolverá la promise
        // En Android, tts-error también puede rechazar (si está disponible)
      } catch (error: any) {
        // Error síncrono al llamar speak()
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.currentUtteranceResolve = null;
        this.currentUtteranceReject = null;
        console.error('[VoiceService] Error síncrono al llamar Tts.speak():', error);
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
   * Router de intents con respuestas HVAC y de ayuda
   */
  generateResponse(userText: string): string {
    if (!userText || !userText.trim()) {
      return 'No pude escucharte bien. ¿Podrías repetir tu pregunta?';
    }
    
    const lowerText = userText.toLowerCase().trim();
    
    // ===== SALUDOS =====
    if (lowerText.includes('hola') || lowerText.includes('buenos días') || 
        lowerText.includes('buenas tardes') || lowerText.includes('buenas noches') ||
        lowerText === 'hola' || lowerText.startsWith('hola ')) {
      return '¡Hola! Aquí estoy para ayudarte.';
    }
    
    // ===== ESTADO / CÓMO ESTÁS =====
    if (lowerText.includes('cómo estás') || lowerText.includes('como estas') || 
        lowerText.includes('qué tal') || lowerText.includes('que tal') ||
        lowerText.includes('cómo vas') || lowerText.includes('como vas')) {
      return 'Estoy bien, aquí estoy para ayudarte.';
    }
    
    // ===== QUÉ DÍA ES HOY =====
    if (lowerText.includes('qué día') || lowerText.includes('que dia') || 
        lowerText.includes('qué día es') || lowerText.includes('que dia es') ||
        lowerText.includes('día de hoy') || lowerText.includes('dia de hoy')) {
      return 'Es un día grandioso.';
    }
    
    // ===== QUÉ SABES HACER =====
    if (lowerText.includes('qué sabes') || lowerText.includes('que sabes') ||
        lowerText.includes('qué puedes') || lowerText.includes('que puedes') ||
        lowerText.includes('qué haces') || lowerText.includes('que haces') ||
        lowerText.includes('qué puedes hacer') || lowerText.includes('que puedes hacer')) {
      return 'Por ahora solo soy un demo, pero pronto seré tu asistente personal de aires acondicionados.';
    }
    
    // ===== VOLUMEN =====
    if (lowerText.includes('sube la voz') || lowerText.includes('sube voz') ||
        lowerText.includes('más volumen') || lowerText.includes('mas volumen') ||
        lowerText.includes('más alto') || lowerText.includes('mas alto') ||
        lowerText.includes('aumenta volumen') || lowerText.includes('sube volumen') ||
        lowerText.includes('habla más fuerte') || lowerText.includes('habla mas fuerte')) {
      return 'Entendido, voy a hablar más fuerte.';
    }
    
    if (lowerText.includes('baja la voz') || lowerText.includes('baja voz') ||
        lowerText.includes('menos volumen') || lowerText.includes('baja volumen') ||
        lowerText.includes('más bajo') || lowerText.includes('mas bajo')) {
      return 'Entendido, voy a hablar más bajo.';
    }
    
    // ===== HVAC: GARANTÍA =====
    if (lowerText.includes('garantía') || lowerText.includes('garantia') ||
        lowerText.includes('garantizado') || lowerText.includes('garantizar')) {
      return 'Nuestros equipos tienen garantía de fábrica. ¿Te interesa conocer los detalles de la garantía?';
    }
    
    // ===== HVAC: INSTALACIÓN =====
    if (lowerText.includes('instalación') || lowerText.includes('instalacion') ||
        lowerText.includes('instalar') || lowerText.includes('instalado') ||
        lowerText.includes('montar') || lowerText.includes('montaje')) {
      return 'Ofrecemos servicio profesional de instalación. Nuestros técnicos certificados se encargan de todo.';
    }
    
    // ===== HVAC: ERROR E1 / E2 =====
    if (lowerText.includes('error e1') || lowerText.includes('error e 1') ||
        lowerText.includes('código e1') || lowerText.includes('codigo e1')) {
      return 'El error E1 generalmente indica un problema con el sensor de temperatura. Te recomiendo revisar las conexiones o contactar a un técnico.';
    }
    
    if (lowerText.includes('error e2') || lowerText.includes('error e 2') ||
        lowerText.includes('código e2') || lowerText.includes('codigo e2')) {
      return 'El error E2 suele indicar un problema con el compresor o la presión del refrigerante. Es importante que un técnico lo revise.';
    }
    
    // ===== HVAC: INVERTER =====
    if (lowerText.includes('inverter') || lowerText.includes('inversor') ||
        lowerText.includes('tecnología inverter') || lowerText.includes('tecnologia inverter')) {
      return 'La tecnología Inverter permite un ahorro de energía de hasta 40 por ciento, ya que ajusta la velocidad del compresor según la necesidad.';
    }
    
    // ===== HVAC: AHORRO ENERGÍA =====
    if (lowerText.includes('ahorro') || lowerText.includes('ahorrar') ||
        lowerText.includes('consumo') || lowerText.includes('eficiencia') ||
        lowerText.includes('eficiente') || lowerText.includes('gasto de luz') ||
        lowerText.includes('factura de luz')) {
      return 'Los equipos con tecnología Inverter pueden ahorrar hasta 40 por ciento en consumo de energía comparados con equipos convencionales.';
    }
    
    // ===== HVAC: LIMPIEZA FILTROS =====
    if (lowerText.includes('filtro') || lowerText.includes('filtros') ||
        lowerText.includes('limpiar filtro') || lowerText.includes('limpieza de filtros') ||
        lowerText.includes('mantenimiento filtro')) {
      return 'Es recomendable limpiar los filtros cada 2 a 3 meses para mantener la eficiencia y la calidad del aire.';
    }
    
    // ===== HVAC: MANTENIMIENTO =====
    if (lowerText.includes('mantenimiento') || lowerText.includes('mantener') ||
        lowerText.includes('revisión') || lowerText.includes('revision') ||
        lowerText.includes('revisar') || lowerText.includes('servicio técnico')) {
      return 'El mantenimiento preventivo se recomienda cada 6 meses. Incluye limpieza, revisión de gas refrigerante y verificación de componentes.';
    }
    
    // ===== HVAC: COTIZACIÓN =====
    if (lowerText.includes('cotización') || lowerText.includes('cotizacion') ||
        lowerText.includes('cotizar') || lowerText.includes('precio') ||
        lowerText.includes('costo') || lowerText.includes('cuánto cuesta') ||
        lowerText.includes('cuanto cuesta') || lowerText.includes('precio de')) {
      return 'Para darte una cotización precisa, necesito conocer el tamaño del espacio y tus necesidades específicas. ¿Te puedo ayudar con eso?';
    }
    
    // ===== HVAC: UBICACIÓN =====
    if (lowerText.includes('ubicación') || lowerText.includes('ubicacion') ||
        lowerText.includes('dónde') || lowerText.includes('donde') ||
        lowerText.includes('dirección') || lowerText.includes('direccion') ||
        lowerText.includes('sucursal') || lowerText.includes('tienda')) {
      return 'Puedes encontrarnos en nuestras sucursales o contactarnos por teléfono. ¿Te interesa conocer nuestras ubicaciones?';
    }
    
    // ===== HVAC: CAPACIDAD / TONELADAS =====
    if (lowerText.includes('tonelada') || lowerText.includes('toneladas') ||
        lowerText.includes('capacidad') || lowerText.includes('btu') ||
        lowerText.includes('qué capacidad') || lowerText.includes('que capacidad') ||
        lowerText.includes('cuántas toneladas') || lowerText.includes('cuantas toneladas')) {
      return 'La capacidad se mide en toneladas o BTU. Para un cuarto de 20 metros cuadrados, generalmente se necesita 1 tonelada. ¿Qué tamaño tiene tu espacio?';
    }
    
    // ===== HVAC: MARCAS =====
    if (lowerText.includes('marca') || lowerText.includes('marcas') ||
        lowerText.includes('qué marca') || lowerText.includes('que marca') ||
        lowerText.includes('mejor marca') || lowerText.includes('recomendación')) {
      return 'Trabajamos con las mejores marcas del mercado. ¿Tienes alguna preferencia o te puedo recomendar según tus necesidades?';
    }
    
    // ===== DESPEDIDAS =====
    if (lowerText.includes('adiós') || lowerText.includes('hasta luego') || 
        lowerText.includes('nos vemos') || lowerText.includes('chao') ||
        lowerText.includes('hasta pronto')) {
      return '¡Hasta luego!';
    }
    
    // ===== AGRADECIMIENTOS =====
    if (lowerText.includes('gracias')) {
      return 'De nada, para eso estoy.';
    }
    
    // ===== RESPUESTA PREDETERMINADA =====
    return 'Soy tu asistente virtual experto en aires acondicionados. ¿En qué puedo ayudarte?';
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
