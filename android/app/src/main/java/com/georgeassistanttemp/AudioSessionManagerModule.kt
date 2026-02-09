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
