# Fixes para Reconocimiento de Voz en iPhone Físico

## Resumen de Cambios

### 1. ✅ Módulo Nativo para AVAudioSession
**Archivos creados:**
- `ios/GeorgeAssistantTemp/AudioSessionManager.h`
- `ios/GeorgeAssistantTemp/AudioSessionManager.m`

**Funcionalidad:**
- Configura AVAudioSession con categoría `PlayAndRecord`
- Configura modo `Measurement` (óptimo para reconocimiento de voz)
- Opciones: `DefaultToSpeaker` + `AllowBluetooth`
- Métodos para verificar y solicitar permisos de micrófono
- Verificación de disponibilidad de SFSpeechRecognizer

### 2. ✅ Configuración en AppDelegate
**Archivo modificado:**
- `ios/GeorgeAssistantTemp/AppDelegate.mm`

**Cambios:**
- Configuración automática de AVAudioSession al iniciar la app
- Fallback a modo `Default` si `Measurement` falla

### 3. ✅ Mejoras en VoiceService.ts
**Archivo modificado:**
- `src/services/voice/VoiceService.ts`

**Cambios:**
- Integración con módulo nativo `AudioSessionManager`
- Verificación completa de permisos en runtime:
  - Permisos de micrófono (AVAudioSession)
  - Disponibilidad de reconocimiento de voz
  - Disponibilidad de SFSpeechRecognizer
- Logging mejorado con emojis para diagnóstico:
  - ✅ = Éxito
  - ❌ = Error crítico
  - ⚠️ = Advertencia
  - 💡 = Sugerencia/info
- Manejo mejorado de error 1101 (on-device recognition)
- Uso explícito de reconocimiento server-based (más confiable)

### 4. ✅ Permisos en Info.plist
**Archivo:**
- `ios/GeorgeAssistantTemp/Info.plist`

**Estado:** ✅ Ya configurado correctamente
- `NSMicrophoneUsageDescription` ✅
- `NSSpeechRecognitionUsageDescription` ✅

### 5. ✅ Warnings de Shadow
**Archivo modificado:**
- `src/components/FaceAvatar.tsx`

**Cambios:**
- Agregado `backgroundColor: 'rgba(0, 0, 0, 0.01)'` a vistas con shadow
- Mínimo alpha para permitir cálculo eficiente de shadow sin cambiar diseño visual

## Solución al Error 1101

**Problema:** Error 1101 = `kAFAssistantErrorDomain Code=1101` ocurre cuando iOS intenta usar reconocimiento on-device pero:
- El idioma no está descargado para dictado offline
- Dictado no está habilitado en Settings
- On-device recognition no está disponible

**Solución implementada:**
1. **Uso de reconocimiento server-based por defecto** (más confiable)
2. **Manejo silencioso de error 1101** (se ignora, no interrumpe el flujo)
3. **Logging informativo** cuando ocurre (no como error crítico)

## Checklist de Pruebas

### Prerequisitos
- [ ] iPhone físico conectado y confiable en Xcode
- [ ] Certificado de desarrollo configurado
- [ ] App instalada en dispositivo

### Prueba 1: Permisos
- [ ] Al abrir la app por primera vez, se solicitan permisos de micrófono
- [ ] Al aceptar, se solicita permiso de reconocimiento de voz
- [ ] Si se deniegan, la app muestra mensaje apropiado (verificar logs)

### Prueba 2: Reconocimiento Básico
- [ ] Decir "hey george" → debe detectar wake word
- [ ] Después de wake word, decir "hola" → debe responder
- [ ] Verificar en logs: `✅ Reconocimiento iniciado (server-based)`

### Prueba 3: Con Internet
- [ ] Con WiFi/4G/5G activo
- [ ] Decir "hey george" → debe funcionar
- [ ] Verificar que NO aparezcan errores 1101 críticos

### Prueba 4: Sin Internet (Airplane Mode)
- [ ] Activar Airplane Mode
- [ ] Decir "hey george" → puede fallar (esperado, necesita servidor)
- [ ] Verificar logs: debe indicar que necesita conexión

### Prueba 5: Con Bluetooth Headset
- [ ] Conectar auriculares Bluetooth
- [ ] Decir "hey george" → debe funcionar
- [ ] Verificar que el audio salga por los auriculares

### Prueba 6: Idioma Español
- [ ] Verificar que el idioma del dispositivo sea español (México o España)
- [ ] Decir "hey george" en español → debe funcionar
- [ ] Verificar en logs: `es-MX` o `es-ES`

### Prueba 7: Warnings de Shadow
- [ ] Ejecutar app
- [ ] Verificar en consola: NO deben aparecer warnings de shadow
- [ ] Verificar que el diseño visual no cambió

## Pasos para Integrar en Xcode

1. **Abrir proyecto en Xcode:**
   ```bash
   cd ios
   open GeorgeAssistantTemp.xcworkspace
   ```

2. **Agregar archivos nativos al proyecto:**
   - En Xcode, click derecho en `GeorgeAssistantTemp` folder
   - "Add Files to GeorgeAssistantTemp..."
   - Seleccionar:
     - `AudioSessionManager.h`
     - `AudioSessionManager.m`
   - ✅ Marcar "Copy items if needed"
   - ✅ Target: GeorgeAssistantTemp

3. **Verificar que los archivos estén en "Compile Sources":**
   - Seleccionar proyecto → Target "GeorgeAssistantTemp" → Build Phases
   - Expandir "Compile Sources"
   - Verificar que `AudioSessionManager.m` esté listado

4. **Build y ejecutar:**
   - Seleccionar dispositivo físico
   - Cmd + R para build y ejecutar

## Logs Esperados (Éxito)

```
[VoiceService] ✅ AVAudioSession configurado correctamente
[VoiceService] Permiso de micrófono: granted
[VoiceService] ✅ Permiso de micrófono otorgado
[VoiceService] Reconocimiento de voz disponible: true
[VoiceService] SFSpeechRecognizer disponible: true
[VoiceService] ✅ Reconocimiento continuo iniciado (server-based, escuchando "hey geo")
```

## Logs de Error (Diagnóstico)

Si aparece error 1101:
```
[VoiceService] ⚠️ Error 1101 (on-device recognition falló, usando server-based)
[VoiceService] 💡 Esto es normal si on-device no está disponible. El reconocimiento continuará con servidor.
```

Si falta permiso:
```
[VoiceService] ❌ Permiso de micrófono DENEGADO
```

Si AVAudioSession falla:
```
[VoiceService] ❌ Error configurando AVAudioSession: [detalles]
```

## Notas Importantes

1. **On-Device vs Server-Based:**
   - Por defecto, ahora usamos server-based (más confiable)
   - On-device requiere configuración adicional en Settings del iPhone
   - Error 1101 se ignora silenciosamente

2. **Permisos:**
   - Se solicitan automáticamente al iniciar reconocimiento
   - Si se deniegan, el usuario debe ir a Settings → Privacy → Microphone

3. **AVAudioSession:**
   - Se configura automáticamente al iniciar la app
   - Se reconfigura si es necesario antes de cada reconocimiento

4. **Warnings de Shadow:**
   - Se resolvieron agregando backgroundColor mínimo
   - No afecta el diseño visual (alpha 0.01 = prácticamente invisible)
