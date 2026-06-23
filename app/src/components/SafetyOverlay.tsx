import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

interface Props {
  isHost: boolean;
  onResume: () => void;
}

export function SafetyOverlay({ isHost, onResume }: Props) {
  return (
    <View style={styles.overlay}>
      <Ionicons name="hand-left" size={48} color={theme.color.danger} />
      <Text style={styles.title}>游戏暂停</Text>
      <Text style={styles.subtitle}>X-Card 已激活，等待主持人恢复</Text>
      {isHost && (
        <TouchableOpacity style={styles.resumeButton} onPress={onResume}>
          <Text style={styles.resumeText}>恢复游戏</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(14,13,18,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: theme.color.danger,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
  subtitle: {
    color: theme.color.textDim,
    fontSize: 14,
    fontFamily: theme.font.body,
  },
  resumeButton: {
    backgroundColor: theme.color.success,
    borderRadius: theme.radius.button,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 12,
  },
  resumeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
});
