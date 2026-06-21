import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { connectToServer, getSocket, createSession, joinSessionByCode } from '../hooks/useSocket';

type SessionJoinNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SessionJoin'>;

interface Props {
  navigation: SessionJoinNavigationProp;
}

// Allowed characters for room code (excluding 0/O/1/I/l)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function SessionJoinScreen({ navigation }: Props) {
  const characters = useGameStore((s) => s.characters);
  const activeCharacterId = useGameStore((s) => s.activeCharacterId);
  const isConnected = useGameStore((s) => s.isConnected);
  const serverUrl = useGameStore((s) => s.serverUrl);

  const [roomCode, setRoomCode] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(activeCharacterId || '');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedCharacter = characters.find(c => c.id === selectedCharacterId);

  // Format room code input (uppercase, filter invalid chars, max 6)
  const handleCodeChange = (text: string) => {
    const filtered = text.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
    setRoomCode(filtered);
  };

  const handleJoin = async () => {
    if (roomCode.length < 6) {
      Alert.alert('房间码不完整', '请输入6位房间码');
      return;
    }
    if (!selectedCharacter) {
      Alert.alert('请选择角色', '加入房间前需要选择一个角色');
      return;
    }
    if (!isConnected) {
      Alert.alert('未连接服务器', '请先在首页连接服务器');
      return;
    }

    setJoining(true);
    try {
      const result = await joinSessionByCode(roomCode, selectedCharacter);
      navigation.navigate('SessionLobby', { sessionCode: result.code, isHost: false });
    } catch (err: any) {
      Alert.alert('加入失败', err.message || '无法加入房间');
    } finally {
      setJoining(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedCharacter) {
      Alert.alert('请选择角色', '创建房间前需要选择一个角色');
      return;
    }
    if (!isConnected) {
      Alert.alert('未连接服务器', '请先在首页连接服务器');
      return;
    }

    setCreating(true);
    try {
      const result = await createSession(selectedCharacter);
      navigation.navigate('SessionLobby', { sessionCode: result.code, isHost: true });
    } catch (err: any) {
      Alert.alert('创建失败', err.message || '无法创建房间');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="wifi" size={48} color="#e67e22" />
          <Text style={styles.title}>多人游戏</Text>
          <Text style={styles.subtitle}>与朋友一起探索德拉肯海姆</Text>
        </View>

        {/* Room code input */}
        <View style={styles.codeSection}>
          <Text style={styles.sectionTitle}>房间码</Text>
          <View style={styles.codeInputRow}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.codeBox}>
                <Text style={styles.codeChar}>
                  {roomCode[i] || ''}
                </Text>
              </View>
            ))}
          </View>
          <TextInput
            style={styles.codeHiddenInput}
            value={roomCode}
            onChangeText={handleCodeChange}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />
          <Text style={styles.codeHint}>输入6位房间码（不含0/O/1/I）</Text>
        </View>

        {/* Character selection */}
        <View style={styles.characterSection}>
          <Text style={styles.sectionTitle}>使用角色</Text>
          {characters.length === 0 ? (
            <View style={styles.noCharacter}>
              <Text style={styles.noCharacterText}>还没有角色，请先创建</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CharacterCreate', {})}>
                <Text style={styles.createLink}>创建角色</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.characterScroll}>
              {characters.map((char) => (
                <TouchableOpacity
                  key={char.id}
                  style={[
                    styles.characterChip,
                    char.id === selectedCharacterId && styles.characterChipSelected,
                  ]}
                  onPress={() => setSelectedCharacterId(char.id)}
                >
                  <Text style={[
                    styles.characterChipText,
                    char.id === selectedCharacterId && styles.characterChipTextSelected,
                  ]}>
                    {char.name} (Lv.{char.level})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.joinButton, (roomCode.length < 6 || !selectedCharacter || joining) && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={roomCode.length < 6 || !selectedCharacter || joining}
          >
            {joining ? (
              <ActivityIndicator size="small" color="#ecf0f1" />
            ) : (
              <>
                <Ionicons name="enter-outline" size={20} color="#ecf0f1" />
                <Text style={styles.joinButtonText}>加入房间</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或者</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.createButton, (!selectedCharacter || creating) && styles.buttonDisabled]}
            onPress={handleCreateRoom}
            disabled={!selectedCharacter || creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#ecf0f1" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#ecf0f1" />
                <Text style={styles.createButtonText}>创建新房间</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {!isConnected && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle" size={16} color="#e74c3c" />
            <Text style={styles.warningText}>请先在首页连接服务器</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: '#ecf0f1',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
  },
  subtitle: {
    color: '#7f8c8d',
    fontSize: 14,
    marginTop: 4,
  },
  // Code section
  codeSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  sectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  codeInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  codeBox: {
    width: 44,
    height: 52,
    backgroundColor: '#16213e',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  codeChar: {
    color: '#ecf0f1',
    fontSize: 24,
    fontWeight: 'bold',
  },
  codeHiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  codeHint: {
    color: '#7f8c8d',
    fontSize: 11,
    textAlign: 'center',
  },
  // Character section
  characterSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  noCharacter: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  noCharacterText: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  createLink: {
    color: '#9b59b6',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 8,
  },
  characterScroll: {
    maxHeight: 50,
  },
  characterChip: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  characterChipSelected: {
    backgroundColor: '#e67e2222',
    borderColor: '#e67e22',
  },
  characterChipText: {
    color: '#bdc3c7',
    fontSize: 13,
  },
  characterChipTextSelected: {
    color: '#e67e22',
    fontWeight: 'bold',
  },
  // Actions
  actions: {
    gap: 12,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e67e22',
    borderRadius: 12,
    paddingVertical: 14,
  },
  joinButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2c3e50',
  },
  dividerText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9b59b6',
    borderRadius: 12,
    paddingVertical: 14,
  },
  createButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Warning
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e74c3c22',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e74c3c44',
  },
  warningText: {
    color: '#e74c3c',
    fontSize: 13,
  },
});
