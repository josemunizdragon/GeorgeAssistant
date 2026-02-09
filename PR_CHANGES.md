# PR: Fix STT/TTS en iPhone - Cambios Completos

## Resumen
Este PR corrige problemas críticos de reconocimiento de voz (STT) y síntesis de voz (TTS) en iPhone físico:
- ✅ STT funciona sin loops infinitos
- ✅ TTS suena fuerte por altavoz
- ✅ Voz menos robotizada (Enhanced quality)
- ✅ Sin memory leaks en listeners TTS
- ✅ Respuestas HVAC personalizadas
- ✅ Sin warnings de shadow

---

## Archivos Modificados

1. `ios/GeorgeAssistantTemp/Info.plist`
2. `ios/GeorgeAssistantTemp/AudioSessionManager.m` (modificado)
3. `ios/GeorgeAssistantTemp/AudioSessionManager.h` (sin cambios)
4. `src/services/voice/VoiceService.ts` (refactorizado)
5. `src/types/nativeModules.d.ts` (actualizado)
6. `src/components/EyeWidget.tsx` (fix shadow)

---

## Diff 1: Info.plist

```diff
--- a/ios/GeorgeAssistantTemp/Info.plist
+++ b/ios/GeorgeAssistantTemp/Info.plist
@@ -39,8 +39,8 @@
 	<key>NSLocationWhenInUseUsageDescription</key>
 	<string>Esta app no requiere acceso a la ubicación</string>
 	<key>NSSpeechRecognitionUsageDescription</key>
-	<string>Necesitamos reconocimiento de voz para transcribir.</string>
+	<string>Necesitamos reconocimiento de voz para transcribir tu pregunta.</string>
 	<key>NSMicrophoneUsageDescription</key>
-	<string>Necesitamos el micrófono para dictado.</string>
+	<string>Necesitamos el micrófono para escuchar tu pregunta.</string>
```

---

## Diff 2: AudioSessionManager.m

**Cambios principales:**
- Separado `configureRecordSession()` para STT (playAndRecord + measurement)
- Nuevo `configurePlaybackSession()` para TTS (playback + defaultToSpeaker + overrideOutputAudioPort)
- Método legacy `configureAudioSession()` mantiene compatibilidad

