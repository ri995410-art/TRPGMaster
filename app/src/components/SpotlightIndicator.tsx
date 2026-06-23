import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import type { SpotlightState } from '@trpgmaster/shared';

interface Props {
  spotlight: SpotlightState | null;
  playerId: string;
  players: Array<{ id: string; name: string; characterName?: string; isConnected: boolean }>;
  onRequestSpotlight: () => void;
}

export function SpotlightIndicator({ spotlight, playerId, players, onRequestSpotlight }: Props) {
  if (!spotlight) return null;

  const isHolding = spotlight.current === playerId;
  const queuePosition = spotlight.queue.indexOf(playerId);
  const currentPlayer = spotlight.current
    ? players.find(p => p.id === spotlight.current)
    : null;

  if (isHolding) {
    return (
      <View style={styles.active}>
        <Ionicons name="eye" size={14} color={theme.color.success} />
        <Text style={styles.activeText}>轮到你了</Text>
      </View>
    );
  }

  return (
    <View style={styles.waiting}>
      <Ionicons name="eye-off" size={14} color={theme.color.warning} />
      <Text style={styles.waitingText}>
        {currentPlayer
          ? `等待 ${currentPlayer.characterName || currentPlayer.name} 行动…`
          : '等待其他玩家行动…'}
      </Text>
      {queuePosition >= 0 && (
        <Text style={styles.queueText}>排队第{queuePosition + 1}位</Text>
      )}
      {queuePosition < 0 && (
        <TouchableOpacity style={styles.requestButton} onPress={onRequestSpotlight}>
          <Text style={styles.requestText}>申请行动</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1a2e1a',
    gap: 6,
  },
  activeText: {
    color: theme.color.success,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.color.bgCard,
    gap: 6,
  },
  waitingText: {
    color: theme.color.warning,
    fontSize: 12,
    flex: 1,
    fontFamily: theme.font.body,
  },
  queueText: {
    color: theme.color.textDim,
    fontSize: 11,
    fontFamily: theme.font.body,
  },
  requestButton: {
    backgroundColor: theme.color.warning,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  requestText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
});
