import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { sendRestRequest } from '../hooks/useSocket';
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

  const [restType, setRestType] = useState<'short' | 'long'>('short');
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [projectDescription, setProjectDescription] = useState('');

  const maxSelections = 2;
  const options = restType === 'short' ? SHORT_REST_OPTIONS : LONG_REST_OPTIONS;
  const hasAdvanceProject = selectedActions.includes('advanceProject');

  const toggleAction = (id: string) => {
    if (selectedActions.includes(id)) {
      setSelectedActions(selectedActions.filter((a) => a !== id));
    } else if (selectedActions.length < maxSelections) {
      setSelectedActions([...selectedActions, id]);
    }
  };

  const handleRest = () => {
    if (selectedActions.length < maxSelections) return;

    const store = useGameStore.getState();
    store.setAiProcessing(true);

    sendRestRequest(
      restType,
      selectedActions,
      hasAdvanceProject ? projectDescription : undefined,
    );

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
            onPress={() => { setRestType('short'); setSelectedActions([]); setProjectDescription(''); }}
          >
            <Ionicons name="cafe" size={20} color={restType === 'short' ? '#2ecc71' : '#7f8c8d'} />
            <Text style={[styles.restTypeLabel, restType === 'short' && styles.restTypeLabelActive]}>短休</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.restTypeButton, restType === 'long' && styles.restTypeButtonActive]}
            onPress={() => { setRestType('long'); setSelectedActions([]); setProjectDescription(''); }}
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

        {/* Project description input (when advanceProject is selected) */}
        {hasAdvanceProject && (
          <View style={styles.projectInputContainer}>
            <Text style={styles.projectInputLabel}>项目描述</Text>
            <TextInput
              style={styles.projectInput}
              value={projectDescription}
              onChangeText={setProjectDescription}
              placeholder="描述你想推进的长期项目..."
              placeholderTextColor="#7f8c8d"
              multiline
              maxLength={200}
            />
          </View>
        )}

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
  selectionTitle: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
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
  projectInputContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  projectInputLabel: {
    color: '#9b59b6',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  projectInput: {
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#ecf0f1',
    fontSize: 14,
    maxHeight: 80,
  },
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
