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
import type { ShortRestAction, LongRestAction } from '@trpgmaster/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SHORT_REST_OPTIONS: { id: ShortRestAction; label: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { id: 'treatWounds', label: '处理伤口', icon: 'heart', description: '恢复生命点（1d4+位阶）' },
  { id: 'relieveStress', label: '缓解压力', icon: 'flash', description: '清除压力点（1d4+位阶）' },
  { id: 'repairArmor', label: '修理护甲', icon: 'shield', description: '清除护甲槽（1d4+位阶）' },
  { id: 'prepare', label: '做好准备', icon: 'bandage', description: '获得1希望点' },
];

const LONG_REST_OPTIONS: { id: LongRestAction; label: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { id: 'treatAllWounds', label: '处理所有伤口', icon: 'heart', description: '恢复所有标记的生命点' },
  { id: 'relieveAllStress', label: '缓解所有压力', icon: 'flash', description: '清除所有压力点' },
  { id: 'repairAllArmor', label: '修理所有护甲', icon: 'shield', description: '清除所有护甲槽' },
  { id: 'prepareFully', label: '做好充分准备', icon: 'bandage', description: '获得2希望点' },
  { id: 'advanceProject', label: '推进长期项目', icon: 'construct', description: '推进一个长期项目的进度' },
];

