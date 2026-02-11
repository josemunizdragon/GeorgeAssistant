# Navegación y sesión

## Implementado

- **SessionContext** (`src/contexts/SessionContext.tsx`): `token`, `user`, `isHydrated`, `signIn()`, `signOut()`. Persistencia con `react-native-keychain`.
- **AppNavigator** (`src/navigation/AppNavigator.tsx`): rutas Auth → Assistant (George) → Settings.
- **AuthScreen**: login placeholder (signIn mock).
- **SettingsScreen**: ajustes + cerrar sesión.
- **App.tsx**: `SessionProvider` + `NavigationContainer` + `AppNavigator`.

## Dependencias añadidas

- `@react-navigation/native`, `@react-navigation/native-stack`
- `react-native-screens`, `react-native-safe-area-context`
- `react-native-keychain`

## iOS

### Error "No bundle URL present"
- **Causa**: El target de la app en **Debug** no tenía `DEBUG=1` en el preprocesador, así que en `AppDelegate` se usaba la rama Release y se buscaba `main.jsbundle` (que no existe en desarrollo).
- **Corrección**: Se añadió `DEBUG=1` a **GCC_PREPROCESSOR_DEFINITIONS** del target GeorgeAssistantTemp en la configuración Debug (`project.pbxproj`).
- **Scheme**: El scheme **GeorgeAssistantTemp** usa ya **Debug** para Run (LaunchAction); no hace falta cambiarlo.

### Nombres (comprobado)
- `app.json` → `name`: **GeorgeAssistantTemp**
- `index.js` → `AppRegistry.registerComponent(appName, () => App)` con `appName` de app.json
- `AppDelegate` → `moduleName = @"GeorgeAssistantTemp"`, `jsBundleURLForBundleRoot:@"index"`

### Cómo correr iOS en desarrollo

1. **Metro tiene que estar levantado** (la app en Debug pide el bundle al packager):
   ```bash
   yarn start
   ```
   Déjalo en una terminal.

2. **Limpieza (si hubo cambios de native o sigues con errores)**:
   ```bash
   export LANG=en_US.UTF-8
   export LC_ALL=en_US.UTF-8
   cd ios && rm -rf build Pods/build ~/Library/Developer/Xcode/DerivedData/GeorgeAssistantTemp-* && pod install && cd ..
   ```

3. **Ejecutar la app (otra terminal)**:
   ```bash
   npx react-native run-ios --simulator "iPhone 17"
   ```
   O sin especificar simulador (usa el por defecto):
   ```bash
   npx react-native run-ios
   ```
   Desde Xcode: abrir `ios/GeorgeAssistantTemp.xcworkspace`, elegir un simulador, **Product → Run** (usa Debug).

4. **Dispositivo físico**: desbloquear el iPhone, confiar en el ordenador y tener la Developer Disk Image correcta. Si falla "Timed out waiting for destinations", usar simulador o en Xcode elegir un destino disponible.

## Android

- Si **adb** no se encuentra: configurar `ANDROID_HOME` (p. ej. `~/Library/Android/sdk`) y que `$ANDROID_HOME/platform-tools` esté en el PATH.
- Si falla el plugin **com.facebook.react.settings** o **SelfResolvingDependency**: suele ser incompatibilidad Gradle / React Native. Revisar versiones en `android/build.gradle` y `gradle-wrapper.properties` según la doc de React Native 0.72.
- Con emulador o dispositivo conectado: `npx react-native run-android`.

## Flujo

1. Al abrir la app se hidrata la sesión desde Keychain.
2. Si no hay token → se muestra **AuthScreen**; al tocar "Entrar" se guarda sesión mock y se navega al asistente.
3. Si hay token → se muestra **Assistant** (George) con header "George" y botón "Ajustes" que lleva a **SettingsScreen**.
4. En Ajustes, "Cerrar sesión" llama a `signOut()` y se vuelve a Auth.