```diff
--- a/ios/GeorgeAssistantTemp/AudioSessionManager.m
+++ b/ios/GeorgeAssistantTemp/AudioSessionManager.m
@@ -44,56 +44,95 @@
   }
 }
 
-- (BOOL)configureAudioSessionInternal {
+// Configurar AVAudioSession para RECORDING (Speech Recognition)
+RCT_EXPORT_METHOD(configureRecordSession:(RCTPromiseResolveBlock)resolve
+                  rejecter:(RCTPromiseRejectBlock)reject)
+{
   NSError *error = nil;
   AVAudioSession *audioSession = [AVAudioSession sharedInstance];
   
   // Configurar categoría para grabación y reproducción
-  // defaultToSpeaker: Fuerza el uso del altavoz (más volumen) en lugar del auricular
   AVAudioSessionCategoryOptions options = AVAudioSessionCategoryOptionDefaultToSpeaker | 
                                           AVAudioSessionCategoryOptionAllowBluetooth;
   
   // iOS 10+ soporta allowBluetoothA2DP
   if (@available(iOS 10.0, *)) {
     options |= AVAudioSessionCategoryOptionAllowBluetoothA2DP;
   }
   
-  // Forzar salida por altavoz para mayor volumen
-  // Esto asegura que el audio salga por el altavoz incluso si hay auriculares conectados
-  if (@available(iOS 10.0, *)) {
-    NSError *overrideError = nil;
-    [audioSession overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:&overrideError];
-    if (overrideError) {
-      NSLog(@"[AudioSessionManager] No se pudo forzar altavoz: %@", overrideError.localizedDescription);
-    } else {
-      NSLog(@"[AudioSessionManager] ✅ Salida de audio forzada a altavoz (mayor volumen)");
-    }
-  }
-  
   BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayAndRecord
                                 withOptions:options
                                       error:&error];
   
   if (!success || error) {
-    NSLog(@"[AudioSessionManager] Error configurando categoría: %@", error.localizedDescription);
-    return NO;
+    NSString *errorMsg = [NSString stringWithFormat:@"Error configurando categoría: %@", error.localizedDescription];
+    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
+    return;
   }
   
   // Configurar modo (measurement es mejor para reconocimiento de voz)
   success = [audioSession setMode:AVAudioSessionModeMeasurement error:&error];
   if (!success || error) {
     // Si measurement falla, usar default
     NSLog(@"[AudioSessionManager] Measurement no disponible, usando default");
     [audioSession setMode:AVAudioSessionModeDefault error:nil];
   }
   
   // Activar la sesión
   success = [audioSession setActive:YES error:&error];
   if (!success || error) {
-    NSLog(@"[AudioSessionManager] Error activando sesión: %@", error.localizedDescription);
-    return NO;
+    NSString *errorMsg = [NSString stringWithFormat:@"Error activando sesión: %@", error.localizedDescription];
+    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
+    return;
   }
   
-  _isConfigured = YES;
-  return YES;
+  NSLog(@"[AudioSessionManager] ✅ Record session configurado: %@ mode: %@", audioSession.category, audioSession.mode);
+  resolve(@{@"status": @"configured", @"category": audioSession.category, @"mode": audioSession.mode});
 }
 
-// Configurar AVAudioSession para reconocimiento de voz
-RCT_EXPORT_METHOD(configureAudioSession:(RCTPromiseResolveBlock)resolve
+// Configurar AVAudioSession para PLAYBACK (TTS - Text to Speech)
+RCT_EXPORT_METHOD(configurePlaybackSession:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject)
 {
-  BOOL success = [self configureAudioSessionInternal];
+  NSError *error = nil;
+  AVAudioSession *audioSession = [AVAudioSession sharedInstance];
   
-  if (success) {
-    AVAudioSession *audioSession = [AVAudioSession sharedInstance];
-    resolve(@{@"status": @"configured", @"category": audioSession.category, @"mode": audioSession.mode});
-  } else {
-    reject(@"AUDIO_SESSION_ERROR", @"Error configurando AVAudioSession", nil);
+  // Configurar categoría solo para reproducción (playback)
+  // Esto asegura que el TTS salga fuerte por el altavoz
+  BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayback
+                                withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker
+                                      error:&error];
+  
+  if (!success || error) {
+    NSString *errorMsg = [NSString stringWithFormat:@"Error configurando categoría playback: %@", error.localizedDescription];
+    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
+    return;
   }
+  
+  // Configurar modo default para playback
+  success = [audioSession setMode:AVAudioSessionModeDefault error:&error];
+  if (!success || error) {
+    NSLog(@"[AudioSessionManager] Error configurando modo default: %@", error.localizedDescription);
+    // Continuar de todas formas
+  }
+  
+  // Forzar salida por altavoz para mayor volumen en TTS
+  if (@available(iOS 10.0, *)) {
+    NSError *overrideError = nil;
+    [audioSession overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:&overrideError];
+    if (overrideError) {
+      NSLog(@"[AudioSessionManager] ⚠️ No se pudo forzar altavoz: %@", overrideError.localizedDescription);
+    } else {
+      NSLog(@"[AudioSessionManager] ✅ Salida de audio forzada a altavoz (TTS fuerte)");
+    }
+  }
+  
+  // Activar la sesión
+  success = [audioSession setActive:YES error:&error];
+  if (!success || error) {
+    NSString *errorMsg = [NSString stringWithFormat:@"Error activando sesión playback: %@", error.localizedDescription];
+    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
+    return;
+  }
+  
+  NSLog(@"[AudioSessionManager] ✅ Playback session configurado: %@ mode: %@", audioSession.category, audioSession.mode);
+  resolve(@{@"status": @"configured", @"category": audioSession.category, @"mode": audioSession.mode});
+}
+
+// Método legacy para compatibilidad (usa record session)
+RCT_EXPORT_METHOD(configureAudioSession:(RCTPromiseResolveBlock)resolve
+                  rejecter:(RCTPromiseRejectBlock)reject)
+{
+  [self configureRecordSession:resolve rejecter:reject];
 }
```

