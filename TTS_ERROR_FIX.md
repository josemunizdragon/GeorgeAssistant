# Fix: "tts-error is not a supported event type"

## Resumen
Corrección del bug donde `tts-error` no está soportado en iOS, causando crashes. Implementación de helper seguro y soporte multiplataforma.

---

## Archivos Modificados

1. `src/services/voice/VoiceService.ts`
2. `ios/GeorgeAssistantTemp/AudioSessionManager.m`
3. `android/app/src/main/java/com/georgeassistanttemp/AudioSessionManagerModule.kt` (NUEVO)
4. `android/app/src/main/java/com/georgeassistanttemp/AudioSessionManagerPackage.kt` (NUEVO)
5. `android/app/src/main/java/com/georgeassistanttemp/MainApplication.kt`
6. `src/types/nativeModules.d.ts`

---

## Diff 1: VoiceService.ts - safeAddTtsListener

```diff
+  /**
+   * Helper seguro para agregar listeners de TTS
+   * Maneja errores si el evento no está soportado
+   */
+  private safeAddTtsListener(eventName: 'tts-start' | 'tts-finish' | 'tts-cancel' | 'tts-error', handler: (...args: any[]) => void): boolean {
+    try {
+      // TypeScript puede quejarse, pero en runtime estos eventos pueden no estar disponibles
+      (Tts.addEventListener as any)(eventName, handler);
+      return true;
+    } catch (error: any) {
+      console.warn(`[VoiceService] ⚠️ Evento TTS '${eventName}' no soportado o error al registrar:`, error?.message || error);
+      return false;
+    }
+  }
```

---

## Diff 2: VoiceService.ts - initializeTTS (Listeners Seguros)

```diff
      // Inicializar listeners de TTS UNA SOLA VEZ (evitar acumulación)
      if (!this.ttsListenersInitialized) {
-        try {
-          // Listener de tts-start (solo logging)
-          Tts.addEventListener('tts-start', () => {
-            console.log('[VoiceService] TTS empezó a hablar');
-          });
-          
-          // Listener de tts-finish (resuelve promise actual)
-          Tts.addEventListener('tts-finish', () => {
-            if (this.currentUtteranceResolve) {
-              console.log('[VoiceService] TTS terminó de hablar');
-              this.currentUtteranceResolve();
-              this.currentUtteranceResolve = null;
-              this.currentUtteranceReject = null;
-            }
-          });
-          
-          // Listener de tts-cancel
-          Tts.addEventListener('tts-cancel', () => {
-            console.log('[VoiceService] TTS cancelado');
-            if (this.currentUtteranceResolve) {
-              this.currentUtteranceResolve();
-              this.currentUtteranceResolve = null;
-              this.currentUtteranceReject = null;
-            }
-          });
-          
-          // Listener de tts-error
-          Tts.addEventListener('tts-error', (error: any) => {
-            console.error('[VoiceService] TTS error:', error);
-            if (this.currentUtteranceReject) {
-              this.currentUtteranceReject(error);
-              this.currentUtteranceResolve = null;
-              this.currentUtteranceReject = null;
-            }
-          });
-          
-          this.ttsListenersInitialized = true;
-          console.log('[VoiceService] ✅ Listeners de TTS inicializados (una sola vez)');
-        } catch (e) {
-          console.warn('[VoiceService] Error al agregar listeners de TTS:', e);
-        }
+        // Listener de tts-start (solo logging) - soportado en iOS y Android
+        this.safeAddTtsListener('tts-start', () => {
+          console.log('[VoiceService] TTS empezó a hablar');
+        });
+        
+        // Listener de tts-finish (resuelve promise actual) - soportado en iOS y Android
+        this.safeAddTtsListener('tts-finish', () => {
+          if (this.currentUtteranceResolve) {
+            console.log('[VoiceService] TTS terminó de hablar');
+            this.currentUtteranceResolve();
+            this.currentUtteranceResolve = null;
+            this.currentUtteranceReject = null;
+          }
+        });
+        
+        // Listener de tts-cancel - soportado en iOS y Android
+        this.safeAddTtsListener('tts-cancel', () => {
+          console.log('[VoiceService] TTS cancelado');
+          if (this.currentUtteranceResolve) {
+            this.currentUtteranceResolve();
+            this.currentUtteranceResolve = null;
+            this.currentUtteranceReject = null;
+          }
+        });
+        
+        // Listener de tts-error - solo en Android (iOS no lo soporta)
+        if (Platform.OS === 'android') {
+          this.safeAddTtsListener('tts-error', (error: any) => {
+            console.error('[VoiceService] TTS error:', error);
+            if (this.currentUtteranceReject) {
+              this.currentUtteranceReject(error);
+              this.currentUtteranceResolve = null;
+              this.currentUtteranceReject = null;
+            }
+          });
+        }
+        
+        this.ttsListenersInitialized = true;
+        console.log('[VoiceService] ✅ Listeners de TTS inicializados (una sola vez)');
       }
```

