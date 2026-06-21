import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { ATTRIBUTE_LABELS, TIER_LEVELS, getTier } from '@trpgmaster/shared';
import type { Attribute } from '@trpgmaster/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LevelUpScreen() {
  const navigation = useNavigation();
  const character = useGameStore((s) => s.character);
  const updateCharacter = useGameStore((s) => s.updateCharacter);

  const [attributePoints, setAttributePoints] = useState<Record<Attribute, number>>({
    agility: 0,
    strength: 0,
    finesse: 0,
    instinct: 0,
    presence: 0,
    knowledge: 0,
  });
  const [remainingPoints, setRemainingPoints] = useState(1);

  if (!character) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>没有角色数据</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentTier = character ? getTier(character.level) : 1;

  const nextLevel = character.level + 1;

  const increaseAttribute = (attr: Attribute) => {
    if (remainingPoints <= 0) return;
    setAttributePoints({ ...attributePoints, [attr]: attributePoints[attr] + 1 });
    setRemainingPoints(remainingPoints - 1);
  };

  const decreaseAttribute = (attr: Attribute) => {
    if (attributePoints[attr] <= 0) return;
    setAttributePoints({ ...attributePoints, [attr]: attributePoints[attr] - 1 });
    setRemainingPoints(remainingPoints + 1);
  };

  const handleConfirm = () => {
    // TODO: Send to server for full level-up resolution via DaggerHeartRules
    const newAttributes = { ...character.attributes };
    for (const [attr, bonus] of Object.entries(attributePoints)) {
      if (bonus > 0) {
        newAttributes[attr as Attribute] += bonus;
      }
    }

    updateCharacter({
      level: nextLevel,
      attributes: newAttributes,
    });

    Alert.alert('升级成功', `你已升级到 ${nextLevel} 级！`);
    navigation.goBack();
  };

  const getTierName = (tier: number): string => {
    switch (tier) {
      case 1: return '新手';
      case 2: return '老兵';
      case 3: return '专家';
      case 4: return '大师';
      default: return '未知';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color="#ecf0f1" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>升级</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Level info */}
        <View style={styles.levelInfo}>
          <Text style={styles.levelChange}>
            Lv.{character.level} → Lv.{nextLevel}
          </Text>
          <Text style={styles.tierInfo}>
            位阶：{getTierName(currentTier)}
          </Text>
        </View>

        {/* Attribute allocation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            属性提升 (剩余 {remainingPoints} 点)
          </Text>
          {(Object.entries(character.attributes) as [Attribute, number][]).map(([attr, baseValue]) => (
            <View key={attr} style={styles.attributeRow}>
              <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
              <Text style={styles.attributeBase}>
                {baseValue > 0 ? '+' : ''}{baseValue}
              </Text>
              <TouchableOpacity
                style={styles.attributeButton}
                onPress={() => decreaseAttribute(attr)}
              >
                <Ionicons name="remove" size={16} color="#ecf0f1" />
              </TouchableOpacity>
              <Text style={styles.attributeBonus}>
                +{attributePoints[attr]}
              </Text>
              <TouchableOpacity
                style={[styles.attributeButton, remainingPoints <= 0 && styles.attributeButtonDisabled]}
                onPress={() => increaseAttribute(attr)}
                disabled={remainingPoints <= 0}
              >
                <Ionicons name="add" size={16} color="#ecf0f1" />
              </TouchableOpacity>
              <Text style={styles.attributeTotal}>
                {baseValue + attributePoints[attr] > 0 ? '+' : ''}{baseValue + attributePoints[attr]}
              </Text>
            </View>
          ))}
        </View>

        {/* Level-up benefits info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>升级收益</Text>
          <View style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={14} color="#2ecc71" />
            <Text style={styles.benefitText}>属性值+1</Text>
          </View>
          <View style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={14} color="#2ecc71" />
            <Text style={styles.benefitText}>最大生命点+1</Text>
          </View>
          {nextLevel % 2 === 0 && (
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={14} color="#f39c12" />
              <Text style={styles.benefitText}>获得新领域卡</Text>
            </View>
          )}
          {TIER_LEVELS[2] && TIER_LEVELS[2][0] === nextLevel && (
            <View style={styles.benefitRow}>
              <Ionicons name="star" size={14} color="#9b59b6" />
              <Text style={styles.benefitText}>升阶：老兵 — 选择进阶特性</Text>
            </View>
          )}
          {TIER_LEVELS[3] && TIER_LEVELS[3][0] === nextLevel && (
            <View style={styles.benefitRow}>
              <Ionicons name="star" size={14} color="#9b59b6" />
              <Text style={styles.benefitText}>升阶：专家 — 选择精通特性</Text>
            </View>
          )}
          {TIER_LEVELS[4] && TIER_LEVELS[4][0] === nextLevel && (
            <View style={styles.benefitRow}>
              <Ionicons name="star" size={14} color="#9b59b6" />
              <Text style={styles.benefitText}>升阶：大师 — 选择大师特性</Text>
            </View>
          )}
        </View>

        {/* Confirm */}
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmButtonText}>确认升级</Text>
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
  topBarTitle: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 16,
  },
  // Level info
  levelInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  levelChange: {
    color: '#f39c12',
    fontSize: 24,
    fontWeight: 'bold',
  },
  tierInfo: {
    color: '#9b59b6',
    fontSize: 14,
    marginTop: 4,
  },
  // Section
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  // Attribute row
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#16213e',
  },
  attributeName: {
    color: '#ecf0f1',
    fontSize: 14,
    width: 50,
  },
  attributeBase: {
    color: '#7f8c8d',
    fontSize: 14,
    width: 36,
    textAlign: 'center',
  },
  attributeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attributeButtonDisabled: {
    opacity: 0.4,
  },
  attributeBonus: {
    color: '#2ecc71',
    fontSize: 14,
    width: 30,
    textAlign: 'center',
  },
  attributeTotal: {
    color: '#f39c12',
    fontSize: 14,
    fontWeight: 'bold',
    width: 36,
    textAlign: 'right',
  },
  // Benefits
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  benefitText: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  // Confirm
  confirmButton: {
    backgroundColor: '#f39c12',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButtonText: {
    color: '#0f0f23',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
