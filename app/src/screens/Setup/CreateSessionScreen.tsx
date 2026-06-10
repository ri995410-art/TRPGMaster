import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useGameStore } from '../../store/gameStore';
import { connectToServer, joinSession } from '../../hooks/useSocket';

export function CreateSessionScreen({ navigation }) {
  const [serverUrl, setServerUrl] = useState('http://192.168.3.57:3000');
  const [gmName, setGmName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!gmName.trim()) {
      setError('请输入GM名称');
      return;
    }

    setError('');
    setConnecting(true);
    try {
      await connectToServer(serverUrl);
      joinSession('gm', gmName);
      navigation.navigate('GMPanel');
    } catch (err: any) {
      setError('连接失败：' + (err?.message || '请检查服务器地址'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>创建会话</Text>
      <Text style={styles.subtitle}>作为GM主持一场跑团</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>服务器地址</Text>
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
        <Text style={styles.label}>GM名称</Text>
        <TextInput
          style={styles.input}
          value={gmName}
          onChangeText={setGmName}
          placeholder="输入你的名字"
          placeholderTextColor="#7f8c8d"
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, connecting && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={connecting}
      >
        <Text style={styles.buttonText}>
          {connecting ? '连接中...' : '创建并加入'}
        </Text>
      </TouchableOpacity>

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          提示：其他玩家需要连接到同一局域网，{'\n'}
          并输入此设备的IP地址加入会话
        </Text>
      </View>
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
    backgroundColor: '#8e44ad',
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
  hint: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#16213e',
    borderRadius: 8,
  },
  hintText: {
    color: '#7f8c8d',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
