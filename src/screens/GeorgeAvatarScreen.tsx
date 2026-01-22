import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { AssistantState } from '../types/georgeMessages';
import { unityBridge } from '../services/unity/UnityBridge';
import { voiceService } from '../services/voice/VoiceService';
import { appConfig } from '../config/appConfig';
import { FaceAvatar } from '../components/FaceAvatar';

/**
 * Pantalla principal con el avatar de George (UnityView) y botón Push-to-talk
 */
export const GeorgeAvatarScreen: React.FC = () => {
  const [state, setState] = useState<AssistantState>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [unityLogs, setUnityLogs] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const wakeWordUnsubscribeRef = useRef<(() => void) | null>(null);

  /**
   * Inicia el reconocimiento continuo para detectar "hey geo"
   */
  const startContinuousListening = useCallback(async () => {
    try {
      await voiceService.startContinuousListening();
      console.log('[GeorgeAvatarScreen] Reconocimiento continuo iniciado');
    } catch (error) {
      console.error('[GeorgeAvatarScreen] Error al iniciar reconocimiento continuo:', error);
    }
  }, []);

  /**
   * Maneja cuando se detecta el wake word "hey geo"
   */
  const handleWakeWordDetected = useCallback(async () => {
    console.log('[GeorgeAvatarScreen] Activando George...');
    setIsActive(true);
    setState('listening');

    // Detener el reconocimiento continuo temporalmente
    await voiceService.stopListening();

    // Esperar un momento y luego escuchar directamente (sin saludo)
    setTimeout(async () => {
      try {
        // Escuchar directamente sin saludo - solo cambiar color o mostrar oído
        setState('listening');
        await voiceService.startListening();

        // Escuchar por máximo 5 segundos
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Detener escucha y obtener texto
        const userText = await voiceService.stopListening();
        console.log('[GeorgeAvatarScreen] Usuario dijo:', userText || '(sin texto reconocido)');

        // Generar y dar respuesta
        setState('thinking');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const responseText = userText
          ? voiceService.generateResponse(userText)
          : voiceService['addClosingPhrase']('No pude escuchar bien. ¿Podrías repetir tu pregunta?');

        setState('speaking');
        await voiceService.speak(responseText);

        // Volver a estado idle y reactivar reconocimiento continuo
        setState('idle');
        voiceService.resetWakeWord();
        await startContinuousListening();
      } catch (error) {
        console.error('[GeorgeAvatarScreen] Error en conversación después de wake word:', error);
        setState('idle');
        setIsActive(false);
        voiceService.resetWakeWord();
        await startContinuousListening();
      }
    }, 500);
  }, [startContinuousListening]);

  useEffect(() => {
    // Inicializar Unity al montar el componente
    unityBridge.send({
      type: 'INIT_ASSISTANT',
      name: appConfig.assistant.name,
      language: appConfig.assistant.language,
    });

    // Suscribirse a mensajes de Unity
    const unsubscribe = unityBridge.onMessage((message) => {
      console.log('[GeorgeAvatarScreen] Mensaje de Unity:', message);

      switch (message.type) {
        case 'ASSISTANT_READY':
          console.log('[GeorgeAvatarScreen] Unity está listo');
          break;
        case 'UNITY_LOG':
          setUnityLogs((prev) => [...prev, message.message].slice(-10)); // Mantener últimos 10 logs
          break;
        case 'UNITY_ERROR':
          console.error('[GeorgeAvatarScreen] Error de Unity:', message.message);
          setUnityLogs((prev) => [...prev, `ERROR: ${message.message}`].slice(-10));
          break;
      }
    });

    unsubscribeRef.current = unsubscribe;

    // Suscribirse al wake word "hey geo"
    const wakeWordUnsubscribe = voiceService.onWakeWord(() => {
      console.log('[GeorgeAvatarScreen] Wake word detectado!');
      handleWakeWordDetected();
    });

    wakeWordUnsubscribeRef.current = wakeWordUnsubscribe;

    // Iniciar reconocimiento continuo para detectar "hey geo"
    startContinuousListening();

    // Cleanup al desmontar
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (wakeWordUnsubscribeRef.current) {
        wakeWordUnsubscribeRef.current();
      }
      voiceService.cancelListening();
    };
  }, [handleWakeWordDetected, startContinuousListening]);

  /**
   * Maneja el botón Push-to-talk
   */
  const handlePressToTalk = async () => {
    if (isProcessing) {
      return; // Evitar múltiples clics
    }

    setIsProcessing(true);

    try {
      // Iniciar conversación con reconocimiento de voz y TTS reales
      await voiceService.simulateConversation(
        async (responseText) => {
          // Cuando George tiene una respuesta, enviar a Unity y hacer que hable
          setState('speaking');
          unityBridge.send({ type: 'SET_STATE', state: 'speaking' });
          unityBridge.send({
            type: 'GEORGE_SPEAK_START',
            text: responseText,
          });

          // El TTS ya está manejado dentro de simulateConversation
          // y espera hasta que termine de hablar

          // Terminar de hablar
          unityBridge.send({ type: 'GEORGE_SPEAK_END' });
          setState('idle');
          unityBridge.send({ type: 'SET_STATE', state: 'idle' });
          setIsProcessing(false);
        },
        (newState) => {
          // Actualizar estado local y enviar a Unity
          setState(newState);
          unityBridge.send({ type: 'SET_STATE', state: newState });
        }
      );
    } catch (error) {
      console.error('[GeorgeAvatarScreen] Error en conversación:', error);
      setState('idle');
      unityBridge.send({ type: 'SET_STATE', state: 'idle' });
      setIsProcessing(false);
    }
  };

  /**
   * Obtiene el texto del botón según el estado
   */
  const getButtonText = (): string => {
    switch (state) {
      case 'idle':
        return 'Hablar';
      case 'listening':
        return 'Escuchando...';
      case 'thinking':
        return 'Pensando...';
      case 'speaking':
        return 'Hablando...';
      default:
        return 'Hablar';
    }
  };

  /**
   * Obtiene el color del botón según el estado
   */
  const getButtonColor = (): string => {
    switch (state) {
      case 'idle':
        return '#007AFF';
      case 'listening':
        return '#FF9500';
      case 'thinking':
        return '#FF3B30';
      case 'speaking':
        return '#34C759';
      default:
        return '#007AFF';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Rostro completo del asistente - estructura facial completa */}
      <View style={styles.faceContainer}>
        {/* Avatar facial completo con ojos, cejas y boca */}
        <FaceAvatar
          isActive={isActive || state !== 'idle'}
          isListening={state === 'listening'}
          isSpeaking={state === 'speaking'}
          isThinking={state === 'thinking'}
        />
        
        {/* Elementos decorativos de aire acondicionado */}
        <View style={styles.decorativeElements}>
          <View style={styles.acIcon1} />
          <View style={styles.acIcon2} />
          <View style={styles.acIcon3} />
        </View>
      </View>

      {/* Botón removido - la interacción es solo por voz */}

      {/* Logs de Unity (solo en desarrollo) */}
      {__DEV__ && unityLogs.length > 0 && (
        <View style={styles.logsContainer}>
          <Text style={styles.logsTitle}>Unity Logs:</Text>
          {unityLogs.map((log, index) => (
            <Text key={index} style={styles.logText}>
              {log}
            </Text>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1929', // Fondo oscuro moderno tipo aire acondicionado
  },
  faceContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    // Gradiente sutil de fondo
    backgroundColor: '#0A1929',
  },
  decorativeElements: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.1,
  },
  acIcon1: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#4A90E2',
    borderStyle: 'dashed',
  },
  acIcon2: {
    position: 'absolute',
    top: '15%',
    right: '15%',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#34C759',
    borderStyle: 'dashed',
  },
  acIcon3: {
    position: 'absolute',
    bottom: '20%',
    left: '20%',
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 2,
    borderColor: '#FF9500',
    borderStyle: 'dashed',
  },
  logsContainer: {
    maxHeight: 150,
    padding: 10,
    backgroundColor: '#000',
    margin: 10,
    borderRadius: 8,
  },
  logsTitle: {
    color: '#FFF',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  logText: {
    color: '#0F0',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});

