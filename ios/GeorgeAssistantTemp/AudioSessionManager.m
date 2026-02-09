#import "AudioSessionManager.h"
#import <AVFoundation/AVFoundation.h>

@implementation AudioSessionManager {
  BOOL _isConfigured;
}

RCT_EXPORT_MODULE();

- (instancetype)init {
  self = [super init];
  if (self) {
    _isConfigured = NO;
    [self setupInterruptionObserver];
  }
  return self;
}

// Observar interrupciones de audio
- (void)setupInterruptionObserver {
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleInterruption:)
                                               name:AVAudioSessionInterruptionNotification
                                             object:[AVAudioSession sharedInstance]];
}

- (void)handleInterruption:(NSNotification *)notification {
  NSNumber *typeValue = notification.userInfo[AVAudioSessionInterruptionTypeKey];
  AVAudioSessionInterruptionType type = typeValue.unsignedIntegerValue;
  
  if (type == AVAudioSessionInterruptionTypeBegan) {
    NSLog(@"[AudioSessionManager] Interrupción de audio comenzó");
  } else if (type == AVAudioSessionInterruptionTypeEnded) {
    NSNumber *optionsValue = notification.userInfo[AVAudioSessionInterruptionOptionKey];
    AVAudioSessionInterruptionOptions options = optionsValue.unsignedIntegerValue;
    
    if (options & AVAudioSessionInterruptionOptionShouldResume) {
      NSLog(@"[AudioSessionManager] Interrupción terminó, reactivando sesión");
      [self configureAudioSessionInternal];
    }
  }
}

// Configurar AVAudioSession para RECORDING (Speech Recognition)
RCT_EXPORT_METHOD(configureRecordSession:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  AVAudioSession *audioSession = [AVAudioSession sharedInstance];
  
  // Configurar categoría para grabación y reproducción
  // defaultToSpeaker: Fuerza el uso del altavoz (más volumen) en lugar del auricular
  AVAudioSessionCategoryOptions options = AVAudioSessionCategoryOptionDefaultToSpeaker | 
                                          AVAudioSessionCategoryOptionAllowBluetooth;
  
  // iOS 10+ soporta allowBluetoothA2DP
  if (@available(iOS 10.0, *)) {
    options |= AVAudioSessionCategoryOptionAllowBluetoothA2DP;
  }
  
  BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayAndRecord
                                withOptions:options
                                      error:&error];
  
  if (!success || error) {
    NSString *errorMsg = [NSString stringWithFormat:@"Error configurando categoría: %@", error.localizedDescription];
    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
    return;
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
    NSString *errorMsg = [NSString stringWithFormat:@"Error activando sesión: %@", error.localizedDescription];
    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
    return;
  }
  
  NSLog(@"[AudioSessionManager] ✅ Record session configurado: %@ mode: %@", audioSession.category, audioSession.mode);
  resolve(@{@"status": @"configured", @"category": audioSession.category, @"mode": audioSession.mode});
}

// Configurar AVAudioSession para PLAYBACK (TTS - Text to Speech)
RCT_EXPORT_METHOD(configurePlaybackSession:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  AVAudioSession *audioSession = [AVAudioSession sharedInstance];
  
  // Configurar categoría solo para reproducción (playback)
  // NO usar DefaultToSpeaker option con Playback (no aplica, solo para PlayAndRecord)
  BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayback
                                withOptions:0
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
  
  // Activar la sesión
  success = [audioSession setActive:YES error:&error];
  if (!success || error) {
    NSString *errorMsg = [NSString stringWithFormat:@"Error activando sesión playback: %@", error.localizedDescription];
    reject(@"AUDIO_SESSION_ERROR", errorMsg, error);
    return;
  }
  
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
  
  NSLog(@"[AudioSessionManager] ✅ Playback session configurado: %@ mode: %@", audioSession.category, audioSession.mode);
  resolve(@{@"status": @"configured", @"category": audioSession.category, @"mode": audioSession.mode});
}

// Método legacy para compatibilidad (usa record session)
RCT_EXPORT_METHOD(configureAudioSession:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self configureRecordSession:resolve rejecter:reject];
}

// Verificar permisos de micrófono
RCT_EXPORT_METHOD(checkMicrophonePermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  AVAudioSessionRecordPermission permission = [[AVAudioSession sharedInstance] recordPermission];
  
  NSString *status;
  switch (permission) {
    case AVAudioSessionRecordPermissionGranted:
      status = @"granted";
      break;
    case AVAudioSessionRecordPermissionDenied:
      status = @"denied";
      break;
    case AVAudioSessionRecordPermissionUndetermined:
      status = @"undetermined";
      break;
  }
  
  resolve(@{@"status": status});
}