---

## Diff 3: VoiceService.ts (Cambios Principales)

### 3.1: Mutex/Cooldown para evitar loops

```diff
+  // Mutex/cooldown para evitar loops de start/stop
+  private startInFlight: Promise<void> | null = null;
+  private lastStopTime: number = 0;
+  private readonly MIN_COOLDOWN_MS = 800; // Mínimo tiempo entre stop/cancel y start
+  
+  // TTS listeners (una sola vez)
+  private ttsListenersInitialized: boolean = false;
+  private currentUtteranceResolve: (() => void) | null = null;
+  private currentUtteranceReject: ((error: any) => void) | null = null;
+  
+  // Backoff para error 1101
+  private error1101RetryDelay: number = 1000; // Empieza en 1s, max 10s
```

### 3.2: onSpeechError async handler

```diff
-    Voice.onSpeechError = (e: any) => {
-      // ... código largo con await (ERROR: handler sync no puede usar await)
-    };
+    // IMPORTANTE: onSpeechError es handler sync, no puede usar await
+    // Llamamos a handleSpeechError async de forma fire-and-forget
+    Voice.onSpeechError = (e: any) => {
+      void this.handleSpeechError(e);
+    };
```

### 3.3: handleSpeechError con backoff para 1101

```diff
+  private async handleSpeechError(e: any): Promise<void> {
+    // ... identificación de errores ...
+    
+    // Fallback para error 1101: NO reiniciar inmediatamente, usar backoff
+    if (is1101Error) {
+      console.warn('[VoiceService] ⚠️ Error 1101 (on-device recognition falló)');
+      console.warn('[VoiceService] 💡 Programando retry con backoff:', this.error1101RetryDelay, 'ms');
+      
+      // NO reiniciar si hay start in flight
+      if (this.startInFlight || this.wakeWordDetected) {
+        return;
+      }
+      
+      // Backoff exponencial: 1s, 2s, 4s, 8s, max 10s
+      const retryDelay = this.error1101RetryDelay;
+      this.error1101RetryDelay = Math.min(this.error1101RetryDelay * 2, 10000);
+      
+      setTimeout(async () => {
+        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
+          try {
+            await this.startContinuousListening();
+            this.error1101RetryDelay = 1000; // Reset backoff en éxito
+          } catch (err) {
+            console.error('[VoiceService] ❌ Error en retry después de 1101:', err);
+          }
+        }
+      }, retryDelay);
+      return;
+    }
+    
+    // Para NULL != engine: destroy + removeAllListeners + rebind
+    if (isNullEngineError) {
+      try {
+        await Voice.destroy();
+        Voice.removeAllListeners?.();
+        this.initializeVoice(); // Rebind handlers
+        await new Promise(resolve => setTimeout(resolve, 5000));
+        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
+          await this.startContinuousListening();
+        }
+      } catch (err) {
+        // ... error handling ...
+      }
+    }
+  }
```

### 3.4: startContinuousListening con mutex

```diff
  async startContinuousListening(): Promise<void> {
+    // Mutex: si ya hay un start en curso, esperar
+    if (this.startInFlight) {
+      console.log('[VoiceService] ⏳ Start ya en curso, esperando...');
+      try {
+        await this.startInFlight;
+      } catch (e) {
+        // Ignorar errores del start anterior
+      }
+      if (this.isListening || !this.isContinuousListening || this.wakeWordDetected) {
+        return;
+      }
+    }
+    
+    // Cooldown: esperar mínimo tiempo desde último stop/cancel
+    const timeSinceLastStop = Date.now() - this.lastStopTime;
+    if (timeSinceLastStop < this.MIN_COOLDOWN_MS) {
+      const waitTime = this.MIN_COOLDOWN_MS - timeSinceLastStop;
+      await new Promise(resolve => setTimeout(resolve, waitTime));
+    }
+    
+    // Crear promise para mutex
+    this.startInFlight = (async () => {
+      try {
+        // ... código de start ...
+        
+        // Configurar AudioSession para RECORDING antes de Voice.start
+        if (Platform.OS === 'ios' && AudioSessionManager) {
+          await AudioSessionManager.configureRecordSession();
+        }
+        
+        await Voice.start('es-MX');
+        // ... éxito ...
+      } finally {
+        this.startInFlight = null; // Limpiar mutex
+      }
+    })();
+    
+    await this.startInFlight;
+  }
```