export function RestScreen() {
  const navigation = useNavigation();
  const character = useGameStore((s) => s.character);
  const updateCharacterHp = useGameStore((s) => s.updateCharacterHp);
  const updateCharacterStress = useGameStore((s) => s.updateCharacterStress);
  const updateCharacterHope = useGameStore((s) => s.updateCharacterHope);
  const updateCharacterArmorSlots = useGameStore((s) => s.updateCharacterArmorSlots);
  const updateFearPoints = useGameStore((s) => s.updateFearPoints);

  const [restType, setRestType] = useState<'short' | 'long'>('short');
  const [selectedActions, setSelectedActions] = useState<string[]>([]);

  const maxSelections = 2;
  const options = restType === 'short' ? SHORT_REST_OPTIONS : LONG_REST_OPTIONS;

  const toggleAction = (id: string) => {
    if (selectedActions.includes(id)) {
      setSelectedActions(selectedActions.filter((a) => a !== id));
    } else if (selectedActions.length < maxSelections) {
      setSelectedActions([...selectedActions, id]);
    }
  };

  const handleRest = () => {
    if (selectedActions.length === 0) {
      Alert.alert('提示', '请选择至少1个休整行动');
      return;
    }
    if (selectedActions.length < maxSelections) {
      Alert.alert('提示', `请选择${maxSelections}个休整行动`);
      return;
    }

    // TODO: Send to server for proper rule resolution via DaggerHeartRules.executeRest()
    // For now, apply simple effects locally
    for (const action of selectedActions) {
      switch (action) {
        case 'treatWounds':
        case 'treatAllWounds':
          updateCharacterHp(1);
          break;
        case 'relieveStress':
        case 'relieveAllStress':
          updateCharacterStress(-1);
          break;
        case 'repairArmor':
        case 'repairAllArmor':
          updateCharacterArmorSlots(1);
          break;
        case 'prepare':
        case 'prepareFully':
          updateCharacterHope(1);
          break;
        case 'advanceProject':
          // No local effect - server handles narrative
          break;
      }
    }

    // Fear gained on rest
    if (restType === 'short') {
      updateFearPoints(2); // avg of 1d4
      Alert.alert('短休完成', 'GM获得1d4恐惧点');
    } else {
      updateFearPoints(4); // avg of 1d4+2
      Alert.alert('长休完成', 'GM获得1d4+2恐惧点');
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color="#ecf0f1" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>休整</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Rest type selector */}
        <View style={styles.restTypeSelector}>
          <TouchableOpacity
            style={[styles.restTypeButton, restType === 'short' && styles.restTypeButtonActive]}
            onPress={() => { setRestType('short'); setSelectedActions([]); }}
          >
            <Ionicons name="cafe" size={20} color={restType === 'short' ? '#2ecc71' : '#7f8c8d'} />
            <Text style={[styles.restTypeLabel, restType === 'short' && styles.restTypeLabelActive]}>短休</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.restTypeButton, restType === 'long' && styles.restTypeButtonActive]}
            onPress={() => { setRestType('long'); setSelectedActions([]); }}
          >
            <Ionicons name="moon" size={20} color={restType === 'long' ? '#3498db' : '#7f8c8d'} />
            <Text style={[styles.restTypeLabel, restType === 'long' && styles.restTypeLabelActive]}>长休</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {restType === 'short'
              ? '短休：选择2个行动。GM获得1d4恐惧点。'
              : '长休：选择2个行动。GM获得1d4+2恐惧点。恢复所有领域卡使用次数。'}
          </Text>
        </View>

        {/* Character current state */}
        {character && (
          <View style={styles.currentState}>
            <Text style={styles.currentStateTitle}>当前状态</Text>
            <View style={styles.currentStateRow}>
              <Text style={styles.currentStateLabel}>生命</Text>
              <Text style={styles.currentStateValue}>{character.hp}/{character.maxHp}</Text>
            </View>
            <View style={styles.currentStateRow}>
              <Text style={styles.currentStateLabel}>压力</Text>
              <Text style={styles.currentStateValue}>{character.stress}/{character.maxStress}</Text>
            </View>
            <View style={styles.currentStateRow}>
              <Text style={styles.currentStateLabel}>护甲槽</Text>
              <Text style={styles.currentStateValue}>{character.armorSlots}/{character.maxArmorSlots}</Text>
            </View>
          </View>
        )}

        {/* Action selection */}
        <Text style={styles.selectionTitle}>
          选择行动 ({selectedActions.length}/{maxSelections})
        </Text>

        {options.map((option) => {
          const isSelected = selectedActions.includes(option.id);
          const isDisabled = !isSelected && selectedActions.length >= maxSelections;
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.actionCard,
                isSelected && styles.actionCardSelected,
                isDisabled && styles.actionCardDisabled,
              ]}
              onPress={() => !isDisabled && toggleAction(option.id)}
              disabled={isDisabled}
            >
              <View style={styles.actionHeader}>
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={isSelected ? '#2ecc71' : '#bdc3c7'}
                />
                <Text style={[styles.actionLabel, isSelected && styles.actionLabelSelected]}>
                  {option.label}
                </Text>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color="#2ecc71" />}
              </View>
              <Text style={styles.actionDescription}>{option.description}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Confirm */}
        <TouchableOpacity
          style={[styles.confirmButton, selectedActions.length < maxSelections && styles.confirmButtonDisabled]}
          onPress={handleRest}
          disabled={selectedActions.length < maxSelections}
        >
          <Text style={styles.confirmButtonText}>确认休整</Text>
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
  // Rest type selector
  restTypeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  restTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  restTypeButtonActive: {
    borderColor: '#2ecc71',
    backgroundColor: '#2ecc7111',
  },
  restTypeLabel: {
    color: '#7f8c8d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  restTypeLabelActive: {
    color: '#2ecc71',
  },
  // Info box
  infoBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 18,
  },
  // Current state
  currentState: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  currentStateTitle: {
    color: '#bdc3c7',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  currentStateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  currentStateLabel: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  currentStateValue: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  // Selection title
  selectionTitle: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  // Action card
  actionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  actionCardSelected: {
    borderColor: '#2ecc71',
    backgroundColor: '#2ecc7111',
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  actionLabel: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  actionLabelSelected: {
    color: '#2ecc71',
  },
  actionDescription: {
    color: '#7f8c8d',
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 28,
  },
  // Confirm
  confirmButton: {
    backgroundColor: '#2ecc71',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmButtonDisabled: {
    backgroundColor: '#2c3e50',
  },
  confirmButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