// Solicitar permisos de micrófono
RCT_EXPORT_METHOD(requestMicrophonePermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [[AVAudioSession sharedInstance] requestRecordPermission:^(BOOL granted) {
    resolve(@{@"granted": @(granted)});
  }];
}

// Verificar disponibilidad de reconocimiento de voz
RCT_EXPORT_METHOD(checkSpeechRecognitionAvailability:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (@available(iOS 10.0, *)) {
    // Importar SFSpeechRecognizer dinámicamente
    Class SFSpeechRecognizerClass = NSClassFromString(@"SFSpeechRecognizer");
    if (SFSpeechRecognizerClass) {
      SEL availableSelector = NSSelectorFromString(@"available");
      if ([SFSpeechRecognizerClass respondsToSelector:availableSelector]) {
        BOOL available = ((BOOL (*)(id, SEL))[SFSpeechRecognizerClass methodForSelector:availableSelector])(SFSpeechRecognizerClass, availableSelector);
        resolve(@{@"available": @(available)});
        return;
      }
    }
  }
  
  resolve(@{@"available": @(NO)});
}

// Solicitar autorización de reconocimiento de voz
RCT_EXPORT_METHOD(requestSpeechRecognitionAuthorization:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (@available(iOS 10.0, *)) {
    Class SFSpeechRecognizerClass = NSClassFromString(@"SFSpeechRecognizer");
    SEL authorizationStatusSelector = NSSelectorFromString(@"authorizationStatus");
    SEL requestAuthorizationSelector = NSSelectorFromString(@"requestAuthorization:");
    
    if (SFSpeechRecognizerClass && 
        [SFSpeechRecognizerClass respondsToSelector:authorizationStatusSelector] &&
        [SFSpeechRecognizerClass respondsToSelector:requestAuthorizationSelector]) {
      
      // Obtener estado actual
      NSInteger status = ((NSInteger (*)(id, SEL))[SFSpeechRecognizerClass methodForSelector:authorizationStatusSelector])(SFSpeechRecognizerClass, authorizationStatusSelector);
      
      if (status == 0) { // SFSpeechRecognizerAuthorizationStatusNotDetermined
        // Solicitar autorización
        void (^handler)(NSInteger) = ^(NSInteger authStatus) {
          NSString *statusStr;
          switch (authStatus) {
            case 1: statusStr = @"authorized"; break;
            case 2: statusStr = @"denied"; break;
            case 3: statusStr = @"restricted"; break;
            default: statusStr = @"notDetermined"; break;
          }
          resolve(@{@"status": statusStr, @"code": @(authStatus)});
        };
        
        ((void (*)(id, SEL, void (^)(NSInteger)))[SFSpeechRecognizerClass methodForSelector:requestAuthorizationSelector])(SFSpeechRecognizerClass, requestAuthorizationSelector, handler);
      } else {
        NSString *statusStr;
        switch (status) {
          case 1: statusStr = @"authorized"; break;
          case 2: statusStr = @"denied"; break;
          case 3: statusStr = @"restricted"; break;
          default: statusStr = @"notDetermined"; break;
        }
        resolve(@{@"status": statusStr, @"code": @(status)});
      }
      return;
    }
  }
  
  resolve(@{@"status": @"notAvailable", @"code": @(-1)});
}

// Verificar locale disponible
RCT_EXPORT_METHOD(checkLocaleAvailability:(NSString *)localeIdentifier
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (@available(iOS 10.0, *)) {
    Class NSLocaleClass = NSClassFromString(@"NSLocale");
    Class SFSpeechRecognizerClass = NSClassFromString(@"SFSpeechRecognizer");
    
    if (NSLocaleClass && SFSpeechRecognizerClass) {
      SEL localeSelector = NSSelectorFromString(@"localeWithIdentifier:");
      SEL initSelector = NSSelectorFromString(@"initWithLocale:");
      SEL availableSelector = NSSelectorFromString(@"available");
      
      id locale = ((id (*)(id, SEL, NSString *))[NSLocaleClass methodForSelector:localeSelector])(NSLocaleClass, localeSelector, localeIdentifier);
      
      if (locale) {
        id recognizer = [[SFSpeechRecognizerClass alloc] init];
        if (recognizer && [recognizer respondsToSelector:initSelector]) {
          recognizer = ((id (*)(id, SEL, id))[recognizer methodForSelector:initSelector])(recognizer, initSelector, locale);
          
          if (recognizer && [recognizer respondsToSelector:availableSelector]) {
            BOOL available = ((BOOL (*)(id, SEL))[recognizer methodForSelector:availableSelector])(recognizer, availableSelector);
            resolve(@{@"available": @(available), @"locale": localeIdentifier});
            return;
          }
        }
      }
    }
  }
  
  resolve(@{@"available": @(NO), @"locale": localeIdentifier});
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end
