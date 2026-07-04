import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useCharacterCreateStore, STEP_LABELS, STEP_DESCRIPTIONS } from '../store/characterCreateStore';
import type { CharacterConnection } from '../store/characterCreateStore';
import { useGameStore } from '../store/gameStore';
import { ATTRIBUTE_LABELS } from '@trpgmaster/shared';
import type { Attribute, ClassData, SubclassData, CreationFlowDef, CreationStepDef, CharacterCore, Character, DomainCard, Experience } from '@trpgmaster/shared';

// Generic step renderer components
import {
  SelectOneStep,
  MultiSelectStep,
  AttributeAllocateStep,
  TextInputStep,
  ResourcePreviewStep,
  ConnectionListStep,
} from '../components/creation';
import type { StepRendererProps } from '../components/creation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CharacterCreate'>;

// Step renderer registry
const STEP_RENDERERS: Record<string, React.ComponentType<StepRendererProps>> = {
  'select-one': SelectOneStep,
  'multi-select': MultiSelectStep,
  'attribute-allocate': AttributeAllocateStep,
  'text-input': TextInputStep,
  'resource-preview': ResourcePreviewStep,
  'connection-list': ConnectionListStep,
};

export function CharacterCreateScreen() {
  const navigation = useNavigation<NavigationProp>();
  const store = useCharacterCreateStore();
  const gameData = useGameStore((s) => s.gameData);
  const setCharacter = useGameStore((s) => s.setCharacter);
  const addCharacter = useGameStore((s) => s.addCharacter);
  const setActiveCharacter = useGameStore((s) => s.setActiveCharacter);
  const addCharacterCore = useGameStore((s) => s.addCharacterCore);
  const getCharacterCore = useGameStore((s) => s.getCharacterCore);
  const serverUrl = useGameStore((s) => s.serverUrl);

  const { steps, currentStep, data, systemId, coreId, loading } = store;
  const stepDef = steps[currentStep];
  const totalSteps = steps.length;

  // Fetch creation flow on mount
  useEffect(() => {
    const routeParams = navigation.getState()?.routes?.find(r => r.name === 'CharacterCreate')?.params as
      | { systemId?: string; coreId?: string; campaignId?: string }
      | undefined;

    const routeSystemId = routeParams?.systemId || 'daggerheart';
    const routeCoreId = routeParams?.coreId || null;

    store.setSystemId(routeSystemId);
    store.setCoreId(routeCoreId ?? null);

    // Pre-fill from existing CharacterCore (cross-system flow)
    if (routeCoreId) {
      const core = getCharacterCore(routeCoreId);
      if (core) {
        store.setStepData('name', core.name);
        store.setStepData('backstory', core.backstory);
        store.setStepData('personalQuest', core.personalQuest);
      }
    }

    // Fetch creation flow from server
    if (serverUrl) {
      fetch(`${serverUrl}/api/data/creation-flow?systemId=${routeSystemId}`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((flow: CreationFlowDef) => {
          if (flow.steps && flow.steps.length > 0) {
            store.setSteps(flow.steps);
          }
          store.setLoading(false);
        })
        .catch((err) => {
          console.warn('[CharacterCreate] Failed to fetch creation flow, using defaults:', err);
          // Fall back to default DH flow (already in store)
          store.setLoading(false);
        });
    } else {
      // No server URL, use default flow
      store.setLoading(false);
    }
  }, []);

  // ===== Validation =====

  const validateCurrentStep = (): string[] => {
    const errors: string[] = [];
    if (!stepDef) return errors;

    const stepId = stepDef.id;
    const stepRenderer = stepDef.renderer;
    const stepOptional = stepDef.optional;

    if (stepOptional) return errors;

    switch (stepId) {
      case 'class':
        if (!data.classId) errors.push('请选择职业');
        if (!data.subclassId) errors.push('请选择子职业');
        break;
      case 'ancestry':
        if (!data.ancestryId) errors.push('请选择种族');
        break;
      case 'community':
        if (!data.communityId) errors.push('请选择社群');
        break;
      case 'attributes':
        if (!data.attributes) errors.push('请分配属性值');
        break;
      case 'equipment':
        if (!data.mainWeaponId) errors.push('请选择主武器');
        break;
      case 'backstory':
        if (!(data.name as string)?.trim()) errors.push('请输入角色名');
        break;
      case 'domainCards':
        if (((data.domainCards as DomainCard[]) || []).length < 2) errors.push('请选择至少2张领域卡');
        break;
    }
    return errors;
  };

  const handleNext = () => {
    const errors = validateCurrentStep();
    if (errors.length > 0) {
      Alert.alert('提示', errors.join('\n'));
      return;
    }
    store.goNext();
  };

  // ===== Finish handler =====

  const handleFinish = async () => {
    const name = (data.name as string) || '';
    if (!name.trim()) {
      Alert.alert('提示', '请输入角色名');
      return;
    }

    // For DH system, build a full DaggerheartCharacter
    if (systemId === 'daggerheart') {
      const classId = data.classId as string || 'warrior';
      const subclassId = data.subclassId as string || 'warrior-valor';
      const ancestryId = data.ancestryId as string || 'human';
      const communityId = data.communityId as string || 'village';
      const mainWeaponId = data.mainWeaponId as string | null;
      const offWeaponId = data.offWeaponId as string | null;
      const armorId = data.armorId as string | null;
      const domainCards = (data.domainCards as DomainCard[]) || [];
      const connections = (data.connections as CharacterConnection[]) || [];
      const backstory = (data.backstory as string) || '';
      const personalQuest = (data.personalQuest as string) || '';
      const experiences = (data.experiences as Experience[]) || [];

      const classData = gameData.classes.find((c) => c.id === classId);
      const weaponData = gameData.weapons.find((w) => w.id === mainWeaponId);
      const offWeaponData = offWeaponId ? gameData.weapons.find((w) => w.id === offWeaponId) : undefined;
      const armorData = gameData.armor.find((a) => a.id === armorId);

      const attrs = (data.attributes as Record<Attribute, number>) || { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 };
      const baseHp = classData?.baseHp ?? 6;
      const baseEvasion = classData?.baseEvasion ?? 10;
      const baseStress = classData?.baseStress ?? 6;

      const character: Character = {
        id: `char_${Date.now()}`,
        name,
        classId,
        subclassId,
        ancestryId,
        communityId,
        level: 1,
        tier: 1 as const,
        proficiency: 1,
        attributes: attrs,
        attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
        hp: baseHp,
        maxHp: baseHp,
        stress: 0,
        maxStress: baseStress,
        hope: 2,
        maxHope: 6,
        armorSlots: 0,
        maxArmorSlots: armorData?.armorSlots ?? 3,
        evasion: baseEvasion + (attrs.agility ?? 0),
        minorThreshold: (armorData?.baseThreshold ?? 6) - 5,
        majorThreshold: armorData?.baseThreshold ?? 6,
        severeThreshold: armorData?.baseThresholdSevere ?? 13,
        mainWeapon: weaponData ? {
          id: weaponData.id,
          name: weaponData.name,
          nameEn: weaponData.nameEn,
          attribute: weaponData.attribute,
          distance: weaponData.distance,
          damageDie: weaponData.damageDie,
          damageModifier: weaponData.damageModifier,
          load: weaponData.load,
          traits: weaponData.traits,
          weaponTier: weaponData.weaponTier,
        } : {
          id: 'longsword',
          name: '长剑',
          nameEn: 'Longsword',
          attribute: 'agility' as const,
          distance: 'melee' as const,
          damageDie: 'd8' as const,
          damageModifier: 0,
          load: 'oneHanded' as const,
          traits: [],
          weaponTier: 1,
        },
        offWeapon: offWeaponData ? {
          id: offWeaponData.id,
          name: offWeaponData.name,
          nameEn: offWeaponData.nameEn,
          attribute: offWeaponData.attribute,
          distance: offWeaponData.distance,
          damageDie: offWeaponData.damageDie,
          damageModifier: offWeaponData.damageModifier,
          load: offWeaponData.load,
          traits: offWeaponData.traits,
          weaponTier: offWeaponData.weaponTier,
        } : undefined,
        armor: armorData ? {
          id: armorData.id,
          name: armorData.name,
          nameEn: armorData.nameEn,
          baseThreshold: armorData.baseThreshold,
          baseThresholdSevere: armorData.baseThresholdSevere,
          armorSlots: armorData.armorSlots,
          evasionPenalty: armorData.evasionPenalty,
          traits: armorData.traits,
          armorTier: armorData.armorTier,
        } : {
          id: 'leather-armor',
          name: '皮甲',
          nameEn: 'Leather Armor',
          baseThreshold: 6,
          baseThresholdSevere: 13,
          armorSlots: 3,
          evasionPenalty: 0,
          traits: [],
          armorTier: 1,
        },
        inventory: [],
        gold: { coins: 0, handfuls: 1, bags: 0, chests: 0 },
        domainCardConfig: {
          loadout: domainCards.slice(0, 5),
          vault: domainCards.slice(5),
          maxLoadout: 5,
        },
        featureUses: {},
        experiences,
        adventureSummaries: [],
        scars: [],
        conditions: [],
        resistances: [],
        reactionsUsed: 0,
        backstory,
        personalQuest,
        relationships: connections.map((c) => ({
          targetName: c.name,
          question: c.relationship,
          answer: c.description,
        })),
      };

      // Save character locally
      addCharacter(character);
      setActiveCharacter(character.id);

      // Create/update CharacterCore
      const core: CharacterCore = {
        id: coreId || `core_${Date.now()}`,
        name,
        level: 1,
        backstory,
        personalQuest,
        relationships: connections.map((c) => ({
          targetName: c.name,
          question: c.relationship,
          answer: c.description,
        })),
        adventureSummaries: [],
        systemVersions: { daggerheart: character.id },
      };
      addCharacterCore(core);

      // Sync character to server
      if (serverUrl) {
        try {
          const res = await fetch(`${serverUrl}/api/character`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(character),
          });
          if (res.ok) {
            console.log('[CharacterCreate] Character synced to server');
            await fetch(`${serverUrl}/api/session/start`, { method: 'POST' });
          } else {
            console.warn('[CharacterCreate] Server sync failed:', res.status);
          }
        } catch (err) {
          console.warn('[CharacterCreate] Could not sync character to server:', err);
        }
      }
    } else {
      // Non-DH system: placeholder for future implementation
      Alert.alert('提示', `${systemId} 规则系统的角色创建尚未实现`);
      return;
    }

    store.reset();
    navigation.navigate('Main');
  };

  // ===== Render =====

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>加载角色创建流程...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Get step label (try legacy label first, then stepDef.label)
  const getStepLabel = (step: CreationStepDef): string => {
    const legacyLabel = STEP_LABELS[step.id as keyof typeof STEP_LABELS];
    return legacyLabel || step.label;
  };

  // Render the current step using the generic renderer registry
  const renderCurrentStep = () => {
    if (!stepDef) return null;

    const Renderer = STEP_RENDERERS[stepDef.renderer];
    if (!Renderer) {
      return (
        <View style={styles.stepContainer}>
          <Text style={styles.unknownRendererText}>
            未知步骤类型: {stepDef.renderer}
          </Text>
        </View>
      );
    }

    return (
      <Renderer
        stepDef={stepDef}
        data={data}
        onChange={store.setStepData}
        gameData={gameData}
        errors={store.errors}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i <= currentStep && styles.progressDotActive,
              i === currentStep && styles.progressDotCurrent,
            ]}
          />
        ))}
      </View>

      {/* Step title */}
      <View style={styles.stepHeader}>
        <Text style={styles.stepNumber}>步骤 {currentStep + 1}/{totalSteps}</Text>
        <Text style={styles.stepTitle}>{stepDef ? getStepLabel(stepDef) : ''}</Text>
      </View>

      {/* Step content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderCurrentStep()}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navButtons}>
        {currentStep > 0 ? (
          <TouchableOpacity style={styles.navButton} onPress={store.goBack}>
            <Ionicons name="arrow-back" size={18} color="#ecf0f1" />
            <Text style={styles.navButtonText}>上一步</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {currentStep < totalSteps - 1 ? (
          <TouchableOpacity style={[styles.navButton, styles.navButtonPrimary]} onPress={handleNext}>
            <Text style={styles.navButtonText}>下一步</Text>
            <Ionicons name="arrow-forward" size={18} color="#ecf0f1" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.navButton, styles.navButtonFinish]} onPress={handleFinish}>
            <Text style={styles.navButtonText}>完成创建</Text>
            <Ionicons name="checkmark" size={18} color="#0f0f23" />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  // Progress bar
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2c3e50',
  },
  progressDotActive: {
    backgroundColor: '#2980b9',
  },
  progressDotCurrent: {
    backgroundColor: '#3498db',
    width: 12,
  },
  // Step header
  stepHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  stepNumber: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  stepTitle: {
    color: '#ecf0f1',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  // Step container
  stepContainer: {
    marginBottom: 16,
  },
  unknownRendererText: {
    color: '#e74c3c',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // Navigation buttons
  navButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#0f0f23',
    borderTopWidth: 1,
    borderTopColor: '#16213e',
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2c3e50',
    borderRadius: 8,
    paddingVertical: 12,
  },
  navButtonPrimary: {
    backgroundColor: '#2980b9',
  },
  navButtonFinish: {
    backgroundColor: '#2ecc71',
  },
  navButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