---

## Diff 3: VoiceService.ts - speak() (No depende de tts-error)

```diff
  async speak(text: string): Promise<void> {
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
-      // Si ya hay un utterance en curso, rechazar el anterior
+      // Si ya hay un utterance en curso, resolver el anterior (no rechazar, solo limpiar)
      if (this.currentUtteranceResolve) {
+        console.log('[VoiceService] Cancelando utterance anterior por nuevo');
        this.currentUtteranceResolve();
        this.currentUtteranceResolve = null;
        this.currentUtteranceReject = null;
      }
      
      // Guardar resolve/reject para el listener global
      this.currentUtteranceResolve = resolve;
      this.currentUtteranceReject = reject;
      
      // Timeout de seguridad (máximo 30 segundos)
      const estimatedTime = Math.max(improvedText.length * 200, 3000);
+      let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
+        if (this.currentUtteranceResolve === resolve) {
+          console.warn('[VoiceService] Timeout esperando TTS, forzando resolución');
+          this.currentUtteranceResolve = null;
+          this.currentUtteranceReject = null;
+          resolve();
+        }
+        timeoutId = null;
+      }, Math.min(estimatedTime, 30000));
      
-      // Iniciar el habla con el texto mejorado
-      try {
-        Tts.speak(improvedText);
-        // El listener global tts-finish resolverá la promise
-      } catch (error: any) {
-        this.currentUtteranceResolve = null;
-        this.currentUtteranceReject = null;
-        clearTimeout(timeoutId);
-        reject(error);
-      }
+      // Iniciar el habla con el texto mejorado
+      // Si Tts.speak lanza error síncrono, rechazar inmediatamente
+      try {
+        Tts.speak(improvedText);
+        // El listener global tts-finish o tts-cancel resolverá la promise
+        // En Android, tts-error también puede rechazar (si está disponible)
+      } catch (error: any) {
+        // Error síncrono al llamar speak()
+        if (timeoutId) {
+          clearTimeout(timeoutId);
+          timeoutId = null;
+        }
+        this.currentUtteranceResolve = null;
+        this.currentUtteranceReject = null;
+        console.error('[VoiceService] Error síncrono al llamar Tts.speak():', error);
+        reject(error);
+      }
    });
  }
```

---

## Diff 4: AudioSessionManager.m - configurePlaybackSession (iOS)

