import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { connectToServer, createSession, joinSessionByCode, rejoinSessionById } from '../hooks/useSocket';
import type { Character } from '@trpgmaster/shared';

type SessionJoinNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SessionJoin'>;

interface Props {
  navigation: SessionJoinNavigationProp;
}

interface PastRoom {
  sessionId: string;
  code: string;
  status: string;
  players: Array<{ id: string; name: string; characterName?: string; isConnected: boolean }>;
  createdAt: number;
  currentSceneName: string;
}

const DEFAULT_SERVER_URL = 'http://localhost:3000';

export function SessionJoinScreen({ navigation }: Props) {
  const characters = useGameStore((s) => s.characters);
  const activeCharacterId = useGameStore((s) => s.activeCharacterId);
  const isConnected = useGameStore((s) => s.isConnected);
  const serverUrl = useGameStore((s) => s.serverUrl);
  const playerId = useGameStore((s) => s.playerId);
  const pastRooms = useGameStore((s) => s.pastRooms);

  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    characters.find(c => c.id === activeCharacterId) || characters[0] || null,
  );
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState<string | null>(null);  // 'create' | 'join' | 'rejoin:<sid>'
  const [inputServerUrl, setInputServerUrl] = useState(serverUrl || DEFAULT_SERVER_URL);
  const [fetchingRooms, setFetchingRooms] = useState(false);

  // Fetch past rooms from server
  const fetchPastRooms = useCallback(async () => {
    if (!isConnected) return;

    setFetchingRooms(true);
    try {
      const base = serverUrl || inputServerUrl;
      const res = await fetch(`${base}/api/sessions`);
      if (res.ok) {
        const data = await res.json();
        const rooms: PastRoom[] = data.sessions || [];
        useGameStore.getState().setPastRooms(rooms);
      }
    } catch (err) {
      console.warn('[SessionJoin] Failed to fetch sessions:', err);
    } finally {
      setFetchingRooms(false);
    }
  }, [isConnected, serverUrl, inputServerUrl]);

  useEffect(() => {
    fetchPastRooms();
  }, [fetchPastRooms]);

  const handleConnect = async () => {
    try {
      await connectToServer(inputServerUrl, { autoJoin: false });
    } catch (err: any) {
      Alert.alert('连接失败', err.message || '未知错误');
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedCharacter) {
      Alert.alert('请先选择角色');
      return;
    }
    if (!isConnected) {
      Alert.alert('请先连接服务器');
      return;
    }

    setLoading('create');
    try {
      const result = await createSession(selectedCharacter);
      Alert.alert('房间已创建', `房间码: ${result.code}`, [
        { text: '确定', onPress: () => navigation.navigate('Main') },
      ]);
    } catch (err: any) {
      Alert.alert('创建失败', err.message || '未知错误');
    } finally {
      setLoading(null);
    }
  };

  const handleJoinByCode = async () => {
    if (!selectedCharacter) {
      Alert.alert('请先选择角色');
      return;
    }
    if (!isConnected) {
      Alert.alert('请先连接服务器');
      return;
    }
    if (!roomCode.trim()) {
      Alert.alert('请输入房间码');
      return;
    }

    setLoading('join');
    try {
      const result = await joinSessionByCode(roomCode.trim(), selectedCharacter);
      Alert.alert('已加入房间', `房间码: ${result.code}`, [
        { text: '确定', onPress: () => navigation.navigate('Main') },
      ]);
    } catch (err: any) {
      Alert.alert('加入失败', err.message || '未知错误');
    } finally {
      setLoading(null);
    }
  };

  const handleRejoinRoom = async (room: PastRoom) => {
    if (!selectedCharacter) {
      Alert.alert('请先选择角色');
      return;
    }
    if (!isConnected) {
      Alert.alert('请先连接服务器');
      return;
    }

    setLoading(`rejoin:${room.sessionId}`);
    try {
      await rejoinSessionById(room.sessionId, selectedCharacter);
      navigation.navigate('Main');
    } catch (err: any) {
      Alert.alert('重新加入失败', err.message || '未知错误');
    } finally {
      setLoading(null);
    }
  };

  // Filter past rooms to only show ones this player has participated in
  const myPastRooms = pastRooms.filter(room =>
    room.players.some(p => p.id === playerId),
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ecf0f1" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>多人游戏</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Character selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>选择角色</Text>
          {characters.length === 0 ? (
            <TouchableOpacity
              style={styles.noCharButton}
              onPress={() => navigation.navigate('CharacterCreate', {})}
            >
              <Ionicons name="add-circle-outline" size={20} color="#9b59b6" />
              <Text style={styles.noCharText}>创建角色</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.charScroll}>
              {characters.map((char) => (
                <TouchableOpacity
                  key={char.id}
                  style={[
                    styles.charChip,
                    selectedCharacter?.id === char.id && styles.charChipSelected,
                  ]}
                  onPress={() => setSelectedCharacter(char)}
                >
                  <Text style={[
                    styles.charChipText,
                    selectedCharacter?.id === char.id && styles.charChipTextSelected,
                  ]}>
                    {char.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Server connection */}
        {!isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>服务器连接</Text>
            <View style={styles.serverRow}>
              <TextInput
                style={styles.serverInput}
                value={inputServerUrl}
                onChangeText={setInputServerUrl}
                placeholder="服务器地址"
                placeholderTextColor="#7f8c8d"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
                <Ionicons name="link" size={16} color="#ecf0f1" />
                <Text style={styles.connectBtnText}>连接</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Past rooms */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>历史房间</Text>
            {isConnected && (
              <TouchableOpacity onPress={fetchPastRooms} disabled={fetchingRooms}>
                <Ionicons name="refresh" size={18} color="#3498db" />
              </TouchableOpacity>
            )}
          </View>
          {!isConnected ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={24} color="#7f8c8d" />
              <Text style={styles.emptyText}>连接服务器以查看历史房间</Text>
            </View>
          ) : fetchingRooms ? (
            <ActivityIndicator color="#3498db" style={styles.loader} />
          ) : myPastRooms.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="home-outline" size={24} color="#7f8c8d" />
              <Text style={styles.emptyText}>暂无历史房间</Text>
            </View>
          ) : (
            myPastRooms.map((room) => {
              const isRejoining = loading === `rejoin:${room.sessionId}`;
              const playerNames = room.players.map(p =>
                p.characterName ? `${p.name}(${p.characterName})` : p.name,
              ).join(', ');
              const onlineCount = room.players.filter(p => p.isConnected).length;
              const isEnded = room.status === 'ended' || room.status === 'completed';

              return (
                <View key={room.sessionId} style={[styles.roomCard, isEnded ? styles.roomCardEnded : undefined]}>
                  <View style={styles.roomHeader}>
                    <View style={styles.roomCodeBadge}>
                      <Ionicons name="home" size={14} color="#e67e22" />
                      <Text style={styles.roomCodeText}>{room.code}</Text>
                    </View>
                    {isEnded ? (
                      <View style={styles.endedBadge}>
                        <Text style={styles.endedText}>已结束</Text>
                      </View>
                    ) : (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeText}>进行中</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.roomPlayers} numberOfLines={2}>
                    {playerNames}
                  </Text>
                  {room.currentSceneName ? (
                    <Text style={styles.roomScene}>{room.currentSceneName}</Text>
                  ) : null}
                  <View style={styles.roomFooter}>
                    <Text style={styles.roomOnline}>
                      <Ionicons name="radio-button-on" size={12} color="#2ecc71" /> {onlineCount}/{room.players.length} 在线
                    </Text>
                    <TouchableOpacity
                      style={[styles.rejoinBtn, isRejoining && styles.rejoinBtnDisabled]}
                      onPress={() => handleRejoinRoom(room)}
                      disabled={isRejoining || !!loading}
                    >
                      {isRejoining ? (
                        <ActivityIndicator size="small" color="#ecf0f1" />
                      ) : (
                        <>
                          <Ionicons name="enter-outline" size={14} color="#ecf0f1" />
                          <Text style={styles.rejoinBtnText}>重新加入</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Create / Join */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>加入房间</Text>
          <View style={styles.joinRow}>
            <TextInput
              style={styles.codeInput}
              value={roomCode}
              onChangeText={setRoomCode}
              placeholder="输入6位房间码"
              placeholderTextColor="#7f8c8d"
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.joinBtn, (!isConnected || loading) ? styles.joinBtnDisabled : undefined]}
              onPress={handleJoinByCode}
              disabled={!isConnected || !!loading}
            >
              {loading === 'join' ? (
                <ActivityIndicator size="small" color="#ecf0f1" />
              ) : (
                <Text style={styles.joinBtnText}>加入</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.createBtn, (!isConnected || loading) ? styles.createBtnDisabled : undefined]}
            onPress={handleCreateRoom}
            disabled={!isConnected || !!loading}
          >
            {loading === 'create' ? (
              <ActivityIndicator size="small" color="#ecf0f1" />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="#ecf0f1" />
                <Text style={styles.createBtnText}>创建新房间</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: {
    color: '#ecf0f1',
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  // Character selection
  charScroll: {
    flexGrow: 0,
  },
  charChip: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  charChipSelected: {
    backgroundColor: '#9b59b6',
    borderColor: '#9b59b6',
  },
  charChipText: {
    color: '#bdc3c7',
    fontSize: 14,
  },
  charChipTextSelected: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  noCharButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  noCharText: {
    color: '#9b59b6',
    fontSize: 14,
  },
  // Server connection
  serverRow: {
    flexDirection: 'row',
    gap: 8,
  },
  serverInput: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2980b9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  connectBtnText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Past rooms
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
    gap: 6,
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  loader: {
    paddingVertical: 16,
  },
  roomCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  roomCardEnded: {
    opacity: 0.7,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  roomCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e67e2222',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roomCodeText: {
    color: '#e67e22',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  endedBadge: {
    backgroundColor: '#e74c3c22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  endedText: {
    color: '#e74c3c',
    fontSize: 11,
  },
  activeBadge: {
    backgroundColor: '#2ecc7122',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeText: {
    color: '#2ecc71',
    fontSize: 11,
  },
  roomPlayers: {
    color: '#bdc3c7',
    fontSize: 13,
    marginBottom: 4,
  },
  roomScene: {
    color: '#7f8c8d',
    fontSize: 12,
    marginBottom: 8,
  },
  roomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomOnline: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  rejoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2980b9',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rejoinBtnDisabled: {
    opacity: 0.5,
  },
  rejoinBtnText: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Join by code
  joinRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 16,
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  joinBtn: {
    backgroundColor: '#2980b9',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  joinBtnDisabled: {
    opacity: 0.5,
  },
  joinBtnText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e67e22',
    borderRadius: 12,
    paddingVertical: 14,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