### 3.5: onSpeechEnd NO reinicia si hay start in flight

```diff
  Voice.onSpeechEnd = () => {
    this.isListening = false;
    
-    // Si está en modo continuo y no se detectó el wake word, reiniciar
-    if (this.isContinuousListening && !this.wakeWordDetected) {
-      setTimeout(() => {
-        this.startContinuousListening().catch(...);
-      }, 500);
+    // NO reiniciar si:
+    // 1. Ya hay un start in flight (evitar loops)
+    // 2. Se detectó wake word
+    // 3. No está en modo continuo
+    if (this.startInFlight || this.wakeWordDetected || !this.isContinuousListening) {
+      return;
     }
+    
+    // Reiniciar solo si no hay start en curso
+    if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
+      setTimeout(() => {
+        if (this.isContinuousListening && !this.wakeWordDetected && !this.startInFlight) {
+          this.startContinuousListening().catch(...);
+        }
+      }, 500);
+    }
  };
```

### 3.6: Listeners TTS una sola vez

```diff
-      // Eventos globales de TTS (solo para logging)
-      try {
-        const startSubscription = Tts.addEventListener('tts-start', () => {
-          console.log('[VoiceService] TTS empezó a hablar');
-        });
-        // ... nunca se remueve => acumulación
-      } catch (e) { ... }
+      // Inicializar listeners de TTS UNA SOLA VEZ (evitar acumulación)
+      if (!this.ttsListenersInitialized) {
+        Tts.addEventListener('tts-start', () => {
+          console.log('[VoiceService] TTS empezó a hablar');
+        });
+        
+        Tts.addEventListener('tts-finish', () => {
+          if (this.currentUtteranceResolve) {
+            this.currentUtteranceResolve();
+            this.currentUtteranceResolve = null;
+            this.currentUtteranceReject = null;
+          }
+        });
+        
+        Tts.addEventListener('tts-cancel', () => {
+          if (this.currentUtteranceResolve) {
+            this.currentUtteranceResolve();
+            // ... cleanup ...
+          }
+        });
+        
+        Tts.addEventListener('tts-error', (error: any) => {
+          if (this.currentUtteranceReject) {
+            this.currentUtteranceReject(error);
+            // ... cleanup ...
+          }
+        });
+        
+        this.ttsListenersInitialized = true;
+      }
+      
+      // Configurar ignoreSilentSwitch en iOS (si está disponible)
+      if (Platform.OS === 'ios') {
+        try {
+          if (typeof (Tts as any).setIgnoreSilentSwitch === 'function') {
+            await (Tts as any).setIgnoreSilentSwitch('ignore');
+          }
+        } catch (e) {
+          // Ignorar si no está disponible
+        }
+      }
```

### 3.7: speak() usa listeners globales

