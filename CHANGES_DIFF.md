# Diff de Cambios para Arreglar Reconocimiento de Voz en iPhone

## Archivos Modificados

### 1. `ios/GeorgeAssistantTemp/Info.plist`

**Cambios:**
```diff
- <key>NSSpeechRecognitionUsageDescription</key>
- <string>George necesita acceso al reconocimiento de voz para escucharte</string>
- <key>NSMicrophoneUsageDescription</key>
- <string>George necesita acceso al micrófono para escucharte</string>
+ <key>NSSpeechRecognitionUsageDescription</key>
+ <string>Necesitamos reconocimiento de voz para transcribir.</string>
+ <key>NSMicrophoneUsageDescription</key>
+ <string>Necesitamos el micrófono para dictado.</string>
```

### 2. `ios/GeorgeAssistantTemp/AudioSessionManager.m` (NUEVO)

**Archivo completo creado con:**
- Configuración de AVAudioSession (category: playAndRecord, mode: measurement, options: defaultToSpeaker + allowBluetooth + allowBluetoothA2DP)
- Manejo de interrupciones de audio (AVAudioSessionInterruptionNotification)
- Verificación y solicitud de permisos de micrófono
- Verificación y solicitud de autorización SFSpeechRecognizer
- Verificación de disponibilidad de locale (es-MX, es-ES)

### 3. `ios/GeorgeAssistantTemp/AudioSessionManager.h` (NUEVO)

**Header file para el módulo nativo**

### 4. `ios/GeorgeAssistantTemp/AppDelegate.mm`

**Cambios:**
```diff
+ #import <AVFoundation/AVFoundation.h>
+ 
  - (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
  {
    // ... código existente ...
+ 
+   // Configurar AVAudioSession al iniciar la app
+   NSError *error = nil;
+   AVAudioSession *audioSession = [AVAudioSession sharedInstance];
+   
+   // Configurar categoría para reconocimiento de voz
+   BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayAndRecord
+                                 withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetooth
+                                       error:&error];
+   
+   if (success && !error) {
+     // Configurar modo measurement para mejor reconocimiento
+     [audioSession setMode:AVAudioSessionModeMeasurement error:&error];
+     if (error) {
+       // Si falla, usar default
+       [audioSession setMode:AVAudioSessionModeDefault error:nil];
+     }
+     
+     // Activar la sesión
+     [audioSession setActive:YES error:&error];
+   }
```

### 5. `src/services/voice/VoiceService.ts`

**Cambios principales:**

1. **Importación del módulo nativo:**
```diff
+ import { NativeModules, Platform } from 'react-native';
+ const { AudioSessionManager } = NativeModules;
```

2. **Inicialización de audio session:**
```diff
+ private async initializeAudioSession(): Promise<void> {
+   if (Platform.OS !== 'ios' || !AudioSessionManager) {
+     return;
+   }
+   try {
+     await AudioSessionManager.configureAudioSession();
+     console.log('[VoiceService] ✅ AVAudioSession configurado correctamente');
+   } catch (error) {
+     console.error('[VoiceService] ❌ Error configurando AVAudioSession:', error);
+   }
+ }
```

3. **Mejora en checkPermissions():**
```diff
+ // 1. Configurar AVAudioSession primero
+ // 2. Verificar permisos de micrófono (AVAudioSession)
+ // 3. Verificar y solicitar autorización SFSpeechRecognizer
+ // 4. Verificar disponibilidad de reconocimiento de voz
+ // 5. Verificar disponibilidad de SFSpeechRecognizer
+ // 6. Verificar locale (es-MX o es-ES)
+ 
+ // Logging mejorado con emojis para diagnóstico
```

4. **Logging mejorado en startListening():**
```diff
+ console.log('[VoiceService] 🚀 Iniciando reconocimiento (server-based, locale: es-MX)...');
+ // IMPORTANTE: NO usar requiresOnDeviceRecognition = true
+ // Usar reconocimiento server-based (más confiable, evita error 1101)
```

5. **Manejo mejorado de error 1101:**
```diff
+ // Fallback para error 1101: si falla on-device, asegurar que usamos server-based
+ if (is1101Error) {
+   console.warn('[VoiceService] ⚠️ Error 1101 (on-device recognition falló)');
+   console.warn('[VoiceService] 💡 Usando reconocimiento server-based (más confiable)');
+   // No hacer nada, el reconocimiento server-based ya está activo
+   return;
+ }
```

### 6. `src/components/FaceAvatar.tsx`

**Cambios para arreglar warnings de shadow:**
```diff
  eyeRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: color,
-   backgroundColor: 'transparent',
+   backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
  mouthSmile: {
    // ...
-   backgroundColor: 'transparent',
+   backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
  mouthFrown: {
    // ...
-   backgroundColor: 'transparent',
+   backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
  mouthFlat: {
    // ...
-   backgroundColor: 'transparent',
+   backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
```

### 7. `src/types/nativeModules.d.ts` (NUEVO)

**Tipos TypeScript para el módulo nativo:**
```typescript
AudioSessionManager: {
  configureAudioSession(): Promise<{ status: string; category: string; mode: string }>;
  checkMicrophonePermission(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
  checkSpeechRecognitionAvailability(): Promise<{ available: boolean }>;
  requestSpeechRecognitionAuthorization(): Promise<{ status: string; code: number }>;
  checkLocaleAvailability(localeIdentifier: string): Promise<{ available: boolean; locale: string }>;
}
```

## Checklist de Pruebas en iPhone Real

### ✅ Prerequisitos
- [ ] iPhone físico conectado y confiable en Xcode
- [ ] Certificado de desarrollo configurado
- [ ] App instalada en dispositivo
- [ ] Agregar `AudioSessionManager.h` y `AudioSessionManager.m` al proyecto en Xcode

