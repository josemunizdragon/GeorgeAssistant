# API layer

## Base URL por defecto
`http://187.189.239.4:9698/api`

## Archivos

### Creados
- `src/config/storageKeys.ts` – Claves AsyncStorage (access_token, username, unique_guid, api_*).
- `src/services/configService.ts` – DEFAULT_CONFIG, load/saveConfiguration, getEffectiveBaseUrl/Timeout/UserAgent, customInventoryConfigEnabled.
- `src/services/api/Api.ts` – Instancia `api`, `cleanApi`, updateApiConfig, interceptores (request: Bearer token; response: 401 → refresh con uniqueGUID), login/logout/getStoredToken/getStoredUser.

### Modificados
- `package.json` – axios, @react-native-async-storage/async-storage.
- `App.tsx` – initApi() al montar.
- `src/contexts/SessionContext.tsx` – Al hidratar desde Keychain, escribe token/username/unique_guid en AsyncStorage para el interceptor.
- `src/navigation/AppNavigator.tsx` – Sin token: stack Auth + Settings; botón "Ajustes" en Auth.
- `src/screens/AuthScreen.tsx` – Usuario/contraseña, login desde Api, signIn(token, user).
- `src/screens/SettingsScreen.tsx` – Bloque API (baseUrl, timeout, userAgent, custom enabled), Guardar → updateApiConfig + Alert "Saved"; Logout → apiLogout + signOut.

### Eliminados
- `src/services/auth/AuthService.ts` – Sustituido por login en Api.ts.

## Comprobaciones
- **(a)** Abrir Settings antes de login: desde Auth, botón "Ajustes" en la barra.
- **(b)** Cambiar baseUrl: en Settings activar "Usar URL personalizada", editar Base URL, Guardar → Alert "Saved".
- **(c)** Login: usuario/contraseña, Sign In → Api.login (POST /auth/login con instancia limpia), luego signIn(token, user).
- **(d)** Interceptor añade token: peticiones con `api` llevan Authorization Bearer si hay access_token en AsyncStorage.
- **(e)** Refresh en 401: en 401 se llama POST /auth/token con uniqueGUID (cola isRefreshing + waitQueue), se guarda nuevo token y se reintenta la petición.