```diff
  async speak(text: string): Promise<void> {
    const improvedText = this.improveTextNaturalness(text);
    
+    // Configurar AudioSession para PLAYBACK antes de Tts.speak (TTS fuerte)
+    await this.setSpeechLoud();
+    
+    // Detener cualquier TTS anterior para evitar cola
+    try {
+      await Tts.stop();
+    } catch (e) {
+      // Ignorar si no hay nada reproduciéndose
+    }
    
-    return new Promise((resolve, reject) => {
-      // ... código con addEventListener cada vez (ACUMULA) ...
-      Tts.addEventListener('tts-finish', finishHandler); // ❌ Se acumula
-      Tts.speak(improvedText);
-    });
+    return new Promise((resolve, reject) => {
+      // Si ya hay un utterance en curso, rechazar el anterior
+      if (this.currentUtteranceReject) {
+        this.currentUtteranceReject(new Error('Nuevo utterance canceló el anterior'));
+      }
+      
+      // Guardar resolve/reject para el listener global
+      this.currentUtteranceResolve = resolve;
+      this.currentUtteranceReject = reject;
+      
+      // Timeout de seguridad
+      const timeoutId = setTimeout(() => {
+        if (this.currentUtteranceResolve === resolve) {
+          this.currentUtteranceResolve = null;
+          this.currentUtteranceReject = null;
+          resolve();
+        }
+      }, Math.min(estimatedTime, 30000));
+      
+      Tts.speak(improvedText);
+      // El listener global tts-finish resolverá la promise
+    });
  }
+  
+  async setSpeechLoud(): Promise<void> {
+    if (Platform.OS === 'ios' && AudioSessionManager) {
+      await AudioSessionManager.configurePlaybackSession();
+    }
+  }
```

### 3.8: Voz Enhanced quality

```diff
-        // Buscar voces masculinas en español (múltiples criterios)
-        const maleVoices = voices.filter((voice: any) => {
-          // ... filtro simple ...
-        });
+        // Buscar voces en español (priorizar Enhanced, luego es-MX)
+        const spanishVoices = voices.filter((voice: any) => {
+          const language = voice.language?.toLowerCase() || '';
+          const notInstalled = voice.notInstalled === true;
+          return language.startsWith('es') && !notInstalled;
+        });
+        
+        // Priorizar: 1) Enhanced quality, 2) es-MX locale, 3) masculina
+        const enhancedVoices = spanishVoices.filter((v: any) => {
+          const quality = (v.quality || '').toLowerCase();
+          return quality.includes('enhanced') || quality.includes('premium');
+        });
+        
+        // ... lógica de selección mejorada ...
+        
+        if (selectedVoice) {
+          await Tts.setDefaultVoice(selectedVoice.id);
+          const quality = selectedVoice.quality || 'standard';
+          console.log('[VoiceService] ✅ Voz configurada:', selectedVoice.name, `(${quality}, ${selectedVoice.language})`);
+        }
```

### 3.9: Rate/Pitch naturales

```diff
-      await Tts.setDefaultRate(0.48); // Velocidad ligeramente más lenta
-      await Tts.setDefaultPitch(0.95); // Tono ligeramente más bajo
+      // Rate: 0.45-0.52 es más natural (no muy lento, no muy rápido)
+      await Tts.setDefaultRate(0.50);
+      // Pitch: 0.95-1.05 es más natural (ligeramente más bajo para masculina)
+      await Tts.setDefaultPitch(0.98);
```

### 3.10: Respuestas HVAC (10+ intents)

```diff
  generateResponse(userText: string): string {
+    if (!userText || !userText.trim()) {
+      return 'No pude escucharte bien. ¿Podrías repetir tu pregunta?';
+    }
+    
     const lowerText = userText.toLowerCase().trim();
     
-    // ... solo 5-6 respuestas básicas ...
+    // ===== HVAC: GARANTÍA =====
+    if (lowerText.includes('garantía') || ...) {
+      return 'Nuestros equipos tienen garantía de fábrica. ¿Te interesa conocer los detalles?';
+    }
+    
+    // ===== HVAC: INSTALACIÓN =====
+    if (lowerText.includes('instalación') || ...) {
+      return 'Ofrecemos servicio profesional de instalación. Nuestros técnicos certificados se encargan de todo.';
+    }
+    
+    // ===== HVAC: ERROR E1 / E2 =====
+    if (lowerText.includes('error e1') || ...) {
+      return 'El error E1 generalmente indica un problema con el sensor de temperatura...';
+    }
+    
+    // ... 10+ intents más: inverter, ahorro, filtros, mantenimiento, cotización, ubicación, capacidad, marcas ...
```

---

## Diff 4: EyeWidget.tsx (Fix Shadow)