```diff
// Configurar AVAudioSession para PLAYBACK (TTS - Text to Speech)
RCT_EXPORT_METHOD(configurePlaybackSession:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  AVAudioSession *audioSession = [AVAudioSession sharedInstance];
  
  // Configurar categoría solo para reproducción (playback)
-  // NO usar DefaultToSpeaker option con Playback (no aplica)
-  BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayback
-                                withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker
+  // NO usar DefaultToSpeaker option con Playback (no aplica, solo para PlayAndRecord)
+  BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayback
+                                withOptions:0
                                       error:&error];
  
  if (!success || error) {
    NSString *errorMsg = [NSString stringWithFormat:@"Error configurando categoría playback: %@", error.localizedDescription];
    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
    return;
  }
  
  // Configurar modo default para playback
  success = [audioSession setMode:AVAudioSessionModeDefault error:&error];
  if (!success || error) {
    NSLog(@"[AudioSessionManager] Error configurando modo default: %@", error.localizedDescription);
    // Continuar de todas formas
  }
  
+  // Activar la sesión PRIMERO
+  success = [audioSession setActive:YES error:&error];
+  if (!success || error) {
+    NSString *errorMsg = [NSString stringWithFormat:@"Error activando sesión playback: %@", error.localizedDescription];
+    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
+    return;
+  }
+  
  // Forzar salida por altavoz para mayor volumen en TTS
  // Esto debe hacerse DESPUÉS de setActive
  if (@available(iOS 10.0, *)) {
    NSError *overrideError = nil;
    [audioSession overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:&overrideError];
    if (overrideError) {
      NSLog(@"[AudioSessionManager] ⚠️ No se pudo forzar altavoz: %@", overrideError.localizedDescription);
    } else {
      NSLog(@"[AudioSessionManager] ✅ Salida de audio forzada a altavoz (TTS fuerte)");
    }
  }
  
-  // Activar la sesión
-  success = [audioSession setActive:YES error:&error];
-  if (!success || error) {
-    NSString *errorMsg = [NSString stringWithFormat:@"Error activando sesión playback: %@", error.localizedDescription];
-    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
-    return;
-  }
-  
  NSLog(@"[AudioSessionManager] ✅ Playback session configurado: %@ mode: %@", audioSession.category, audioSession.mode);
  resolve(@{@"status": @"configured", @"category": audioSession.category, @"mode": audioSession.mode});
}
```

---

## Diff 5: AudioSessionManagerModule.kt (Android - NUEVO)

**Archivo creado:** `android/app/src/main/java/com/georgeassistanttemp/AudioSessionManagerModule.kt`

```kotlin
package com.georgeassistanttemp

import android.media.AudioManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class AudioSessionManagerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "AudioSessionManager"
    }

    /**
     * Activa o desactiva el speakerphone para TTS fuerte
     */
    @ReactMethod
    fun setSpeakerphoneOn(enabled: Boolean, promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(ReactApplicationContext.AUDIO_SERVICE) as? AudioManager
            
            if (audioManager == null) {
                promise.reject("AUDIO_SERVICE_ERROR", "AudioManager no disponible")
                return
            }
            
            // Configurar modo normal
            audioManager.mode = AudioManager.MODE_NORMAL
            
            // Activar/desactivar speakerphone
            audioManager.isSpeakerphoneOn = enabled
            
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("AUDIO_SESSION_ERROR", "Error configurando speakerphone: ${e.message}", e)
        }
    }
}
```

---

## Diff 6: AudioSessionManagerPackage.kt (Android - NUEVO)

**Archivo creado:** `android/app/src/main/java/com/georgeassistanttemp/AudioSessionManagerPackage.kt`

```kotlin
package com.georgeassistanttemp

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AudioSessionManagerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AudioSessionManagerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

---

## Diff 7: MainApplication.kt (Android)

```diff
--- a/android/app/src/main/java/com/georgeassistanttemp/MainApplication.kt
+++ b/android/app/src/main/java/com/georgeassistanttemp/MainApplication.kt
@@ -15,7 +15,8 @@
       packageList =
         PackageList(this).packages.apply {
           // Packages that cannot be autolinked yet can be added manually here, for example:
           // add(MyReactNativePackage())
+          add(AudioSessionManagerPackage())
         },
     )
   }