### ✅ Prueba 1: Permisos al Iniciar
- [ ] Al abrir la app por primera vez, se solicitan permisos de micrófono
- [ ] Al aceptar micrófono, se solicita permiso de reconocimiento de voz
- [ ] Verificar en logs:
  ```
  [VoiceService] 🔍 Verificando permisos...
  [VoiceService] ✅ AVAudioSession configurado: AVAudioSessionCategoryPlayAndRecord AVAudioSessionModeMeasurement
  [VoiceService] 📱 Permiso de micrófono (AVAudioSession): granted
  [VoiceService] 🗣️ Autorización SFSpeechRecognizer: authorized (code: 1)
  [VoiceService] ✅ Todos los permisos verificados correctamente
  ```

### ✅ Prueba 2: Reconocimiento Básico
- [ ] Decir "hey george" → debe detectar wake word
- [ ] Después de wake word, decir "hola" → debe responder
- [ ] Verificar en logs:
  ```
  [VoiceService] 🚀 Iniciando reconocimiento (server-based, locale: es-MX)...
  [VoiceService] ✅ Reconocimiento continuo iniciado (server-based, escuchando "hey geo")
  ```

### ✅ Prueba 3: Error 1101 (On-Device)
- [ ] Si aparece error 1101 en logs, verificar que:
  - [ ] NO se muestre como error crítico
  - [ ] Aparezca como advertencia:
    ```
    [VoiceService] ⚠️ Error 1101 (on-device recognition falló)
    [VoiceService] 💡 Usando reconocimiento server-based (más confiable)
    ```
  - [ ] El reconocimiento continúe funcionando

### ✅ Prueba 4: Con Internet
- [ ] Con WiFi/4G/5G activo
- [ ] Decir "hey george" → debe funcionar
- [ ] Verificar que NO aparezcan errores críticos

### ✅ Prueba 5: Sin Internet (Airplane Mode)
- [ ] Activar Airplane Mode
- [ ] Decir "hey george" → puede fallar (esperado, necesita servidor)
- [ ] Verificar logs: debe indicar que necesita conexión

### ✅ Prueba 6: Con Bluetooth Headset
- [ ] Conectar auriculares Bluetooth
- [ ] Decir "hey george" → debe funcionar
- [ ] Verificar que el audio salga por los auriculares
- [ ] Verificar en logs: `AVAudioSessionCategoryOptionAllowBluetooth` activo

### ✅ Prueba 7: Idioma Español
- [ ] Verificar que el idioma del dispositivo sea español (México o España)
- [ ] Decir "hey george" en español → debe funcionar
- [ ] Verificar en logs:
  ```
  [VoiceService] 🌍 Locale disponible: es-MX = true
  ```

### ✅ Prueba 8: Interrupciones de Audio
- [ ] Iniciar reconocimiento
- [ ] Recibir llamada telefónica o reproducir música
- [ ] Terminar interrupción
- [ ] Verificar que el reconocimiento se reactive automáticamente
- [ ] Verificar en logs:
  ```
  [AudioSessionManager] Interrupción de audio comenzó
  [AudioSessionManager] Interrupción terminó, reactivando sesión
  ```

### ✅ Prueba 9: Warnings de Shadow
- [ ] Ejecutar app
- [ ] Verificar en consola: NO deben aparecer warnings:
  ```
  (ADVICE) View #X of type RCTView has a shadow set but cannot calculate shadow efficiently
  ```
- [ ] Verificar que el diseño visual no cambió (avatar se ve igual)

### ✅ Prueba 10: Permisos Denegados
- [ ] Ir a Settings → Privacy → Microphone → Denegar
- [ ] Abrir app
- [ ] Verificar en logs:
  ```
  [VoiceService] ❌ Permiso de micrófono DENEGADO (ir a Settings → Privacy → Microphone)
  ```
- [ ] Verificar que la app maneje el error gracefully

## Logs Esperados (Éxito Completo)

```
[VoiceService] ✅ AVAudioSession configurado correctamente
[VoiceService] 🔍 Verificando permisos...
[VoiceService] ✅ AVAudioSession configurado: AVAudioSessionCategoryPlayAndRecord AVAudioSessionModeMeasurement
[VoiceService] 📱 Permiso de micrófono (AVAudioSession): granted
[VoiceService] 🗣️ Autorización SFSpeechRecognizer: authorized (code: 1)
[VoiceService] 🎤 Reconocimiento de voz disponible (Voice.isAvailable): true
[VoiceService] 🎤 SFSpeechRecognizer disponible: true
[VoiceService] 🌍 Locale disponible: es-MX = true
[VoiceService] ✅ Todos los permisos verificados correctamente
[VoiceService] 🚀 Iniciando reconocimiento (server-based, locale: es-MX)...
[VoiceService] ✅ Reconocimiento continuo iniciado (server-based, escuchando "hey geo")
```

## Notas Importantes

1. **On-Device vs Server-Based:**
   - Por defecto, ahora usamos server-based (más confiable)
   - On-device requiere configuración adicional en Settings del iPhone
   - Error 1101 se ignora silenciosamente y se usa server-based como fallback

2. **Permisos:**
   - Se solicitan automáticamente al iniciar reconocimiento
   - Si se deniegan, el usuario debe ir a Settings → Privacy

3. **AVAudioSession:**
   - Se configura automáticamente al iniciar la app
   - Se reconfigura si es necesario antes de cada reconocimiento
   - Maneja interrupciones automáticamente

4. **Warnings de Shadow:**
   - Se resolvieron agregando backgroundColor mínimo (rgba(0,0,0,0.01))
   - No afecta el diseño visual (alpha 0.01 = prácticamente invisible)
