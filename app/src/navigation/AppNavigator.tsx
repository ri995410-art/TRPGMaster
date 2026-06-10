import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateSessionScreen } from '../screens/Setup/CreateSessionScreen';
import { JoinSessionScreen } from '../screens/Setup/JoinSessionScreen';
import { SessionControlScreen } from '../screens/GM/SessionControlScreen';
import { CharacterSheetScreen } from '../screens/Player/CharacterSheetScreen';
import { CharacterCreateScreen } from '../screens/Setup/CharacterCreateScreen';
import { HomeScreen } from '../screens/Setup/HomeScreen';

export type RootStackParamList = {
  Home: undefined;
  CreateSession: undefined;
  JoinSession: undefined;
  CharacterCreate: undefined;
  GMPanel: undefined;
  PlayerSheet: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#0f0f23' },
          headerTintColor: '#ecf0f1',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0f0f23' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'TRPGMaster' }} />
        <Stack.Screen name="CreateSession" component={CreateSessionScreen} options={{ title: '创建会话' }} />
        <Stack.Screen name="CharacterCreate" component={CharacterCreateScreen} options={{ title: '创建角色' }} />
        <Stack.Screen name="JoinSession" component={JoinSessionScreen} options={{ title: '加入会话' }} />
        <Stack.Screen name="GMPanel" component={SessionControlScreen} options={{ title: 'GM控制台' }} />
        <Stack.Screen name="PlayerSheet" component={CharacterSheetScreen} options={{ title: '角色卡' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
