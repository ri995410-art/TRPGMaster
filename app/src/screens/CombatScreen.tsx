import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { sendAttackAction, sendPlayerAction } from '../hooks/useSocket';
import type { CombatEnemy } from '@trpgmaster/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CombatScreen() {
  const navigation = useNavigation();
  const character = useGameStore((s) => s.character);
  const fearPoints = useGameStore((s) => s.fearPoints);
  const combatState = useGameStore((s) => s.combatState);
  const aiProcessing = useGameStore((s) => s.aiProcessing);
  const gmTyping = useGameStore((s) => s.gmTyping);
  const streamingText = useGameStore((s) => s.streamingText);
  const playerId = useGameStore((s) => s.playerId);

  const [selectingTarget, setSelectingTarget] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Auto-close when combat ends (no enemies left)
  useEffect(() => {
    if (combatState && combatState.enemies.length === 0) {
      navigation.goBack();
    }
  }, [combatState?.enemies.length]);

  const enemies: CombatEnemy[] = combatState?.enemies ?? [];
  const round = combatState?.round ?? 1;

  const handleAttack = () => {
    if (enemies.length === 0) return;
    if (enemies.length === 1) {
      // Single enemy — attack directly
      executeAttack(enemies[0]);
    } else {
      // Multiple enemies — enter target selection mode
      setSelectingTarget(true);
      setSelectedTargetId(null);
    }
  };

  const handleSelectTarget = (enemy: CombatEnemy) => {
    if (!selectingTarget) return;
    setSelectingTarget(false);
    executeAttack(enemy);
  };

  const executeAttack = (enemy: CombatEnemy) => {
    if (!character) return;
    const evasion = (enemy as any).evasion ?? 12;
    sendAttackAction({
      kind: 'attack',
      attackerId: playerId,
      targetId: enemy.id,
      difficulty: evasion,
    });
  };

  const handleOtherAction = (label: string) => {
    sendPlayerAction(label);
    navigation.goBack();
  };

  const handleEndCombat = () => {
    sendPlayerAction('请求结束战斗');
    navigation.goBack();
  };

  const combatActions = [
    { id: 'attack', label: '攻击', icon: 'cut' as const, color: '#e74c3c', handler: handleAttack },
    { id: 'spell', label: '施法', icon: 'flame' as const, color: '#9b59b6', handler: () => handleOtherAction('施法') },
    { id: 'defend', label: '防御', icon: 'shield' as const, color: '#3498db', handler: () => handleOtherAction('防御') },
    { id: 'move', label: '移动', icon: 'walk' as const, color: '#2ecc71', handler: () => handleOtherAction('移动') },
    { id: 'interact', label: '交互', icon: 'hand-left' as const, color: '#f39c12', handler: () => handleOtherAction('交互') },
    { id: 'flee', label: '撤退', icon: 'exit-outline' as const, color: '#95a5a6', handler: () => handleOtherAction('撤退') },
  ];

  const renderEnemy = (enemy: CombatEnemy) => {
    const isTargeted = selectingTarget || selectedTargetId === enemy.id;
    return (
      <TouchableOpacity
        key={enemy.id}
        style={[styles.enemyCard, enemy.isFocused && styles.enemyCardFocused, selectingTarget && styles.enemyCardSelectable]}
        onPress={() => selectingTarget && handleSelectTarget(enemy)}
        activeOpacity={selectingTarget ? 0.7 : 1}
      >
        {enemy.isFocused && (
          <View style={styles.focusedBadge}>
            <Text style={styles.focusedText}>聚焦</Text>
          </View>
        )}
        <Text style={styles.enemyName}>{enemy.name}</Text>
        <View style={styles.enemyResourceRow}>
          <Text style={styles.enemyResourceLabel}>HP</Text>
          <View style={styles.enemyResourceBar}>
            <View
              style={[
                styles.enemyResourceFill,
                { width: `${enemy.maxHp > 0 ? (enemy.currentHp / enemy.maxHp) * 100 : 0}%`, backgroundColor: '#e74c3c' },
              ]}
            />
          </View>
          <Text style={styles.enemyResourceValue}>
            {enemy.currentHp}/{enemy.maxHp}
          </Text>
        </View>
        <View style={styles.enemyResourceRow}>
          <Text style={styles.enemyResourceLabel}>压力</Text>
          <View style={styles.enemyResourceBar}>
            <View
              style={[
                styles.enemyResourceFill,
                {
                  width: `${enemy.maxStress > 0 ? (enemy.currentStress / enemy.maxStress) * 100 : 0}%`,
                  backgroundColor: '#e67e22',
                },
              ]}
            />
          </View>
          <Text style={styles.enemyResourceValue}>
            {enemy.currentStress}/{enemy.maxStress}
          </Text>
        </View>
        {selectingTarget && (
          <View style={styles.targetHint}>
            <Text style={styles.targetHintText}>点击选择目标</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

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

        {/* Target selection hint */}
        {selectingTarget && (
          <View style={styles.targetBanner}>
            <Text style={styles.targetBannerText}>选择攻击目标</Text>
            <TouchableOpacity onPress={() => setSelectingTarget(false)}>
              <Text style={styles.targetCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Enemies */}
        <Text style={styles.sectionLabel}>敌人</Text>
        {enemies.length > 0 ? (
          enemies.map(renderEnemy)
        ) : (
          <View style={styles.noEnemies}>
            <Text style={styles.noEnemiesText}>等待敌人数据...</Text>
          </View>
        )}

        {/* Combat actions */}
        <Text style={styles.sectionLabel}>行动</Text>
        <View style={styles.actionGrid}>
          {combatActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[styles.actionButton, aiProcessing && styles.actionButtonDisabled]}
              onPress={action.handler}
              disabled={aiProcessing}
            >
              <Ionicons name={action.icon} size={20} color={aiProcessing ? '#555' : action.color} />
              <Text style={[styles.actionLabel, aiProcessing && styles.actionLabelDisabled]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Narrative preview */}
        {(gmTyping || streamingText.length > 0) && (
          <View style={styles.narrativePreview}>
            <Text style={styles.narrativePreviewLabel}>GM 叙事</Text>
            {streamingText.length > 0 ? (
              <Text style={styles.narrativePreviewText} numberOfLines={4}>
                {streamingText}
              </Text>
            ) : (
              <View style={styles.typingIndicator}>
                <ActivityIndicator size="small" color="#9b59b6" />
                <Text style={styles.typingText}>GM正在叙述...</Text>
              </View>
            )}
          </View>
        )}

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
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
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
  sectionLabel: {
    color: '#7f8c8d',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 8,
  },
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
  enemyCardSelectable: {
    borderColor: '#f39c12',
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
  targetHint: {
    marginTop: 6,
    alignItems: 'center',
  },
  targetHintText: {
    color: '#f39c12',
    fontSize: 11,
  },
  targetBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f39c1222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f39c12',
  },
  targetBannerText: {
    color: '#f39c12',
    fontSize: 14,
    fontWeight: 'bold',
  },
  targetCancelText: {
    color: '#e74c3c',
    fontSize: 13,
  },
  noEnemies: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noEnemiesText: {
    color: '#7f8c8d',
    fontSize: 13,
  },
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
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  actionLabelDisabled: {
    color: '#555',
  },
  narrativePreview: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#9b59b644',
  },
  narrativePreviewLabel: {
    color: '#9b59b6',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  narrativePreviewText: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 18,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typingText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
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
