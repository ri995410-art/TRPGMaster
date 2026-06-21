import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../hooks/useSocket';

type RosterNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CharacterRoster'>;

interface Props {
  navigation: RosterNavigationProp;
}

const CLASS_ICONS: Record<string, string> = {
  warrior: '🛡️',
  wizard: '🧙',
  rogue: '🗡️',
  ranger: '🏹',
  cleric: '✨',
  bard: '🎵',
  druid: '🌿',
  sorcerer: '🔥',
  warlock: '👁️',
};

export function CharacterRosterScreen({ navigation }: Props) {
  const characters = useGameStore((s) => s.characters);
  const activeCharacterId = useGameStore((s) => s.activeCharacterId);
  const setActiveCharacter = useGameStore((s) => s.setActiveCharacter);
  const removeCharacter = useGameStore((s) => s.removeCharacter);
  const isConnected = useGameStore((s) => s.isConnected);

  const handleSelectCharacter = (characterId: string) => {
    setActiveCharacter(characterId);

    // Notify server about character switch if connected
    const socket = getSocket();
    const store = useGameStore.getState();
    const char = store.characters.find(c => c.id === characterId);
    if (socket && store.isConnected && char) {
      socket.emit('character:switch', {
        type: 'character:switch',
        sessionId: store.campaignId || '',
        senderId: store.playerId,
        payload: { character: char },
        timestamp: Date.now(),
      });
    }

    navigation.navigate('Main');
  };

  const handleDeleteCharacter = (characterId: string, name: string) => {
    Alert.alert(
      '删除角色',
      `确定要删除"${name}"吗？此操作无法撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => removeCharacter(characterId),
        },
      ],
    );
  };

  const handleCreateCharacter = () => {
    navigation.navigate('CharacterCreate', {});
  };

  const getCharacterSubtitle = (char: typeof characters[0]): string => {
    const parts = [char.classId || '未知职业'];
    if (char.subclassId) parts.push(char.subclassId);
    parts.push(`Lv.${char.level}`);
    return parts.join(' · ');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>我的角色</Text>
          <Text style={styles.subtitle}>{characters.length} 个角色</Text>
        </View>

        {characters.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-add-outline" size={64} color="#7f8c8d" />
            <Text style={styles.emptyText}>还没有角色</Text>
            <Text style={styles.emptySubtext}>创建你的第一个角色，开始德拉肯海姆的冒险</Text>
            <TouchableOpacity style={styles.createFirstButton} onPress={handleCreateCharacter}>
              <Ionicons name="add-circle" size={20} color="#ecf0f1" />
              <Text style={styles.createFirstText}>创建角色</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.characterList}>
            {characters.map((char) => {
              const isActive = char.id === activeCharacterId;
              const classIcon = CLASS_ICONS[char.classId] || '⚔️';

              return (
                <View
                  key={char.id}
                  style={[styles.characterCard, isActive && styles.activeCard]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.classIcon}>{classIcon}</Text>
                    <View style={styles.cardInfo}>
                      <Text style={styles.characterName}>{char.name}</Text>
                      <Text style={styles.characterSub}>{getCharacterSubtitle(char)}</Text>
                    </View>
                    {isActive && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>当前</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardStats}>
                    <View style={styles.statItem}>
                      <Ionicons name="heart" size={14} color="#e74c3c" />
                      <Text style={styles.statText}>{char.hp}/{char.maxHp}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="flash" size={14} color="#f39c12" />
                      <Text style={styles.statText}>{char.stress}/{char.maxStress}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="sunny" size={14} color="#2ecc71" />
                      <Text style={styles.statText}>{char.hope}/{char.maxHope}</Text>
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, isActive ? styles.actionBtnDisabled : styles.actionBtnSelect]}
                      onPress={() => handleSelectCharacter(char.id)}
                      disabled={isActive}
                    >
                      <Ionicons name="play-circle-outline" size={16} color={isActive ? '#7f8c8d' : '#2ecc71'} />
                      <Text style={[styles.actionBtnText, { color: isActive ? '#7f8c8d' : '#2ecc71' }]}>
                        {isActive ? '使用中' : '选择'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('Main', { screen: 'Character' } as any)}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#3498db" />
                      <Text style={[styles.actionBtnText, { color: '#3498db' }]}>详情</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDeleteCharacter(char.id, char.name)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                      <Text style={[styles.actionBtnText, { color: '#e74c3c' }]}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {characters.length > 0 && (
          <TouchableOpacity style={styles.createButton} onPress={handleCreateCharacter}>
            <Ionicons name="add-circle-outline" size={20} color="#9b59b6" />
            <Text style={styles.createButtonText}>创建新角色</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    color: '#ecf0f1',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 4,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#bdc3c7',
    fontSize: 18,
    marginTop: 16,
    fontWeight: 'bold',
  },
  emptySubtext: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  createFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#9b59b6',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  createFirstText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Character list
  characterList: {
    gap: 12,
  },
  characterCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  activeCard: {
    borderColor: '#9b59b6',
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  classIcon: {
    fontSize: 28,
  },
  cardInfo: {
    flex: 1,
  },
  characterName: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
  },
  characterSub: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: '#9b59b622',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  activeBadgeText: {
    color: '#9b59b6',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Stats
  cardStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingLeft: 40,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  // Actions
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 40,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#16213e',
  },
  actionBtnSelect: {
    backgroundColor: '#2ecc7122',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Create button
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9b59b6',
    borderStyle: 'dashed',
    marginTop: 16,
  },
  createButtonText: {
    color: '#9b59b6',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