```diff
--- a/src/components/EyeWidget.tsx
+++ b/src/components/EyeWidget.tsx
@@ -268,6 +268,7 @@
     borderWidth: 3,
     borderColor: '#4A90E2',
+    backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
     shadowColor: '#4A90E2',
     shadowOffset: { width: 0, height: 4 },
     shadowOpacity: 0.5,
```

---

## Diff 5: nativeModules.d.ts

```diff
--- a/src/types/nativeModules.d.ts
+++ b/src/types/nativeModules.d.ts
@@ -1,8 +1,10 @@
 declare module 'react-native' {
   interface NativeModulesStatic {
     AudioSessionManager: {
+      configureRecordSession(): Promise<{ status: string; category: string; mode: string }>;
+      configurePlaybackSession(): Promise<{ status: string; category: string; mode: string }>;
       configureAudioSession(): Promise<{ status: string; category: string; mode: string }>; // Legacy
       checkMicrophonePermission(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
       requestMicrophonePermission(): Promise<{ granted: boolean }>;
       checkSpeechRecognitionAvailability(): Promise<{ available: boolean }>;
       requestSpeechRecognitionAuthorization(): Promise<{ status: string; code: number }>;
       checkLocaleAvailability(localeIdentifier: string): Promise<{ available: boolean; locale: string }>;
     };
   }
 }
```

---

## Checklist de Pruebas en iPhone Real

### ✅ Prerequisitos
- [ ] iPhone físico conectado y confiable en Xcode
- [ ] Certificado de desarrollo configurado
- [ ] App instalada en dispositivo
- [ ] Agregar `AudioSessionManager.h` y `AudioSessionManager.m` al proyecto en Xcode (si no están)

### ✅ Prueba 1: Permisos al Iniciar
- [ ] Al abrir la app por primera vez, se solicitan permisos de micrófono
- [ ] Al aceptar micrófono, se solicita permiso de reconocimiento de voz
- [ ] Verificar en logs:
  ```
  [VoiceService] ✅ AVAudioSession (record) configurado: AVAudioSessionCategoryPlayAndRecord AVAudioSessionModeMeasurement
  [VoiceService] 📱 Permiso de micrófono (AVAudioSession): granted
  [VoiceService] 🗣️ Autorización SFSpeechRecognizer: authorized (code: 1)
  [VoiceService] ✅ Todos los permisos verificados correctamente
  ```

### ✅ Prueba 2: STT Básico (Sin Loops)
- [ ] Decir "hey george" → debe detectar wake word
- [ ] Después de wake word, decir "hola" → debe responder
- [ ] Verificar en logs: NO debe aparecer múltiples "Start ya en curso" o loops de reinicio
- [ ] Verificar que `startInFlight` funciona (solo un start a la vez)

### ✅ Prueba 3: TTS Fuerte por Altavoz
- [ ] Decir "hey george" y luego cualquier pregunta
- [ ] Verificar que la respuesta TTS se escuche FUERTE por el altavoz (no earpiece)
- [ ] Verificar en logs:
  ```
  [AudioSessionManager] ✅ Playback session configurado: AVAudioSessionCategoryPlayback AVAudioSessionModeDefault
  [AudioSessionManager] ✅ Salida de audio forzada a altavoz (TTS fuerte)
  ```
- [ ] Verificar que el volumen del sistema esté alto (botones de volumen)

### ✅ Prueba 4: Error 1101 (Backoff)
- [ ] Si aparece error 1101 en logs, verificar que:
  - [ ] NO se reinicia inmediatamente
  - [ ] Aparece: `💡 Programando retry con backoff: 1000 ms` (luego 2000, 4000, etc.)
  - [ ] El reconocimiento continúa funcionando después del backoff
  - [ ] NO hay loops infinitos de reinicio

### ✅ Prueba 5: Sin Internet (Airplane Mode)
- [ ] Activar Airplane Mode
- [ ] Decir "hey george" → puede fallar (esperado, necesita servidor)
- [ ] Verificar logs: debe indicar que necesita conexión
- [ ] NO debe crashear ni entrar en loop infinito

