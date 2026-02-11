import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SessionProvider } from './src/contexts/SessionContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initApi } from './src/services/api/Api';

/**
 * Componente principal: SessionProvider + navegación.
 */
const App: React.FC = () => {
  useEffect(() => {
    initApi();
  }, []);

  return (
    <SessionProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SessionProvider>
  );
};

export default App;
