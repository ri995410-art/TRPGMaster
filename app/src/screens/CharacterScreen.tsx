import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, MainTabParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { sendCharacterResourceUpdate, sendCharacterSetValues } from '../hooks/useSocket';
import type { Character, Attribute } from '@trpgmaster/shared';
import { ATTRIBUTE_LABELS, CONDITION_LABELS } from '@trpgmaster/shared';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function CharacterScreen() {
  const navigation = useNavigation<NavigationProp>();
  const character = useGameStore((s) => s.character);
  const updateCharacterHp = useGameStore((s) => s.updateCharacterHp);
  const updateCharacterStress = useGameStore((s) => s.updateCharacterStress);
  const updateCharacterHope = useGameStore((s) => s.updateCharacterHope);
  const updateCharacterArmorSlots = useGameStore((s) => s.updateCharacterArmorSlots);
  const isHost = useGameStore((s) => s.isHost);

  const [gmEditMode, setGmEditMode] = useState(false);
  const [editModal, setEditModal] = useState<{
    field: string;
    label: string;
    value: string;
    type: 'number' | 'text';
  } | null>(null);

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

  const openEditModal = (field: string, label: string, currentValue: number | string, type: 'number' | 'text' = 'number') => {
    setEditModal({ field, label, value: String(currentValue), type });
  };

  const saveEditModal = () => {
    if (!editModal) return;
    const { field, value, type } = editModal;
    if (type === 'number') {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      // Handle nested attributes like "attributes.agility"
      if (field.startsWith('attributes.')) {
        const attr = field.replace('attributes.', '') as Attribute;
        sendCharacterSetValues({ attributes: { ...character.attributes, [attr]: num } });
      } else {
        sendCharacterSetValues({ [field]: num });
      }
    } else {
      sendCharacterSetValues({ [field]: value });
    }
    setEditModal(null);
  };

  const handleEmergencyReset = () => {
    Alert.alert(
      '紧急重置',
      '将角色恢复到满HP、0压力、满希望，并清除所有状态。确定？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定重置',
          style: 'destructive',
          onPress: () => {
            sendCharacterSetValues({
              hp: character.maxHp,
              stress: 0,
              hope: character.maxHope,
              conditions: [],
            });
          },
        },
      ],
    );
  };

  const renderResourceBar = (
    label: string,
    current: number,
    max: number,
    color: string,
    onPlus: () => void,
    onMinus: () => void,
    field?: string,
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
        <TouchableOpacity
          style={gmEditMode && field ? styles.resourceValueEditable : styles.resourceValue}
          onPress={() => gmEditMode && field && openEditModal(field, label, current)}
          disabled={!gmEditMode || !field}
        >
          <Text style={styles.resourceValueText}>
            {current}/{max}
          </Text>
        </TouchableOpacity>
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
          <TouchableOpacity
            disabled={!gmEditMode}
            onPress={() => gmEditMode && openEditModal('minorThreshold', '轻度阈值', character.minorThreshold)}
          >
            <Text style={[styles.thresholdValue, gmEditMode && styles.editableValue]}>
              {character.minorThreshold}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.thresholdItem}>
          <Text style={styles.thresholdLabel}>重度</Text>
          <TouchableOpacity
            disabled={!gmEditMode}
            onPress={() => gmEditMode && openEditModal('majorThreshold', '重度阈值', character.majorThreshold)}
          >
            <Text style={[styles.thresholdValue, gmEditMode && styles.editableValue]}>
              {character.majorThreshold}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.thresholdItem}>
          <Text style={styles.thresholdLabel}>严重</Text>
          <TouchableOpacity
            disabled={!gmEditMode}
            onPress={() => gmEditMode && openEditModal('severeThreshold', '严重阈值', character.severeThreshold)}
          >
            <Text style={[styles.thresholdValue, gmEditMode && styles.editableValue]}>
              {character.severeThreshold}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderAttributes = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>属性</Text>
      <View style={styles.attributesGrid}>
        {(Object.entries(character.attributes) as [Attribute, number][]).map(
          ([attr, value]) => (
            <TouchableOpacity
              key={attr}
              style={styles.attributeChip}
              disabled={!gmEditMode}
              onPress={() => gmEditMode && openEditModal(`attributes.${attr}`, ATTRIBUTE_LABELS[attr], value)}
            >
              <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
              <Text
                style={[
                  styles.attributeValue,
                  value > 0 && styles.positive,
                  value < 0 && styles.negative,
                  gmEditMode && styles.editableValue,
                ]}
              >
                {value > 0 ? '+' : ''}
                {value}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </View>
    </View>
  );

  const renderConditions = () => {
    if (character.conditions.length === 0 && !gmEditMode) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>状态</Text>
        {character.conditions.length === 0 ? (
          <Text style={styles.emptyText}>无状态效果</Text>
        ) : (
          <View style={styles.conditionsRow}>
            {character.conditions.map((cond) => (
              <View key={cond.condition} style={styles.conditionBadge}>
                <Text style={styles.conditionText}>
                  {CONDITION_LABELS[cond.condition] || cond.condition}
                </Text>
                {gmEditMode && (
                  <TouchableOpacity
                    onPress={() => {
                      sendCharacterSetValues({
                        conditions: character.conditions.filter(c => c.condition !== cond.condition),
                      });
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={14} color="#e74c3c" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
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
            <TouchableOpacity
              disabled={!gmEditMode}
              onPress={() => gmEditMode && openEditModal(
                `experiences.${i}.modifier`,
                `${exp.name} 修正`,
                exp.modifier,
              )}
            >
              <Text style={[styles.experienceValue, gmEditMode && styles.editableValue]}>
                {exp.modifier > 0 ? '+' : ''}
                {exp.modifier}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  const renderGmEditBar = () => {
    if (!isHost) return null;
    return (
      <View style={styles.gmBar}>
        <TouchableOpacity
          style={[styles.gmToggle, gmEditMode && styles.gmToggleActive]}
          onPress={() => setGmEditMode(!gmEditMode)}
        >
          <Ionicons name="construct" size={16} color={gmEditMode ? '#fff' : '#f39c12'} />
          <Text style={[styles.gmToggleText, gmEditMode && styles.gmToggleTextActive]}>
            GM修正
          </Text>
        </TouchableOpacity>
        {gmEditMode && (
          <TouchableOpacity
            style={styles.emergencyButton}
            onPress={handleEmergencyReset}
          >
            <Ionicons name="medkit" size={16} color="#fff" />
            <Text style={styles.emergencyButtonText}>紧急重置</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEditModal = () => {
    if (!editModal) return null;
    return (
      <Modal transparent visible animationType="fade" onRequestClose={() => setEditModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>设置 {editModal.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={editModal.value}
              onChangeText={(text) => setEditModal({ ...editModal, value: text })}
              keyboardType={editModal.type === 'number' ? 'number-pad' : 'default'}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setEditModal(null)}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={saveEditModal}
              >
                <Text style={styles.modalButtonText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderGmEditBar()}
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
          <Text style={styles.evasionText}>闪避值: </Text>
          <TouchableOpacity
            disabled={!gmEditMode}
            onPress={() => gmEditMode && openEditModal('evasion', '闪避值', character.evasion)}
          >
            <Text style={[styles.evasionValue, gmEditMode && styles.editableValue]}>
              {character.evasion}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Resources */}
        {renderResourceBar('生命', character.hp, character.maxHp, '#e74c3c', () => { updateCharacterHp(1); sendCharacterResourceUpdate('hp', 1); }, () => { updateCharacterHp(-1); sendCharacterResourceUpdate('hp', -1); }, 'hp')}
        {renderResourceBar('压力', character.stress, character.maxStress, '#e67e22', () => { updateCharacterStress(1); sendCharacterResourceUpdate('stress', 1); }, () => { updateCharacterStress(-1); sendCharacterResourceUpdate('stress', -1); }, 'stress')}
        {renderResourceBar('希望', character.hope, character.maxHope, '#3498db', () => { updateCharacterHope(1); sendCharacterResourceUpdate('hope', 1); }, () => { updateCharacterHope(-1); sendCharacterResourceUpdate('hope', -1); }, 'hope')}
        {renderResourceBar('护甲', character.armorSlots, character.maxArmorSlots, '#95a5a6', () => { updateCharacterArmorSlots(1); sendCharacterResourceUpdate('armorSlots', 1); }, () => { updateCharacterArmorSlots(-1); sendCharacterResourceUpdate('armorSlots', -1); })}

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
      {renderEditModal()}
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
  // GM edit bar
  gmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a3e',
  },
  gmToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f39c12',
  },
  gmToggleActive: {
    backgroundColor: '#f39c12',
  },
  gmToggleText: {
    color: '#f39c12',
    fontSize: 13,
    fontWeight: '600',
  },
  gmToggleTextActive: {
    color: '#fff',
  },
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e74c3c',
  },
  emergencyButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // Editable value highlight
  editableValue: {
    textDecorationLine: 'underline',
    textDecorationColor: '#f39c12',
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
  evasionValue: {
    color: '#2ecc71',
    fontSize: 14,
    fontWeight: 'bold',
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
    // container for the value text
  },
  resourceValueEditable: {
    backgroundColor: '#f39c1222',
    borderRadius: 4,
  },
  resourceValueText: {
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
  emptyText: {
    color: '#7f8c8d',
    fontSize: 13,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalCancel: {
    backgroundColor: '#2c3e50',
  },
  modalConfirm: {
    backgroundColor: '#3498db',
  },
  modalButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: '600',
  },
});