```

---

## Diff 8: VoiceService.ts - setSpeechLoud() (Android support)

```diff
  async setSpeechLoud(): Promise<void> {
-    if (Platform.OS === 'ios' && AudioSessionManager) {
+    if (Platform.OS === 'ios' && AudioSessionManager?.configurePlaybackSession) {
       try {
         await AudioSessionManager.configurePlaybackSession();
         console.log('[VoiceService] 🔊 Playback session configurado (TTS fuerte)');
       } catch (error) {
         console.error('[VoiceService] ❌ Error configurando playback session:', error);
         console.log('[VoiceService] 💡 Sugerencia: Verifica que el volumen del sistema esté alto');
       }
+    } else if (Platform.OS === 'android' && AudioSessionManager) {
+      try {
+        // TypeScript puede no reconocer setSpeakerphoneOn, pero existe en runtime en Android
+        const setSpeakerphoneOn = (AudioSessionManager as any).setSpeakerphoneOn;
+        if (typeof setSpeakerphoneOn === 'function') {
+          await setSpeakerphoneOn(true);
+          console.log('[VoiceService] 🔊 Speakerphone activado (TTS fuerte en Android)');
+        } else {
+          console.warn('[VoiceService] ⚠️ setSpeakerphoneOn no disponible en AudioSessionManager');
+        }
+      } catch (error) {
+        console.error('[VoiceService] ❌ Error activando speakerphone:', error);
+      }
     }
   }
```

---

## Diff 9: nativeModules.d.ts

```diff
--- a/src/types/nativeModules.d.ts
+++ b/src/types/nativeModules.d.ts
@@ -1,12 +1,14 @@
 declare module 'react-native' {
   interface NativeModulesStatic {
     AudioSessionManager: {
-      configureRecordSession(): Promise<{ status: string; category: string; mode: string }>;
-      configurePlaybackSession(): Promise<{ status: string; category: string; mode: string }>;
-      configureAudioSession(): Promise<{ status: string; category: string; mode: string }>; // Legacy
-      checkMicrophonePermission(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
-      requestMicrophonePermission(): Promise<{ granted: boolean }>;
-      checkSpeechRecognitionAvailability(): Promise<{ available: boolean }>;
-      requestSpeechRecognitionAuthorization(): Promise<{ status: string; code: number }>;
-      checkLocaleAvailability(localeIdentifier: string): Promise<{ available: boolean; locale: string }>;
+      // iOS methods (optional porque puede no estar disponible en Android)
+      configureRecordSession?(): Promise<{ status: string; category: string; mode: string }>;
+      configurePlaybackSession?(): Promise<{ status: string; category: string; mode: string }>;
+      configureAudioSession?(): Promise<{ status: string; category: string; mode: string }>; // Legacy
+      checkMicrophonePermission?(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
+      requestMicrophonePermission?(): Promise<{ granted: boolean }>;
+      checkSpeechRecognitionAvailability?(): Promise<{ available: boolean }>;
+      requestSpeechRecognitionAuthorization?(): Promise<{ status: string; code: number }>;
+      checkLocaleAvailability?(localeIdentifier: string): Promise<{ available: boolean; locale: string }>;
+      // Android methods (optional porque puede no estar disponible en iOS)
+      setSpeakerphoneOn?(enabled: boolean): Promise<boolean>;
     };
   }
 }
```

---

## Checklist de Pruebas

### ✅ iOS

1. **TTS sin tts-error:**
   - [ ] Ejecutar app en iPhone
   - [ ] Decir "hey george" y cualquier pregunta
   - [ ] Verificar que NO aparece error "tts-error is not a supported event type"
   - [ ] Verificar que TTS funciona correctamente
   - [ ] Verificar en logs:
     ```
     [VoiceService] ✅ Listeners de TTS inicializados (una sola vez)
     [VoiceService] TTS empezó a hablar
     [VoiceService] TTS terminó de hablar
     ```

2. **TTS Fuerte:**
   - [ ] Verificar que TTS sale por altavoz (no earpiece)
   - [ ] Verificar en logs:
     ```
     [AudioSessionManager] ✅ Playback session configurado: AVAudioSessionCategoryPlayback AVAudioSessionModeDefault
     [AudioSessionManager] ✅ Salida de audio forzada a altavoz (TTS fuerte)
     ```

3. **Listeners no se acumulan:**
   - [ ] Hablar 10 veces seguidas
   - [ ] Verificar que solo aparece UNA vez: "Listeners de TTS inicializados (una sola vez)"
   - [ ] NO debe haber memory leaks

### ✅ Android

1. **TTS con tts-error (opcional):**
   - [ ] Ejecutar app en Android
   - [ ] Decir "hey george" y cualquier pregunta
   - [ ] Verificar que tts-error se registra correctamente (si está disponible)
   - [ ] Si tts-error no está disponible, debe hacer console.warn pero NO crashear

2. **TTS Fuerte (Speakerphone):**
   - [ ] Verificar que TTS sale por altavoz
   - [ ] Verificar en logs:
     ```
     [VoiceService] 🔊 Speakerphone activado (TTS fuerte en Android)
     ```

3. **Compilación:**
   - [ ] `cd android && ./gradlew assembleDebug` debe compilar sin errores
   - [ ] Verificar que `AudioSessionManagerModule` y `AudioSessionManagerPackage` están en el build

---

## Notas Importantes

1. **tts-error:**
   - iOS: NO está soportado, se ignora silenciosamente
   - Android: Se intenta registrar, si falla se ignora con console.warn
   - `speak()` NO depende de tts-error para funcionar

2. **AudioSession iOS:**
   - `configurePlaybackSession()`: category `Playback` (sin `DefaultToSpeaker` option)
   - `overrideOutputAudioPort(Speaker)` se llama DESPUÉS de `setActive` para forzar altavoz

3. **AudioSession Android:**
   - `setSpeakerphoneOn(true)` activa el speakerphone para TTS
   - Solo se usa para TTS, NO para STT (STT usa configuración por defecto)

4. **safeAddTtsListener:**
   - Maneja errores si el evento no está disponible
   - Retorna `true` si se registró, `false` si falló
   - NO crashea la app si el evento no existe

---

## Instrucciones de Build

### iOS
No requiere cambios adicionales (los archivos ya están en el proyecto).

### Android
1. **Verificar que los archivos Kotlin estén en el proyecto:**
   - `android/app/src/main/java/com/georgeassistanttemp/AudioSessionManagerModule.kt`
   - `android/app/src/main/java/com/georgeassistanttemp/AudioSessionManagerPackage.kt`

2. **Build:**
   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleDebug
   ```

3. **Verificar que compile sin errores**

---

## Logs Esperados

### iOS (Éxito)
```
[VoiceService] ✅ Listeners de TTS inicializados (una sola vez)
[VoiceService] 🔊 Playback session configurado (TTS fuerte)
[AudioSessionManager] ✅ Playback session configurado: AVAudioSessionCategoryPlayback AVAudioSessionModeDefault
[AudioSessionManager] ✅ Salida de audio forzada a altavoz (TTS fuerte)
[VoiceService] TTS empezó a hablar
[VoiceService] TTS terminó de hablar
```

### Android (Éxito)
```
[VoiceService] ✅ Listeners de TTS inicializados (una sola vez)
[VoiceService] 🔊 Speakerphone activado (TTS fuerte en Android)
[VoiceService] TTS empezó a hablar
[VoiceService] TTS terminó de hablar
```

### iOS (Si tts-error se intenta - NO debe aparecer)
```
[VoiceService] ⚠️ Evento TTS 'tts-error' no soportado o error al registrar: [mensaje]
```
**Nota:** Este warning NO debe aparecer porque tts-error solo se registra en Android.
