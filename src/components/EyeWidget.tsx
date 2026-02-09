import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface EyeWidgetProps {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
}

/**
 * Widget de ojos animados que reacciona al estado del asistente
 */
export const EyeWidget: React.FC<EyeWidgetProps> = ({
  isActive,
  isListening,
  isSpeaking,
}) => {
  const leftEyeScale = useRef(new Animated.Value(1)).current;
  const rightEyeScale = useRef(new Animated.Value(1)).current;
  const leftEyePosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const rightEyePosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const blinkAnimation = useRef(new Animated.Value(1)).current;

  // Animación de parpadeo constante
  useEffect(() => {
    const blink = () => {
      Animated.sequence([
        Animated.timing(blinkAnimation, {
          toValue: 0.1,
          duration: 100,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnimation, {
          toValue: 1,
          duration: 100,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Parpadear cada 3-5 segundos aleatoriamente
        const delay = 3000 + Math.random() * 2000;
        setTimeout(blink, delay);
      });
    };

    blink();
  }, [blinkAnimation]);

  // Animación cuando está activo
  useEffect(() => {
    if (isActive) {
      // Animación de "despertar" - los ojos se abren más
      Animated.parallel([
        Animated.spring(leftEyeScale, {
          toValue: 1.2,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(rightEyeScale, {
          toValue: 1.2,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Volver al tamaño normal
      Animated.parallel([
        Animated.spring(leftEyeScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(rightEyeScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, leftEyeScale, rightEyeScale]);

  // Animación cuando está activo - ojos se mueven por toda la pantalla
  useEffect(() => {
    if (isActive || isListening || isSpeaking) {
      const moveEyesRandomly = () => {
        // Rango mucho más amplio para movimiento por toda la pantalla
        // Considerando que los ojos están centrados, movemos en un rango grande
        const maxRangeX = 150; // Rango horizontal amplio
        const maxRangeY = 200; // Rango vertical amplio
        
        const randomX1 = (Math.random() - 0.5) * maxRangeX * 2;
        const randomY1 = (Math.random() - 0.5) * maxRangeY * 2;
        const randomX2 = (Math.random() - 0.5) * maxRangeX * 2;
        const randomY2 = (Math.random() - 0.5) * maxRangeY * 2;
        
        Animated.parallel([
          Animated.timing(leftEyePosition, {
            toValue: { x: randomX1, y: randomY1 },
            duration: 2500 + Math.random() * 1500, // Duración variable entre 2.5-4 segundos
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rightEyePosition, {
            toValue: { x: randomX2, y: randomY2 },
            duration: 2500 + Math.random() * 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (isActive || isListening || isSpeaking) {
            moveEyesRandomly();
          }
        });
      };
      moveEyesRandomly();
    } else {
      // Volver al centro cuando está inactivo
      Animated.parallel([
        Animated.timing(leftEyePosition, {
          toValue: { x: 0, y: 0 },
          duration: 500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(rightEyePosition, {
          toValue: { x: 0, y: 0 },
          duration: 500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, isListening, isSpeaking, leftEyePosition, rightEyePosition]);

  // Animación cuando está hablando - ojos parpadean más rápido
  useEffect(() => {
    if (isSpeaking) {
      const speakBlink = () => {
        Animated.sequence([
          Animated.timing(blinkAnimation, {
            toValue: 0.1,
            duration: 150,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnimation, {
            toValue: 1,
            duration: 150,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (isSpeaking) {
            const delay = 500 + Math.random() * 500;
            setTimeout(speakBlink, delay);
          }
        });
      };
      speakBlink();
    }
  }, [isSpeaking, blinkAnimation]);

  const renderEye = (
    scale: Animated.Value,
    position: Animated.ValueXY,
    side: 'left' | 'right'
  ) => {
    // Colores según el estado
    let eyeColor = '#666'; // Color por defecto (inactivo/gris)
    let pupilColor = '#333';
    
    if (isActive) {
      if (isListening) {
        eyeColor = '#4A90E2'; // Azul cuando está escuchando
        pupilColor = '#1A1A1A';
      } else if (isSpeaking) {
        eyeColor = '#34C759'; // Verde cuando está hablando
        pupilColor = '#1A1A1A';
      } else {
        // Si está activo pero no escuchando ni hablando, está pensando
        eyeColor = '#FF9500'; // Naranja cuando está pensando
        pupilColor = '#1A1A1A';
      }
    }

    return (
      <Animated.View
        style={[
          styles.eyeContainer,
          {
            transform: [
              { scaleX: scale },
              { scaleY: blinkAnimation },
              {
                translateX: position.x,
              },
              {
                translateY: position.y,
              },
            ],
          },
        ]}
      >
        <View style={[styles.eye, { backgroundColor: eyeColor }]}>
          <Animated.View
            style={[
              styles.pupil,
              {
                backgroundColor: pupilColor,
                transform: [
                  {
                    translateX: position.x.interpolate({
                      inputRange: [-300, 300],
                      outputRange: [-12, 12],
                    }),
                  },
                  {
                    translateY: position.y.interpolate({
                      inputRange: [-400, 400],
                      outputRange: [-12, 12],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.eyeWrapper, { left: '30%', top: '35%' }]}>
        {renderEye(leftEyeScale, leftEyePosition, 'left')}
      </View>
      <View style={[styles.eyeWrapper, { right: '30%', top: '35%' }]}>
        {renderEye(rightEyeScale, rightEyePosition, 'right')}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  eyeWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  eye: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#4A90E2',
    backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  pupil: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
