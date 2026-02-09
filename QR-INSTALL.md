# 📱 Instrucciones para probar en iPhone físico

## Método 1: Build directo (Recomendado)

1. **Conecta tu iPhone por USB** a la Mac
2. **Confía en esta computadora** en el iPhone (si aparece el popup)
3. **Abre Xcode** y abre el workspace:
   ```bash
   open ios/GeorgeAssistantTemp.xcworkspace
   ```
4. En Xcode, **selecciona tu iPhone** como destino (arriba, junto al botón Play)
5. **Ejecuta el build**:
   ```bash
   npx react-native run-ios --device
   ```
   O presiona **Cmd+R** en Xcode

## Método 2: Usar QR (solo si tienes Expo Go instalado)

**⚠️ Nota:** Este proyecto NO usa Expo, así que el QR solo funcionará si instalas Expo Go por separado. **Mejor usa el Método 1.**

Si aún así quieres el QR:

1. **Asegúrate de que Metro esté corriendo:**
   ```bash
   npm start
   ```

2. **Abre este link para ver el QR:**
   https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=http://10.1.1.158:8081

3. **Escanea el QR** con la cámara del iPhone
4. **Abre el link** en Safari (no funcionará sin Expo Go)

## URL de Metro

```
http://10.1.1.158:8081
```

**Importante:**
- iPhone y Mac deben estar en la **misma red WiFi**
- Metro debe estar corriendo (`npm start` o `npx react-native start`)
- Si cambias de red, actualiza la IP en el script `show-qr.js`

## Para obtener tu IP actual:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
```
