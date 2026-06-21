import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { AdventureScreen } from '../screens/AdventureScreen';
import { CharacterScreen } from '../screens/CharacterScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CharacterCreateScreen } from '../screens/CharacterCreateScreen';
import { CharacterRosterScreen } from '../screens/CharacterRosterScreen';
import { SessionJoinScreen } from '../screens/SessionJoinScreen';
import { SessionLobbyScreen } from '../screens/SessionLobbyScreen';
import { CombatScreen } from '../screens/CombatScreen';
import { RestScreen } from '../screens/RestScreen';
import { LevelUpScreen } from '../screens/LevelUpScreen';

// ===== Tab Navigator (Main Game) =====

export type MainTabParamList = {
  Adventure: undefined;
  Character: undefined;
  Journal: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#0f0f23' },
        headerTintColor: '#ecf0f1',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: { backgroundColor: '#0f0f23', borderTopColor: '#16213e' },
        tabBarActiveTintColor: '#3498db',
        tabBarInactiveTintColor: '#7f8c8d',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          if (route.name === 'Adventure') {
            iconName = focused ? 'game-controller' : 'game-controller-outline';
          } else if (route.name === 'Character') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Journal') {
            iconName = focused ? 'book' : 'book-outline';
          } else {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Adventure" component={AdventureScreen} options={{ title: '冒险' }} />
      <Tab.Screen name="Character" component={CharacterScreen} options={{ title: '角色' }} />
      <Tab.Screen name="Journal" component={JournalScreen} options={{ title: '日志' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '设置' }} />
    </Tab.Navigator>
  );
}

// ===== Root Stack Navigator =====

export type RootStackParamList = {
  Home: undefined;
  Main: undefined;
  CharacterCreate: { campaignId?: string };
  CharacterRoster: undefined;
  SessionJoin: undefined;
  SessionLobby: { sessionCode: string; isHost: boolean };
  Combat: undefined;
  Rest: undefined;
  LevelUp: undefined;
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
          presentation: 'card',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'TRPGMaster', headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="CharacterCreate"
          component={CharacterCreateScreen}
          options={{ title: '创建角色' }}
        />
        <Stack.Screen
          name="CharacterRoster"
          component={CharacterRosterScreen}
          options={{ title: '角色列表' }}
        />
        <Stack.Screen
          name="SessionJoin"
          component={SessionJoinScreen}
          options={{ title: '多人游戏' }}
        />
        <Stack.Screen
          name="SessionLobby"
          component={SessionLobbyScreen}
          options={{ title: '等待大厅' }}
        />
        <Stack.Screen
          name="Combat"
          component={CombatScreen}
          options={{ title: '战斗', presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="Rest"
          component={RestScreen}
          options={{ title: '休整', presentation: 'modal' }}
        />
        <Stack.Screen
          name="LevelUp"
          component={LevelUpScreen}
          options={{ title: '升级', presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
