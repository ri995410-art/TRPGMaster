import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../hooks/useSocket';

type LobbyNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SessionLobby'>;

interface Props {
  navigation: LobbyNavigationProp;
  route: {
    params: {
      sessionCode: string;
      isHost: boolean;
    };
  };
}

export function SessionLobbyScreen({ navigation, route }: Props) {
  const { sessionCode, isHost } = route.params;
  const players = useGameStore((s) => s.players);
  const character = useGameStore((s) => s.character);
  const isConnected = useGameStore((s) => s.isConnected);

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `来玩TRPGMaster！房间码：${sessionCode}`,
      });
    } catch {
      // Share failed or was cancelled
    }
  };

  const handleStart = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('session:start', {
      type: 'session:start',
      sessionId: '',
      senderId: socket.id || 'unknown',
      payload: {},
      timestamp: Date.now(),
    });

    // Navigate to main game
    navigation.navigate('Main');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Room code display */}
        <View style={styles.codeDisplay}>
          <Text style={styles.codeLabel}>房间码</Text>
          <View style={styles.codeRow}>
            {sessionCode.split('').map((ch, i) => (
              <View key={i} style={styles.codeBox}>
                <Text style={styles.codeChar}>{ch}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={handleShareCode}>
            <Ionicons name="share-outline" size={16} color="#ecf0f1" />
            <Text style={styles.shareText}>分享房间码</Text>
          </TouchableOpacity>
        </View>

        {/* Player list */}
        <View style={styles.playerSection}>
          <Text style={styles.sectionTitle}>
            已加入的玩家 ({players.length})
          </Text>

          {players.length === 0 ? (
            <View style={styles.emptyPlayers}>
              <Ionicons name="hourglass-outline" size={32} color="#7f8c8d" />
              <Text style={styles.emptyText}>等待玩家加入...</Text>
            </View>
          ) : (
            <View style={styles.playerList}>
              {players.map((player, i) => (
                <View key={player.id} style={styles.playerCard}>
                  <View style={styles.playerNumber}>
                    <Text style={styles.playerNumberText}>{i + 1}</Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {player.characterName && (
                      <Text style={styles.playerCharName}>{player.characterName}</Text>
                    )}
                  </View>
                  <View style={[
                    styles.playerStatus,
                    player.isConnected ? styles.statusConnected : styles.statusDisconnected,
                  ]}>
                    <Ionicons
                      name={player.isConnected ? 'radio-button-on' : 'radio-button-off'}
                      size={14}
                      color={player.isConnected ? '#2ecc71' : '#7f8c8d'}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Current user */}
          {character && !players.find(p => p.name === character.name) && (
            <View style={[styles.playerCard, styles.selfCard]}>
              <View style={[styles.playerNumber, styles.selfNumber]}>
                <Text style={styles.playerNumberText}>{players.length + 1}</Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={[styles.playerName, styles.selfName]}>{character.name}</Text>
                <Text style={styles.playerCharName}>{character.classId} Lv.{character.level}</Text>
              </View>
              <View style={[styles.playerStatus, styles.statusConnected]}>
                <Ionicons name="radio-button-on" size={14} color="#2ecc71" />
              </View>
            </View>
          )}
        </View>

        {/* Waiting indicator */}
        <View style={styles.waitingSection}>
          <Ionicons name="pulse" size={20} color="#e67e22" />
          <Text style={styles.waitingText}>
            {isHost
              ? '等待其他玩家加入房间...'
              : '等待房主开始游戏...'
            }
          </Text>
        </View>

        {/* Start button (host only) */}
        {isHost && (
          <TouchableOpacity style={styles.startButton} onPress={handleStart}>
            <Ionicons name="play-circle" size={24} color="#ecf0f1" />
            <Text style={styles.startButtonText}>开始冒险</Text>
          </TouchableOpacity>
        )}

        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Ionicons name="arrow-back" size={16} color="#7f8c8d" />
          <Text style={styles.backButtonText}>返回首页</Text>
        </TouchableOpacity>
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
  // Code display
  codeDisplay: {
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e67e22',
  },
  codeLabel: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 12,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  codeBox: {
    width: 44,
    height: 52,
    backgroundColor: '#16213e',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e67e22',
  },
  codeChar: {
    color: '#e67e22',
    fontSize: 24,
    fontWeight: 'bold',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e67e2222',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  shareText: {
    color: '#e67e22',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Player section
  playerSection: {
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
    marginBottom: 12,
  },
  emptyPlayers: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 14,
    marginTop: 8,
  },
  playerList: {
    gap: 8,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  selfCard: {
    borderWidth: 1,
    borderColor: '#9b59b6',
    backgroundColor: '#9b59b611',
  },
  playerNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfNumber: {
    backgroundColor: '#9b59b622',
  },
  playerNumberText: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
  },
  selfName: {
    color: '#9b59b6',
  },
  playerCharName: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 2,
  },
  playerStatus: {
    width: 20,
    alignItems: 'center',
  },
  statusConnected: {},
  statusDisconnected: {
    opacity: 0.5,
  },
  // Waiting
  waitingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  waitingText: {
    color: '#e67e22',
    fontSize: 14,
  },
  // Start button
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2ecc71',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  startButtonText: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Back button
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#7f8c8d',
    fontSize: 14,
  },
});
