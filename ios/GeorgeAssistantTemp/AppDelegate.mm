#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <AVFoundation/AVFoundation.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"GeorgeAssistantTemp";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // Configurar AVAudioSession al iniciar la app
  NSError *error = nil;
  AVAudioSession *audioSession = [AVAudioSession sharedInstance];
  
  // Configurar categoría para reconocimiento de voz
  BOOL success = [audioSession setCategory:AVAudioSessionCategoryPlayAndRecord
                                withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetooth
                                      error:&error];
  
  if (success && !error) {
    // Configurar modo measurement para mejor reconocimiento
    [audioSession setMode:AVAudioSessionModeMeasurement error:&error];
    if (error) {
      // Si falla, usar default
      [audioSession setMode:AVAudioSessionModeDefault error:nil];
    }
    
    // Activar la sesión
    [audioSession setActive:YES error:&error];
  }

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end

