import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useGameData } from './src/hooks/useGameData';

function App() {
  // Fetch game data (classes, weapons, etc.) from server when connected
  useGameData();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
