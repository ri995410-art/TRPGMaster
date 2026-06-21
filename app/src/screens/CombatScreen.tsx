import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface EnemyDisplay {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  currentStress: number;
  maxStress: number;
  isFocused: boolean;
}

// Placeholder until combat state from server is connected
const MOCK_ENEMIES: EnemyDisplay[] = [
  { id: 'e1', name: '迷雾猎犬', currentHp: 8, maxHp: 12, currentStress: 1, maxStress: 3, isFocused: false },
  { id: 'e2', name: '翠晶史莱姆', currentHp: 5, maxHp: 8, currentStress: 0, maxStress: 2, isFocused: true },
];

export function CombatScreen() {
  const navigation = useNavigation();
  const character = useGameStore((s) => s.character);
  const fearPoints = useGameStore((s) => s.fearPoints);
  const updateCharacterHp = useGameStore((s) => s.updateCharacterHp);
  const updateCharacterStress = useGameStore((s) => s.updateCharacterStress);
  const updateCharacterHope = useGameStore((s) => s.updateCharacterHope);
  const updateCharacterArmorSlots = useGameStore((s) => s.updateCharacterArmorSlots);

  const [enemies, setEnemies] = useState<EnemyDisplay[]>(MOCK_ENEMIES);
  const [round, setRound] = useState(1);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const combatActions = [
    { id: 'attack', label: '攻击', icon: 'cut' as const, color: '#e74c3c' },
    { id: 'spell', label: '施法', icon: 'flame' as const, color: '#9b59b6' },
    { id: 'defend', label: '防御', icon: 'shield' as const, color: '#3498db' },
    { id: 'move', label: '移动', icon: 'walk' as const, color: '#2ecc71' },
    { id: 'interact', label: '交互', icon: 'hand-left' as const, color: '#f39c12' },
    { id: 'flee', label: '撤退', icon: 'exit-outline' as const, color: '#95a5a6' },
  ];

  const handleAction = (actionId: string) => {
    setSelectedAction(actionId);
    // TODO: Send action to server via Socket.IO
    Alert.alert(
      '战斗行动',
      `你选择了：${combatActions.find((a) => a.id === actionId)?.label}\n\n此功能需要连接服务器以获取AI管家的战斗管理。`,
      [{ text: '确定' }],
    );
  };

  const handleEndCombat = () => {
    Alert.alert('结束战斗', '确定要结束战斗吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const renderEnemy = ({ item }: { item: EnemyDisplay }) => (
    <View style={[styles.enemyCard, item.isFocused && styles.enemyCardFocused]}>
      {item.isFocused && (
        <View style={styles.focusedBadge}>
          <Text style={styles.focusedText}>聚焦</Text>
        </View>
      )}
      <Text style={styles.enemyName}>{item.name}</Text>
      <View style={styles.enemyResourceRow}>
        <Text style={styles.enemyResourceLabel}>HP</Text>
        <View style={styles.enemyResourceBar}>
          <View
            style={[
              styles.enemyResourceFill,
              { width: `${(item.currentHp / item.maxHp) * 100}%`, backgroundColor: '#e74c3c' },
            ]}
          />
        </View>
        <Text style={styles.enemyResourceValue}>
          {item.currentHp}/{item.maxHp}
        </Text>
      </View>
      <View style={styles.enemyResourceRow}>
        <Text style={styles.enemyResourceLabel}>压力</Text>
        <View style={styles.enemyResourceBar}>
          <View
            style={[
              styles.enemyResourceFill,
              {
                width: `${item.maxStress > 0 ? (item.currentStress / item.maxStress) * 100 : 0}%`,
                backgroundColor: '#e67e22',
              },
            ]}
          />
        </View>
        <Text style={styles.enemyResourceValue}>
          {item.currentStress}/{item.maxStress}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color="#ecf0f1" />
        </TouchableOpacity>
        <Text style={styles.roundText}>回合 {round}</Text>
        <View style={styles.fearBadge}>
          <Ionicons name="skull" size={14} color="#9b59b6" />
          <Text style={styles.fearText}>{fearPoints}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Player stats */}
        {character && (
          <View style={styles.playerStats}>
            <Text style={styles.playerName}>{character.name}</Text>
            <View style={styles.playerResources}>
              <View style={styles.playerResource}>
                <Ionicons name="heart" size={12} color="#e74c3c" />
                <Text style={styles.playerResourceText}>
                  {character.hp}/{character.maxHp}
                </Text>
              </View>
              <View style={styles.playerResource}>
                <Ionicons name="flash" size={12} color="#e67e22" />
                <Text style={styles.playerResourceText}>
                  {character.stress}/{character.maxStress}
                </Text>
              </View>
              <View style={styles.playerResource}>
                <Ionicons name="sunny" size={12} color="#3498db" />
                <Text style={styles.playerResourceText}>
                  {character.hope}/{character.maxHope}
                </Text>
              </View>
              <View style={styles.playerResource}>
                <Ionicons name="shield" size={12} color="#95a5a6" />
                <Text style={styles.playerResourceText}>
                  {character.armorSlots}/{character.maxArmorSlots}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Enemies */}
        <Text style={styles.sectionLabel}>敌人</Text>
        <FlatList
          data={enemies}
          keyExtractor={(item) => item.id}
          renderItem={renderEnemy}
          scrollEnabled={false}
        />

        {/* Combat actions */}
        <Text style={styles.sectionLabel}>行动</Text>
        <View style={styles.actionGrid}>
          {combatActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[
                styles.actionButton,
                selectedAction === action.id && { borderColor: action.color, borderWidth: 2 },
              ]}
              onPress={() => handleAction(action.id)}
            >
              <Ionicons name={action.icon} size={20} color={action.color} />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* End combat */}
        <TouchableOpacity style={styles.endCombatButton} onPress={handleEndCombat}>
          <Text style={styles.endCombatText}>结束战斗</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
  },
  roundText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fearBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9b59b633',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fearText: {
    color: '#9b59b6',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Scroll content
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Player stats
  playerStats: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2980b9',
  },
  playerName: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  playerResources: {
    flexDirection: 'row',
    gap: 12,
  },
  playerResource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerResourceText: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  // Section label
  sectionLabel: {
    color: '#7f8c8d',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 8,
  },
  // Enemy card
  enemyCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  enemyCardFocused: {
    borderColor: '#e74c3c',
    borderWidth: 2,
  },
  focusedBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    backgroundColor: '#e74c3c33',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  focusedText: {
    color: '#e74c3c',
    fontSize: 10,
  },
  enemyName: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  enemyResourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  enemyResourceLabel: {
    color: '#7f8c8d',
    fontSize: 10,
    width: 28,
  },
  enemyResourceBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#2c3e50',
    borderRadius: 3,
    marginHorizontal: 6,
    overflow: 'hidden',
  },
  enemyResourceFill: {
    height: '100%',
    borderRadius: 3,
  },
  enemyResourceValue: {
    color: '#bdc3c7',
    fontSize: 10,
    width: 36,
    textAlign: 'right',
  },
  // Action grid
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    width: '30%',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  actionLabel: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  // End combat
  endCombatButton: {
    backgroundColor: '#e74c3c22',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e74c3c44',
  },
  endCombatText: {
    color: '#e74c3c',
    fontSize: 14,
  },
});
