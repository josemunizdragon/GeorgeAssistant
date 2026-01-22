/**
 * Tipos de mensajes para comunicación entre React Native y Unity
 */

// Estados del asistente
export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';

// Mensajes de RN -> Unity
export type GeorgeToUnityMessage =
  | {
      type: 'INIT_ASSISTANT';
      name: string;
      language: string;
    }
  | {
      type: 'GEORGE_SPEAK_START';
      text: string;
    }
  | {
      type: 'GEORGE_SPEAK_END';
    }
  | {
      type: 'SET_STATE';
      state: AssistantState;
    };

// Mensajes de Unity -> RN
export type UnityToGeorgeMessage =
  | {
      type: 'ASSISTANT_READY';
    }
  | {
      type: 'UNITY_LOG';
      message: string;
    }
  | {
      type: 'UNITY_ERROR';
      message: string;
    };

