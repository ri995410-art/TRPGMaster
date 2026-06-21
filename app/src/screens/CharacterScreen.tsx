import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import type { Character } from '@trpgmaster/shared';
import { ATTRIBUTE_LABELS, CONDITION_LABELS } from '@trpgmaster/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CharacterScreen() {
  const navigation = useNavigation<NavigationProp>();
  const character = useGameStore((s) => s.character);
  const updateCharacterHp = useGameStore((s) => s.updateCharacterHp);
  const updateCharacterStress = useGameStore((s) => s.updateCharacterStress);
  const updateCharacterHope = useGameStore((s) => s.updateCharacterHope);
  const updateCharacterArmorSlots = useGameStore((s) => s.updateCharacterArmorSlots);

  if (!character) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="person-add" size={48} color="#34495e" />
          <Text style={styles.emptyTitle}>尚未创建角色</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('CharacterCreate', {})}
          >
            <Text style={styles.createButtonText}>创建角色</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderResourceBar = (
    label: string,
    current: number,
    max: number,
    color: string,
    onPlus: () => void,
    onMinus: () => void,
  ) => (
    <View style={styles.resourceRow}>
      <Text style={styles.resourceLabel}>{label}</Text>
      <View style={styles.resourceBarContainer}>
        <View
          style={[
            styles.resourceBarFill,
            { width: `${max > 0 ? (current / max) * 100 : 0}%`, backgroundColor: color },
          ]}
        />
      </View>
      <View style={styles.resourceButtons}>
        <TouchableOpacity style={styles.resourceButton} onPress={onMinus}>
          <Text style={styles.resourceButtonText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.resourceValue}>
          {current}/{max}
        </Text>
        <TouchableOpacity style={styles.resourceButton} onPress={onPlus}>
          <Text style={styles.resourceButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderThresholds = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>伤害阈值</Text>
      <View style={styles.thresholdRow}>
        <View style={styles.thresholdItem}>
          <Text style={styles.thresholdLabel}>轻度</Text>
          <Text style={styles.thresholdValue}>{character.minorThreshold}</Text>
        </View>
        <View style={styles.thresholdItem}>
          <Text style={styles.thresholdLabel}>重度</Text>
          <Text style={styles.thresholdValue}>{character.majorThreshold}</Text>
        </View>
        <View style={styles.thresholdItem}>
          <Text style={styles.thresholdLabel}>严重</Text>
          <Text style={styles.thresholdValue}>{character.severeThreshold}</Text>
        </View>
      </View>
    </View>
  );

  const renderAttributes = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>属性</Text>
      <View style={styles.attributesGrid}>
        {(Object.entries(character.attributes) as [keyof typeof ATTRIBUTE_LABELS, number][]).map(
          ([attr, value]) => (
            <View key={attr} style={styles.attributeChip}>
              <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
              <Text
                style={[
                  styles.attributeValue,
                  value > 0 && styles.positive,
                  value < 0 && styles.negative,
                ]}
              >
                {value > 0 ? '+' : ''}
                {value}
              </Text>
            </View>
          ),
        )}
      </View>
    </View>
  );

  const renderConditions = () => {
    if (character.conditions.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>状态</Text>
        <View style={styles.conditionsRow}>
          {character.conditions.map((cond) => (
            <View key={cond.condition} style={styles.conditionBadge}>
              <Text style={styles.conditionText}>
                {CONDITION_LABELS[cond.condition] || cond.condition}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderEquipment = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>装备</Text>
      <View style={styles.equipmentRow}>
        <View style={styles.equipmentItem}>
          <Ionicons name="cut" size={14} color="#e74c3c" />
          <Text style={styles.equipmentText}>
            {character.mainWeapon.name} ({character.mainWeapon.damageDie})
          </Text>
        </View>
        {character.offWeapon && (
          <View style={styles.equipmentItem}>
            <Ionicons name="cut" size={14} color="#e67e22" />
            <Text style={styles.equipmentText}>
              {character.offWeapon.name} ({character.offWeapon.damageDie})
            </Text>
          </View>
        )}
        <View style={styles.equipmentItem}>
          <Ionicons name="shield" size={14} color="#3498db" />
            <Text style={styles.equipmentText}>{character.armor.name}</Text>
          </View>
      </View>
    </View>
  );

  const renderDomainCards = () => {
    const loadout = character.domainCardConfig?.loadout ?? [];
    if (loadout.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>领域卡</Text>
        <View style={styles.domainCardsRow}>
          {loadout.map((card) => (
            <View key={card.id} style={styles.domainCardChip}>
              <Text style={styles.domainCardName}>{card.name}</Text>
              {(card.hopeCost ?? 0) > 0 && (
                <Text style={styles.domainCardCost}>{card.hopeCost}希望</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderExperiences = () => {
    if (character.experiences.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>经历</Text>
        {character.experiences.map((exp, i) => (
          <View key={i} style={styles.experienceRow}>
            <Text style={styles.experienceName}>{exp.name}</Text>
            <Text style={styles.experienceValue}>
              {exp.modifier > 0 ? '+' : ''}
              {exp.modifier}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.characterName}>{character.name}</Text>
            <Text style={styles.characterSubtitle}>
              {character.classId} · {character.ancestryId} · {character.communityId}
            </Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>Lv.{character.level}</Text>
          </View>
        </View>

        {/* Evasion */}
        <View style={styles.evasionRow}>
          <Ionicons name="remove-circle-outline" size={16} color="#2ecc71" />
          <Text style={styles.evasionText}>闪避值: {character.evasion}</Text>
        </View>

        {/* Resources */}
        {renderResourceBar('生命', character.hp, character.maxHp, '#e74c3c', () => updateCharacterHp(1), () => updateCharacterHp(-1))}
        {renderResourceBar('压力', character.stress, character.maxStress, '#e67e22', () => updateCharacterStress(1), () => updateCharacterStress(-1))}
        {renderResourceBar('希望', character.hope, character.maxHope, '#3498db', () => updateCharacterHope(1), () => updateCharacterHope(-1))}
        {renderResourceBar('护甲', character.armorSlots, character.maxArmorSlots, '#95a5a6', () => updateCharacterArmorSlots(1), () => updateCharacterArmorSlots(-1))}

        {/* Thresholds */}
        {renderThresholds()}

        {/* Attributes */}
        {renderAttributes()}

        {/* Conditions */}
        {renderConditions()}

        {/* Equipment */}
        {renderEquipment()}

        {/* Domain Cards */}
        {renderDomainCards()}

        {/* Experiences */}
        {renderExperiences()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#7f8c8d',
    fontSize: 16,
    marginTop: 12,
  },
  createButton: {
    backgroundColor: '#2980b9',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 16,
  },
  createButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  characterName: {
    color: '#ecf0f1',
    fontSize: 24,
    fontWeight: 'bold',
  },
  characterSubtitle: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 2,
  },
  levelBadge: {
    backgroundColor: '#2980b9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  levelText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Evasion
  evasionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  evasionText: {
    color: '#2ecc71',
    fontSize: 14,
  },
  // Resource bar
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  resourceLabel: {
    color: '#bdc3c7',
    fontSize: 12,
    width: 36,
  },
  resourceBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#2c3e50',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  resourceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  resourceButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resourceButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resourceButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resourceValue: {
    color: '#ecf0f1',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
  // Section
  section: {
    marginTop: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
  },
  sectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  // Thresholds
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  thresholdItem: {
    alignItems: 'center',
  },
  thresholdLabel: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  thresholdValue: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // Attributes
  attributesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attributeChip: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 4,
  },
  attributeName: {
    color: '#bdc3c7',
    fontSize: 11,
  },
  attributeValue: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  // Conditions
  conditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  conditionBadge: {
    backgroundColor: '#e74c3c33',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  conditionText: {
    color: '#e74c3c',
    fontSize: 11,
  },
  // Equipment
  equipmentRow: {
    gap: 6,
  },
  equipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  equipmentText: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  // Domain cards
  domainCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  domainCardChip: {
    backgroundColor: '#9b59b622',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#9b59b644',
  },
  domainCardName: {
    color: '#9b59b6',
    fontSize: 12,
  },
  domainCardCost: {
    color: '#7f8c8d',
    fontSize: 10,
    marginTop: 2,
  },
  // Experiences
  experienceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  experienceName: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  experienceValue: {
    color: '#f39c12',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
