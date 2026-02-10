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

1. **Pod install** (requiere UTF-8 en el terminal):
   ```bash
   export LANG=en_US.UTF-8
   export LC_ALL=en_US.UTF-8
   cd ios && pod install && cd ..
   ```
2. **Simulador**: `npx react-native run-ios --simulator "iPhone 17"` (o el nombre de tu simulador).
3. **Dispositivo físico**: desbloquear el iPhone, confiar en el ordenador y tener instalada la Developer Disk Image que coincida con la versión de iOS del dispositivo. Si falla con "Timed out waiting for destinations", ejecutar para simulador o abrir el workspace en Xcode y seleccionar un destino disponible.

## Android

- Si **adb** no se encuentra: configurar `ANDROID_HOME` (p. ej. `~/Library/Android/sdk`) y que `$ANDROID_HOME/platform-tools` esté en el PATH.
- Si falla el plugin **com.facebook.react.settings** o **SelfResolvingDependency**: suele ser incompatibilidad Gradle / React Native. Revisar versiones en `android/build.gradle` y `gradle-wrapper.properties` según la doc de React Native 0.72.
- Con emulador o dispositivo conectado: `npx react-native run-android`.

## Flujo

1. Al abrir la app se hidrata la sesión desde Keychain.
2. Si no hay token → se muestra **AuthScreen**; al tocar "Entrar" se guarda sesión mock y se navega al asistente.
3. Si hay token → se muestra **Assistant** (George) con header "George" y botón "Ajustes" que lleva a **SettingsScreen**.
4. En Ajustes, "Cerrar sesión" llama a `signOut()` y se vuelve a Auth.
