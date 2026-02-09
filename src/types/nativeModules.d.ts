declare module 'react-native' {
  interface NativeModulesStatic {
    AudioSessionManager: {
      // iOS methods
      configureRecordSession?(): Promise<{ status: string; category: string; mode: string }>;
      configurePlaybackSession?(): Promise<{ status: string; category: string; mode: string }>;
      configureAudioSession?(): Promise<{ status: string; category: string; mode: string }>; // Legacy
      checkMicrophonePermission?(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
      requestMicrophonePermission?(): Promise<{ granted: boolean }>;
      checkSpeechRecognitionAvailability?(): Promise<{ available: boolean }>;
      requestSpeechRecognitionAuthorization?(): Promise<{ status: string; code: number }>;
      checkLocaleAvailability?(localeIdentifier: string): Promise<{ available: boolean; locale: string }>;
      // Android methods
      setSpeakerphoneOn?(enabled: boolean): Promise<boolean>;
    };
  }
}

export {};
