import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SessionProvider } from './src/contexts/SessionContext';
import { AppNavigator } from './src/navigation/AppNavigator';

/**
 * Componente principal: SessionProvider + navegación.
 */
const App: React.FC = () => {
  return (
    <SessionProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SessionProvider>
  );
};

export default App;