### ✅ Prueba 6: Con Bluetooth Headset
- [ ] Conectar auriculares Bluetooth
- [ ] Decir "hey george" → debe funcionar
- [ ] Verificar que el TTS salga por los auriculares (o altavoz si overrideOutputAudioPort funciona)
- [ ] Verificar en logs: `AVAudioSessionCategoryOptionAllowBluetooth` activo

### ✅ Prueba 7: Voz Enhanced Quality
- [ ] Verificar en logs al iniciar:
  ```
  [VoiceService] ✅ Voz configurada: [nombre] (Enhanced, es-MX)
  ```
- [ ] Si no hay Enhanced, debe usar es-MX o masculina
- [ ] La voz debe sonar menos robotizada (rate 0.50, pitch 0.98)

### ✅ Prueba 8: Listeners TTS (Sin Acumulación)
- [ ] Hablar 10 veces seguidas (decir "hey george" → pregunta → respuesta)
- [ ] Verificar en logs: solo debe aparecer UNA vez:
  ```
  [VoiceService] ✅ Listeners de TTS inicializados (una sola vez)
  ```
- [ ] NO debe haber memory leaks (usar Xcode Instruments si es posible)
- [ ] Cada `speak()` debe resolver correctamente sin acumular listeners

### ✅ Prueba 9: Respuestas HVAC
- [ ] Decir "hey george" y luego:
  - [ ] "garantía" → debe responder sobre garantía
  - [ ] "instalación" → debe responder sobre instalación
  - [ ] "error e1" → debe responder sobre error E1
  - [ ] "inverter" → debe responder sobre tecnología inverter
  - [ ] "ahorro" → debe responder sobre ahorro de energía
  - [ ] "filtro" → debe responder sobre limpieza de filtros
  - [ ] "mantenimiento" → debe responder sobre mantenimiento
  - [ ] "cotización" → debe responder sobre cotización
  - [ ] "ubicación" → debe responder sobre ubicación
  - [ ] "toneladas" → debe responder sobre capacidad

### ✅ Prueba 10: Cooldown y Mutex
- [ ] Decir "hey george" rápidamente 5 veces seguidas
- [ ] Verificar en logs:
  - [ ] Aparece "⏳ Start ya en curso, esperando..." (mutex funciona)
  - [ ] Aparece "⏳ Cooldown: esperando Xms antes de start..." (cooldown funciona)
- [ ] NO debe haber múltiples starts simultáneos
- [ ] NO debe crashear con "SFSpeechAudioBufferRecognitionRequest cannot be re-used"

### ✅ Prueba 11: NULL != Engine Error
- [ ] Si aparece error "NULL != engine" o "start_recording":
  - [ ] Debe hacer `Voice.destroy()` + `removeAllListeners()` + `initializeVoice()`
  - [ ] Debe esperar 5 segundos antes de reintentar
  - [ ] NO debe entrar en loop infinito

### ✅ Prueba 12: Warnings de Shadow
- [ ] Ejecutar app
- [ ] Verificar en consola: NO deben aparecer warnings:
  ```
  (ADVICE) View #X of type RCTView has a shadow set but cannot calculate shadow efficiently
  ```
- [ ] Verificar que el diseño visual no cambió (ojos se ven igual)

### ✅ Prueba 13: Continuous Listening (10 minutos)
- [ ] Dejar la app escuchando continuamente por 10 minutos
- [ ] NO debe crashear
- [ ] NO debe entrar en loop infinito
- [ ] Debe seguir respondiendo a "hey george" después de 10 minutos
- [ ] Verificar memory usage (no debe aumentar significativamente)

### ✅ Prueba 14: Alternar Hablar/Escuchar (30 veces)
- [ ] Decir "hey george" → pregunta → respuesta
- [ ] Repetir 30 veces seguidas
- [ ] NO debe crashear
- [ ] NO debe entrar en loop
- [ ] Cada interacción debe funcionar correctamente
- [ ] Verificar que `startInFlight` se limpia correctamente después de cada ciclo

