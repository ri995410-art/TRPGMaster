import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGameStore } from '../store/gameStore';
import {
  sendCombatAddEnemy,
  sendCombatEnd,
  sendCombatEnemyTurn,
} from '../hooks/useSocket';

const ENEMY_PRESETS = [
  { id: 'goblin-raider', name: '哥布林劫掠者', tier: 1 },
  { id: 'skeleton-soldier', name: '骷髅兵', tier: 1 },
  { id: 'bandit-thug', name: '强盗暴徒', tier: 1 },
  { id: 'wolf-pack', name: '狼群', tier: 1 },
  { id: 'orc-warrior', name: '兽人战士', tier: 2 },
  { id: 'dark-mage', name: '暗黑法师', tier: 2 },
  { id: 'knight-of-ashes', name: '灰烬骑士', tier: 3 },
  { id: 'ancient-dragon', name: '远古巨龙', tier: 4 },
];

export function GMPanelScreen() {
  const fearPoints = useGameStore((s) => s.fearPoints);
  const combatState = useGameStore((s) => s.combatState);
  const [selectedTab, setSelectedTab] = useState<'fear' | 'enemies' | 'scene'>('fear');

  const enemies = combatState?.enemies ?? [];
  const inCombat = combatState != null;

  // ===== Fear Section =====
  const renderFearSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>恐惧点管理</Text>

      <View style={styles.fearDisplay}>
        <Ionicons name="skull" size={32} color="#e74c3c" />
        <Text style={styles.fearNumber}>{fearPoints}</Text>
        <Text style={styles.fearLabel}>恐惧点</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={() => useGameStore.getState().updateFearPoints(-1)}
          disabled={fearPoints < 1}
        >
          <Text style={styles.buttonText}>中断行动 (1)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={() => useGameStore.getState().updateFearPoints(-1)}
          disabled={fearPoints < 1}
        >
          <Text style={styles.buttonText}>额外行动 (1)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonWarning]}
          onPress={() => useGameStore.getState().updateFearPoints(-1)}
          disabled={fearPoints < 1}
        >
          <Text style={styles.buttonText}>切换焦点 (1)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonWarning]}
          onPress={() => useGameStore.getState().updateFearPoints(-1)}
          disabled={fearPoints < 1}
        >
          <Text style={styles.buttonText}>环境效果 (1)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ===== Enemies Section =====
  const renderEnemiesSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>敌人管理</Text>

      {!inCombat ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color="#7f8c8d" />
          <Text style={styles.emptyText}>当前不在战斗中</Text>
          <Text style={styles.emptySubtext}>添加敌人将自动开始战斗</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subTitle}>当前敌人</Text>
          {enemies.length === 0 ? (
            <Text style={styles.emptyText}>没有敌人</Text>
          ) : (
            enemies.map((enemy) => (
              <View key={enemy.id} style={styles.enemyCard}>
                <View style={styles.enemyHeader}>
                  <Text style={styles.enemyName}>{enemy.name}</Text>
                  <View style={styles.enemyBadge}>
                    <Text style={styles.enemyBadgeText}>{enemy.behavior}</Text>
                  </View>
                </View>
                <View style={styles.enemyStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>HP</Text>
                    <Text style={styles.statValue}>{enemy.currentHp}/{enemy.maxHp}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>压力</Text>
                    <Text style={styles.statValue}>{enemy.currentStress}/{enemy.maxStress}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>闪避</Text>
                    <Text style={styles.statValue}>{enemy.evasion}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSmall, styles.buttonPrimary]}
                  onPress={() => sendCombatEnemyTurn(enemy.id)}
                >
                  <Text style={styles.buttonTextSmall}>执行回合</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      )}

      <Text style={styles.subTitle}>添加敌人</Text>
      <View style={styles.enemyPresets}>
        {ENEMY_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.id}
            style={[styles.presetButton, { opacity: preset.tier > 2 ? 0.7 : 1 }]}
            onPress={() => sendCombatAddEnemy(preset.id)}
          >
            <Text style={styles.presetName}>{preset.name}</Text>
            <Text style={styles.presetTier}>T{preset.tier}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {inCombat && (
        <TouchableOpacity
          style={[styles.button, styles.buttonDanger, { marginTop: 16 }]}
          onPress={() => {
            Alert.alert('结束战斗', '确定要结束当前战斗吗？', [
              { text: '取消', style: 'cancel' },
              { text: '确定', style: 'destructive', onPress: () => sendCombatEnd() },
            ]);
          }}
        >
          <Text style={styles.buttonText}>结束战斗</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ===== Scene Section =====
  const renderSceneSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>场景管理</Text>

      <View style={styles.sceneInfo}>
        <View style={styles.sceneRow}>
          <Text style={styles.sceneLabel}>恐惧点</Text>
          <Text style={styles.sceneValue}>{fearPoints}</Text>
        </View>
        <View style={styles.sceneRow}>
          <Text style={styles.sceneLabel}>战斗轮次</Text>
          <Text style={styles.sceneValue}>{combatState?.round ?? '-'}</Text>
        </View>
        <View style={styles.sceneRow}>
          <Text style={styles.sceneLabel}>敌人数量</Text>
          <Text style={styles.sceneValue}>{enemies.length}</Text>
        </View>
      </View>

      <Text style={styles.subTitle}>快捷操作</Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => sendCombatEnemyTurn()}
          disabled={!inCombat}
        >
          <Text style={styles.buttonText}>敌人回合</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={() => {
            if (inCombat) {
              Alert.alert('结束战斗', '确定？', [
                { text: '取消', style: 'cancel' },
                { text: '确定', style: 'destructive', onPress: () => sendCombatEnd() },
              ]);
            }
          }}
          disabled={!inCombat}
        >
          <Text style={styles.buttonText}>结束战斗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {[
          { key: 'fear' as const, label: '恐惧点', icon: 'skull' as const },
          { key: 'enemies' as const, label: '敌人', icon: 'bug' as const },
          { key: 'scene' as const, label: '场景', icon: 'map' as const },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, selectedTab === tab.key && styles.tabActive]}
            onPress={() => setSelectedTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={20}
              color={selectedTab === tab.key ? '#3498db' : '#7f8c8d'}
            />
            <Text style={[styles.tabLabel, selectedTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {selectedTab === 'fear' && renderFearSection()}
        {selectedTab === 'enemies' && renderEnemiesSection()}
        {selectedTab === 'scene' && renderSceneSection()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  tabBar: { flexDirection: 'row', backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#1a1a3e' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#3498db' },
  tabLabel: { color: '#7f8c8d', fontSize: 12, marginTop: 4 },
  tabLabelActive: { color: '#3498db', fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#ecf0f1', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  subTitle: { color: '#bdc3c7', fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  fearDisplay: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#1a1a3e', borderRadius: 12, marginBottom: 16 },
  fearNumber: { color: '#e74c3c', fontSize: 48, fontWeight: '700' },
  fearLabel: { color: '#95a5a6', fontSize: 14 },
  buttonRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  button: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  buttonPrimary: { backgroundColor: '#3498db' },
  buttonDanger: { backgroundColor: '#e74c3c' },
  buttonWarning: { backgroundColor: '#f39c12' },
  buttonSmall: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'flex-start', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  buttonTextSmall: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#95a5a6', fontSize: 16, marginTop: 8 },
  emptySubtext: { color: '#7f8c8d', fontSize: 12, marginTop: 4 },
  enemyCard: { backgroundColor: '#1a1a3e', borderRadius: 8, padding: 12, marginBottom: 8 },
  enemyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  enemyName: { color: '#ecf0f1', fontSize: 16, fontWeight: '600' },
  enemyBadge: { backgroundColor: '#e74c3c33', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  enemyBadgeText: { color: '#e74c3c', fontSize: 11, fontWeight: '600' },
  enemyStats: { flexDirection: 'row', gap: 16, marginTop: 8 },
  statItem: { alignItems: 'center' },
  statLabel: { color: '#7f8c8d', fontSize: 11 },
  statValue: { color: '#bdc3c7', fontSize: 14, fontWeight: '600' },
  enemyPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetButton: { backgroundColor: '#1a1a3e', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#2c3e50' },
  presetName: { color: '#ecf0f1', fontSize: 13, fontWeight: '500' },
  presetTier: { color: '#7f8c8d', fontSize: 11, textAlign: 'center' },
  sceneInfo: { backgroundColor: '#1a1a3e', borderRadius: 8, padding: 16, marginBottom: 16 },
  sceneRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sceneLabel: { color: '#95a5a6', fontSize: 14 },
  sceneValue: { color: '#ecf0f1', fontSize: 14, fontWeight: '600' },
});
