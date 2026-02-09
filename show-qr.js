// Script para mostrar QR de Metro y instrucciones
const { execSync } = require('child_process');

const IP = '10.1.1.158';
const PORT = '8081';
const URL = `http://${IP}:${PORT}`;

console.log('\n📱 INSTRUCCIONES PARA PROBAR EN iPhone FÍSICO:\n');
console.log('═══════════════════════════════════════════════════\n');

console.log('OPCIÓN 1: Build directo (Recomendado)');
console.log('─────────────────────────────────────');
console.log('1. Conecta tu iPhone por USB a la Mac');
console.log('2. Abre Xcode');
console.log('3. Selecciona tu iPhone como destino');
console.log('4. Ejecuta: npx react-native run-ios --device');
console.log('   (o presiona Cmd+R en Xcode)\n');

console.log('OPCIÓN 2: Usar Metro URL (si tienes Expo Go)');
console.log('─────────────────────────────────────────────');
console.log(`URL de Metro: ${URL}\n`);

try {
  execSync(`npx -y qrcode-terminal "${URL}"`, { stdio: 'inherit' });
} catch (e) {
  console.log('QR Code:');
  console.log(`Escanea este URL: ${URL}`);
  console.log('\nO genera el QR aquí: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(URL));
}

console.log('\n═══════════════════════════════════════════════════\n');
console.log('⚠️  IMPORTANTE:');
console.log('   - Asegúrate de que Metro esté corriendo (npm start)');
console.log('   - iPhone y Mac deben estar en la misma red WiFi');
console.log('   - Si usas build directo, no necesitas el QR\n');