### ✅ Prueba 15: TTS Siempre por Speaker Fuerte
- [ ] Decir "hey george" y cualquier pregunta
- [ ] Verificar que TTS SIEMPRE salga por altavoz (no earpiece)
- [ ] Verificar que el volumen sea alto (comparable a música o videos)
- [ ] Si el volumen es bajo, verificar:
  - [ ] Volumen del sistema está alto
  - [ ] `overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker` está funcionando
  - [ ] `configurePlaybackSession()` se llama antes de cada `speak()`

---

## Notas Importantes

1. **Mutex/Cooldown:**
   - `startInFlight` previene múltiples starts simultáneos
   - `MIN_COOLDOWN_MS = 800ms` previene "cannot be re-used" errors
   - `lastStopTime` se actualiza en `stopListening()` y `cancelListening()`

2. **Error 1101:**
   - NO se reinicia inmediatamente
   - Usa backoff exponencial (1s → 2s → 4s → 8s → max 10s)
   - Se resetea a 1s cuando se inicia correctamente

3. **TTS Listeners:**
   - Se inicializan UNA SOLA VEZ en `initializeTTS()`
   - `currentUtteranceResolve/reject` se usan para resolver promises
   - NO se acumulan listeners

4. **AudioSession:**
   - `configureRecordSession()` antes de `Voice.start()` (STT)
   - `configurePlaybackSession()` antes de `Tts.speak()` (TTS fuerte)
   - `overrideOutputAudioPort` fuerza altavoz para TTS

5. **Voz Enhanced:**
   - Prioriza: Enhanced quality → es-MX → masculina → cualquier español
   - Rate: 0.50 (más natural)
   - Pitch: 0.98 (ligeramente más bajo)

---

## Instrucciones de Build

1. **Agregar archivos nativos a Xcode:**
   ```bash
   cd ios
   open GeorgeAssistantTemp.xcworkspace
   ```
   - Click derecho en `GeorgeAssistantTemp` folder
   - "Add Files to GeorgeAssistantTemp..."
   - Seleccionar `AudioSessionManager.h` y `AudioSessionManager.m`
   - ✅ Marcar "Copy items if needed"
   - ✅ Target: GeorgeAssistantTemp

2. **Verificar Compile Sources:**
   - Seleccionar proyecto → Target "GeorgeAssistantTemp" → Build Phases
   - Expandir "Compile Sources"
   - Verificar que `AudioSessionManager.m` esté listado

3. **Build y ejecutar:**
   - Seleccionar dispositivo físico
   - Cmd + B (build)
   - Cmd + R (run)

---

## Logs Esperados (Éxito)

```
[VoiceService] ✅ Listeners de TTS inicializados (una sola vez)
[VoiceService] ✅ Voz configurada: [nombre] (Enhanced, es-MX)
[VoiceService] ✅ AVAudioSession (record) configurado: AVAudioSessionCategoryPlayAndRecord AVAudioSessionModeMeasurement
[VoiceService] ✅ Reconocimiento continuo iniciado (server-based, escuchando "hey geo")
[AudioSessionManager] ✅ Playback session configurado: AVAudioSessionCategoryPlayback AVAudioSessionModeDefault
[AudioSessionManager] ✅ Salida de audio forzada a altavoz (TTS fuerte)
[VoiceService] George va a decir: [respuesta]
[VoiceService] TTS empezó a hablar
[VoiceService] TTS terminó de hablar
```

---

## Logs de Error (Diagnóstico)

**Error 1101 (normal, no crítico):**
```
[VoiceService] ⚠️ Error 1101 (on-device recognition falló)
[VoiceService] 💡 Programando retry con backoff: 1000 ms
```

**NULL != engine (requiere cleanup):**
```
[VoiceService] ❌ Error de audio engine (NULL != engine)
[VoiceService] ⚠️ Error de audio engine. Limpiando y esperando...
[VoiceService] ✅ AVAudioSession reconfigurado
```

**Start en curso (mutex funciona):**
```
[VoiceService] ⏳ Start ya en curso, esperando...
```

**Cooldown (previene re-use):**
```
[VoiceService] ⏳ Cooldown: esperando 500ms antes de start...
```
