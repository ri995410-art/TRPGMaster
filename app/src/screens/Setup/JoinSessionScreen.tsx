import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { connectToServer, joinSession } from '../../hooks/useSocket';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type JoinNavProp = NativeStackNavigationProp<RootStackParamList, 'JoinSession'>;

export function JoinSessionScreen({ navigation }: { navigation: JoinNavProp }) {
  const [serverUrl, setServerUrl] = useState('http://192.168.3.57:3000');
  const [playerName, setPlayerName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError('请输入玩家名称');
      return;
    }

    setError('');
    setConnecting(true);
    try {
      await connectToServer(serverUrl);
      joinSession('player', playerName);
      // Navigate to character creation, then to player sheet
      navigation.navigate('CharacterCreate');
    } catch (err: any) {
      setError('连接失败：' + (err?.message || '请检查服务器地址和GM是否已创建会话'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>加入会话</Text>
      <Text style={styles.subtitle}>作为玩家加入一场跑团</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>GM服务器地址</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.3.57:3000"
          placeholderTextColor="#7f8c8d"
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>玩家名称</Text>
        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="输入你的名字"
          placeholderTextColor="#7f8c8d"
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, connecting && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={connecting}
      >
        <Text style={styles.buttonText}>
          {connecting ? '连接中...' : '加入会话'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#ecf0f1',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: '#7f8c8d',
    fontSize: 16,
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#bdc3c7',
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    color: '#ecf0f1',
    fontSize: 16,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3498db',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
