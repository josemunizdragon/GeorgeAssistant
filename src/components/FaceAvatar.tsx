import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface FaceAvatarProps {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
}

type FaceExpression =
  | 'normal'     // Sin cejas, ojos arcos abajo (sonrisa), boca sonriente
  | 'happy'      // Sin cejas, 2 arcos abajo, sonrisa amplia
  | 'tired'      // Cejas: 2 líneas que se encuentran; ojos igual
  | 'angry'      // Cejas fruncidas \ / ; ojos enojados
  | 'sad'        // Cejas tristes; ojos caídos; boca triste
  | 'worried';   // Cejas levantadas; ojos preocupados

const EXPRESSION_INTERVAL_MS = 2500;
const color = '#FFFFFF';

const glow = {
  shadowColor: color,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 1,
  shadowRadius: 10,
  elevation: 12,
  // backgroundColor ayuda a calcular shadow eficientemente (mínimo alpha)
  backgroundColor: 'rgba(0, 0, 0, 0.01)',
};

/**
 * Avatar con cejas y ojos que reflejan emociones: normal, feliz, cansado,
 * enojado, triste, preocupado. Normal = sin cejas.
 */
export const FaceAvatar: React.FC<FaceAvatarProps> = ({
  isActive,
  isListening,
  isSpeaking,
  isThinking,
}) => {
  const [currentExpression, setCurrentExpression] = useState<FaceExpression>('normal');
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let target: FaceExpression = 'normal';
    if (isThinking) target = 'worried';
    else if (isSpeaking) target = 'happy';
    else if (isListening) target = 'happy';
    else if (isActive) target = 'normal';

    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 100, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 100, easing: Easing.ease, useNativeDriver: true }),
    ]).start();
    setCurrentExpression(target);
  }, [isActive, isListening, isSpeaking, isThinking, fade]);

  useEffect(() => {
    const t = setInterval(() => {
      const options: FaceExpression[] = ['normal', 'happy', 'tired', 'angry', 'sad', 'worried'];
      const next = options[Math.floor(Math.random() * options.length)];
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 120, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 120, easing: Easing.ease, useNativeDriver: true }),
      ]).start();
      setCurrentExpression(next);
    }, EXPRESSION_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fade]);

  // Cejas: solo se muestran en tired, angry, sad, worried. Normal/happy = sin cejas.
  const renderEyebrows = () => {
    if (currentExpression === 'normal' || currentExpression === 'happy') return null;

    if (currentExpression === 'tired') {
      return (
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowLine, styles.eyebrowTiredLeft, glow, { marginRight: 56 }]} />
          <View style={[styles.eyebrowLine, styles.eyebrowTiredRight, glow]} />
        </View>
      );
    }
    if (currentExpression === 'angry') {
      return (
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowLine, styles.eyebrowAngryLeft, glow, { marginRight: 56 }]} />
          <View style={[styles.eyebrowLine, styles.eyebrowAngryRight, glow]} />
        </View>
      );
    }
    if (currentExpression === 'sad') {
      return (
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowLine, styles.eyebrowSadLeft, glow, { marginRight: 56 }]} />
          <View style={[styles.eyebrowLine, styles.eyebrowSadRight, glow]} />
        </View>
      );
    }
    if (currentExpression === 'worried') {
      return (
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowLine, styles.eyebrowWorriedLeft, glow, { marginRight: 56 }]} />
          <View style={[styles.eyebrowLine, styles.eyebrowWorriedRight, glow]} />
        </View>
      );
    }
    return null;
  };

  // Ojos: siempre 2 anillos grandes. La emoción la dan cejas + boca.
  const renderEyes = () => (
    <View style={styles.eyesRow}>
      <View style={[styles.eyeRing, glow, { marginRight: 56 }]} />
      <View style={[styles.eyeRing, glow]} />
    </View>
  );

  const renderMouth = () => {
    if (currentExpression === 'sad') {
      return <View style={[styles.mouthFrown, { borderColor: color }, glow]} />;
    }
    if (currentExpression === 'angry') {
      return <View style={[styles.mouthFlat, { borderColor: color }, glow]} />;
    }
    return <View style={[styles.mouthSmile, { borderColor: color }, glow]} />;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.oval, { borderColor: color }]}>
        <Animated.View style={[styles.inner, { opacity: fade }]}>
          <View style={styles.face}>
            {renderEyebrows()}
            {renderEyes()}
            {renderMouth()}
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  oval: {
    width: 360,
    height: 260,
    borderRadius: 130,
    borderWidth: 2.5,
    backgroundColor: '#0D1B2A',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  inner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  eyebrowLine: {
    width: 48,
    height: 4,
    backgroundColor: color,
    borderRadius: 2,
    // backgroundColor ayuda a calcular shadow eficientemente
  },
  eyebrowTiredLeft: {
    transform: [{ rotate: '-18deg' }],
  },
  eyebrowTiredRight: {
    transform: [{ rotate: '18deg' }],
  },
  eyebrowAngryLeft: {
    transform: [{ rotate: '-28deg' }],
  },
  eyebrowAngryRight: {
    transform: [{ rotate: '28deg' }],
  },
  eyebrowSadLeft: {
    transform: [{ rotate: '12deg' }],
  },
  eyebrowSadRight: {
    transform: [{ rotate: '-12deg' }],
  },
  eyebrowWorriedLeft: {
    transform: [{ rotate: '22deg' }],
  },
  eyebrowWorriedRight: {
    transform: [{ rotate: '-22deg' }],
  },
  eyesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  eyeRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: color,
    backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
  mouthSmile: {
    width: 96,
    height: 44,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    borderBottomWidth: 3,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
  mouthFrown: {
    width: 72,
    height: 36,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 3,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
  mouthFlat: {
    width: 56,
    height: 5,
    borderRadius: 2,
    borderWidth: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.01)', // Mínimo alpha para shadow calculation
  },
});
