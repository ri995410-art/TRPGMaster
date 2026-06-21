import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useCharacterCreateStore, STEP_LABELS, STEP_DESCRIPTIONS } from '../store/characterCreateStore';
import { useGameStore } from '../store/gameStore';
import { ATTRIBUTE_LABELS } from '@trpgmaster/shared';
import type { Attribute, ClassData, SubclassData } from '@trpgmaster/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CharacterCreate'>;

// Attribute allocation values
const ATTRIBUTE_VALUES = [2, 1, 1, 0, 0, -1];
const ATTRIBUTE_KEYS: Attribute[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export function CharacterCreateScreen() {
  const navigation = useNavigation<NavigationProp>();
  const store = useCharacterCreateStore();
  const gameData = useGameStore((s) => s.gameData);
  const setCharacter = useGameStore((s) => s.setCharacter);
  const addCharacter = useGameStore((s) => s.addCharacter);
  const setActiveCharacter = useGameStore((s) => s.setActiveCharacter);

  const currentStep = store.getCurrentStep();
  const totalSteps = store.getTotalSteps();
  const stepIndex = store.currentStep;

  // Local state for attribute allocation
  const [attrAllocation, setAttrAllocation] = useState<Record<Attribute, number | null>>(
    Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, null])) as Record<Attribute, number | null>,
  );
  const [usedValues, setUsedValues] = useState<boolean[]>(ATTRIBUTE_VALUES.map(() => false));

  // Local state for connections
  const [newConnName, setNewConnName] = useState('');
  const [newConnRel, setNewConnRel] = useState('');
  const [newConnDesc, setNewConnDesc] = useState('');

  const handleNext = () => {
    // Validate current step
    const errors: string[] = [];
    switch (currentStep) {
      case 'class':
        if (!store.classId) errors.push('请选择职业');
        if (!store.subclassId) errors.push('请选择子职业');
        break;
      case 'ancestry':
        if (!store.ancestryId) errors.push('请选择种族');
        break;
      case 'community':
        if (!store.communityId) errors.push('请选择社群');
        break;
      case 'attributes':
        if (!store.attributes) errors.push('请分配属性值');
        break;
      case 'equipment':
        if (!store.mainWeaponId) errors.push('请选择主武器');
        break;
      case 'backstory':
        if (!store.name.trim()) errors.push('请输入角色名');
        break;
      case 'domainCards':
        if (store.domainCards.length < 2) errors.push('请选择至少2张领域卡');
        break;
    }
    if (errors.length > 0) {
      Alert.alert('提示', errors.join('\n'));
      return;
    }
    store.goNext();
  };

  const serverUrl = useGameStore((s) => s.serverUrl);

  const handleFinish = async () => {
    if (!store.name.trim()) {
      Alert.alert('提示', '请输入角色名');
      return;
    }

    // Look up class data for proper resource calculation
    const classData = gameData.classes.find((c) => c.id === store.classId);
    const weaponData = gameData.weapons.find((w) => w.id === store.mainWeaponId);
    const armorData = gameData.armor.find((a) => a.id === store.armorId);

    const attrs = store.attributes || { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 };
    const baseHp = classData?.baseHp ?? 6;
    const baseEvasion = classData?.baseEvasion ?? 10;
    const baseStress = classData?.baseStress ?? 6;

    const character = {
      id: `char_${Date.now()}`,
      name: store.name,
      classId: store.classId || 'warrior',
      subclassId: store.subclassId || 'warrior-valor',
      ancestryId: store.ancestryId || 'human',
      communityId: store.communityId || 'village',
      level: 1,
      tier: 1 as const,
      proficiency: 1,
      attributes: attrs,
      attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
      hp: baseHp + 1, // baseHp + level
      maxHp: baseHp + 1,
      stress: 0,
      maxStress: baseStress,
      hope: 6,
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
        loadout: store.domainCards.slice(0, 5),
        vault: store.domainCards.slice(5),
        maxLoadout: 5,
      },
      experiences: store.experiences,
      scars: [],
      conditions: [],
      resistances: [],
      reactionsUsed: 0,
      backstory: store.backstory,
      personalQuest: store.personalQuest,
      relationships: store.connections.map((c) => ({
        targetName: c.name,
        question: c.relationship,
        answer: c.description,
      })),
    };

    // Save character locally (multi-character support)
    addCharacter(character as any);
    setActiveCharacter(character.id);

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
          // Also start the session so AI GM knows we're active
          await fetch(`${serverUrl}/api/session/start`, { method: 'POST' });
        } else {
          console.warn('[CharacterCreate] Server sync failed:', res.status);
        }
      } catch (err) {
        console.warn('[CharacterCreate] Could not sync character to server:', err);
      }
    }

    store.reset();
    navigation.navigate('Main');
  };

  // ===== Step renderers =====

  const renderClassStep = () => {
    const selectedClass: ClassData | undefined = gameData.classes.find((c) => c.id === store.classId);
    const subclassesForClass: SubclassData[] = gameData.subclasses.filter((sc) => sc.classId === store.classId);
    const selectedSubclass: SubclassData | undefined = subclassesForClass.find((sc) => sc.id === store.subclassId);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.class}</Text>

        {/* Class selection grid */}
        <Text style={styles.sectionLabel}>选择职业</Text>
        {gameData.classes.length > 0 ? (
          <View style={styles.classGrid}>
            {gameData.classes.map((cls) => (
              <TouchableOpacity
                key={cls.id}
                style={[
                  styles.classChip,
                  store.classId === cls.id && styles.classChipSelected,
                ]}
                onPress={() => {
                  store.setClassId(cls.id);
                  // Auto-clear subclass since it depends on class
                }}
              >
                <Text style={[styles.classChipName, store.classId === cls.id && styles.classChipNameSelected]}>
                  {cls.name}
                </Text>
                <Text style={[styles.classChipEn, store.classId === cls.id && styles.classChipEnSelected]}>
                  {cls.nameEn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>
              职业数据将在连接服务器后加载
            </Text>
          </View>
        )}

        {/* Class detail panel */}
        {selectedClass && (
          <View style={styles.classDetailPanel}>
            <Text style={styles.classDetailTitle}>{selectedClass.name} — {selectedClass.nameEn}</Text>

            {/* Class stats */}
            <View style={styles.classStatsRow}>
              <View style={styles.classStatItem}>
                <Text style={styles.classStatLabel}>生命</Text>
                <Text style={styles.classStatValue}>{selectedClass.baseHp}</Text>
              </View>
              <View style={styles.classStatItem}>
                <Text style={styles.classStatLabel}>闪避</Text>
                <Text style={styles.classStatValue}>{selectedClass.baseEvasion}</Text>
              </View>
              <View style={styles.classStatItem}>
                <Text style={styles.classStatLabel}>压力</Text>
                <Text style={styles.classStatValue}>{selectedClass.baseStress}</Text>
              </View>
              <View style={styles.classStatItem}>
                <Text style={styles.classStatLabel}>领域</Text>
                <Text style={styles.classStatValueSmall}>
                  {selectedClass.domains.map((d) => {
                    const DOMAIN_LABELS: Record<string, string> = {
                      arcane: '奥术', blade: '利刃', bone: '骸骨', codex: '典籍',
                      elegance: '优雅', midnight: '午夜', sage: '贤者', splendor: '辉耀', valor: '勇气',
                    };
                    return DOMAIN_LABELS[d] || d;
                  }).join('、')}
                </Text>
              </View>
            </View>

            {/* Class features */}
            <View style={styles.featureSection}>
              <Text style={styles.featureSectionTitle}>职业特性</Text>

              {/* Hope Feature */}
              <View style={styles.featureCard}>
                <View style={styles.featureHeader}>
                  <Ionicons name="sunny" size={14} color="#3498db" />
                  <Text style={styles.featureName}>{selectedClass.hopeFeature.name}</Text>
                  <Text style={styles.featureCost}>{selectedClass.hopeFeature.cost}希望</Text>
                </View>
                <Text style={styles.featureDesc}>{selectedClass.hopeFeature.description}</Text>
              </View>

              {/* Class Feature */}
              <View style={styles.featureCard}>
                <View style={styles.featureHeader}>
                  <Ionicons name="star" size={14} color="#f39c12" />
                  <Text style={styles.featureName}>{selectedClass.classFeature.name}</Text>
                  {selectedClass.classFeature.usesPerRest && (
                    <Text style={styles.featureUses}>
                      {selectedClass.classFeature.usesPerRest === 'shortRest' ? '短休' :
                       selectedClass.classFeature.usesPerRest === 'longRest' ? '长休' : '每次会话'}
                    </Text>
                  )}
                </View>
                <Text style={styles.featureDesc}>{selectedClass.classFeature.description}</Text>
              </View>
            </View>

            {/* Subclass selection */}
            <View style={styles.subclassSection}>
              <Text style={styles.featureSectionTitle}>选择子职业</Text>
              {subclassesForClass.length > 0 ? (
                subclassesForClass.map((sc) => (
                  <TouchableOpacity
                    key={sc.id}
                    style={[
                      styles.subclassCard,
                      store.subclassId === sc.id && styles.subclassCardSelected,
                    ]}
                    onPress={() => store.setSubclassId(sc.id)}
                  >
                    <Text style={[styles.subclassTitle, store.subclassId === sc.id && styles.subclassTitleSelected]}>
                      {sc.name}
                    </Text>
                    <Text style={styles.subclassEn}>{sc.nameEn}</Text>
                    <Text style={styles.subclassDesc}>{sc.description}</Text>

                    {/* Show subclass features preview */}
                    {store.subclassId === sc.id && (
                      <View style={styles.subclassFeaturesPreview}>
                        <View style={styles.subclassFeatureRow}>
                          <Text style={styles.subclassFeatureLevel}>基础 (Lv.{sc.features.base.level})</Text>
                          <Text style={styles.subclassFeatureName}>{sc.features.base.name}</Text>
                          <Text style={styles.subclassFeatureIsCard}>{sc.features.base.isCard ? '卡牌' : ''}</Text>
                        </View>
                        <Text style={styles.subclassFeatureDesc}>{sc.features.base.description}</Text>

                        <View style={styles.subclassFeatureRow}>
                          <Text style={styles.subclassFeatureLevel}>进阶 (Lv.{sc.features.advanced.level})</Text>
                          <Text style={styles.subclassFeatureName}>{sc.features.advanced.name}</Text>
                          <Text style={styles.subclassFeatureIsCard}>{sc.features.advanced.isCard ? '卡牌' : ''}</Text>
                        </View>
                        <Text style={styles.subclassFeatureDesc}>{sc.features.advanced.description}</Text>

                        <View style={styles.subclassFeatureRow}>
                          <Text style={styles.subclassFeatureLevel}>精通 (Lv.{sc.features.mastery.level})</Text>
                          <Text style={styles.subclassFeatureName}>{sc.features.mastery.name}</Text>
                          <Text style={styles.subclassFeatureIsCard}>{sc.features.mastery.isCard ? '卡牌' : ''}</Text>
                        </View>
                        <Text style={styles.subclassFeatureDesc}>{sc.features.mastery.description}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noDataText}>子职业数据将在连接服务器后加载</Text>
              )}
            </View>

            {/* Background & Relationship questions */}
            {selectedSubclass && (
              <View style={styles.questionsSection}>
                <Text style={styles.featureSectionTitle}>背景与关系</Text>
                {selectedSubclass.backgroundQuestions.map((q, i) => (
                  <View key={`bg-${i}`} style={styles.questionItem}>
                    <Text style={styles.questionLabel}>背景问题 {i + 1}</Text>
                    <Text style={styles.questionText}>{q}</Text>
                    <TextInput
                      style={styles.questionInput}
                      value={store.classBackgroundAnswers[i] || ''}
                      onChangeText={(text) => store.setClassBackgroundAnswer(i, text)}
                      placeholder="你的回答..."
                      placeholderTextColor="#7f8c8d"
                      multiline
                    />
                  </View>
                ))}
                {selectedSubclass.relationshipQuestions.map((q, i) => (
                  <View key={`rel-${i}`} style={styles.questionItem}>
                    <Text style={styles.questionLabel}>关系问题 {i + 1}</Text>
                    <Text style={styles.questionText}>{q}</Text>
                    <TextInput
                      style={styles.questionInput}
                      value={store.classRelationshipAnswers[i] || ''}
                      onChangeText={(text) => store.setClassRelationshipAnswer(i, text)}
                      placeholder="你的回答..."
                      placeholderTextColor="#7f8c8d"
                      multiline
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderAncestryStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.ancestry}</Text>
      {gameData.ancestries.length > 0 ? (
        gameData.ancestries.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.optionCard, store.ancestryId === item.id && styles.optionCardSelected]}
            onPress={() => store.setAncestryId(item.id)}
          >
            <Text style={styles.optionTitle}>{item.name} ({item.nameEn})</Text>
            <Text style={styles.optionDesc}>{item.description}</Text>
            {/* Show ancestry features */}
            {store.ancestryId === item.id && item.features && (
              <View style={styles.featurePreviewList}>
                {item.features.map((feat, fi) => (
                  <View key={fi} style={styles.featurePreviewItem}>
                    <View style={styles.featurePreviewHeader}>
                      <Text style={styles.featurePreviewName}>{feat.name}</Text>
                      <Text style={styles.featurePreviewType}>
                        {feat.type === 'passive' ? '被动' : feat.type === 'action' ? '行动' : feat.type === 'trait' ? '特性' : feat.type}
                      </Text>
                      {feat.hopeCost && <Text style={styles.featurePreviewCost}>{feat.hopeCost}希望</Text>}
                      {feat.stressCost && <Text style={styles.featurePreviewCost}>{feat.stressCost}压力</Text>}
                    </View>
                    <Text style={styles.featurePreviewDesc}>{feat.description}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>
            种族数据将在连接服务器后加载
          </Text>
        </View>
      )}
    </View>
  );

  const renderCommunityStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.community}</Text>
      {gameData.communities.length > 0 ? (
        gameData.communities.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.optionCard, store.communityId === item.id && styles.optionCardSelected]}
            onPress={() => store.setCommunityId(item.id)}
          >
            <Text style={styles.optionTitle}>{item.name} ({item.nameEn})</Text>
            <Text style={styles.optionDesc}>{item.description}</Text>
            {/* Show community feature */}
            {store.communityId === item.id && item.feature && (
              <View style={styles.featurePreviewList}>
                <View style={styles.featurePreviewItem}>
                  <View style={styles.featurePreviewHeader}>
                    <Text style={styles.featurePreviewName}>{item.feature.name}</Text>
                    <Text style={styles.featurePreviewType}>
                      {item.feature.type === 'passive' ? '被动' : '行动'}
                    </Text>
                    {item.feature.hopeCost && <Text style={styles.featurePreviewCost}>{item.feature.hopeCost}希望</Text>}
                    {item.feature.stressCost && <Text style={styles.featurePreviewCost}>{item.feature.stressCost}压力</Text>}
                  </View>
                  <Text style={styles.featurePreviewDesc}>{item.feature.description}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>
            社群数据将在连接服务器后加载
          </Text>
        </View>
      )}
    </View>
  );

  const renderAttributesStep = () => {
    const assignAttribute = (attr: Attribute, valueIndex: number) => {
      const newAllocation = { ...attrAllocation };
      const newUsed = [...usedValues];

      // If this attribute already has a value, un-use it
      if (newAllocation[attr] !== null) {
        const oldIndex = ATTRIBUTE_VALUES.indexOf(newAllocation[attr]!);
        // Find the first unused slot with the same value
        for (let i = 0; i < ATTRIBUTE_VALUES.length; i++) {
          if (ATTRIBUTE_VALUES[i] === newAllocation[attr] && newUsed[i]) {
            newUsed[i] = false;
            break;
          }
        }
      }

      // Assign new value
      if (newUsed[valueIndex]) return; // already used
      newAllocation[attr] = ATTRIBUTE_VALUES[valueIndex];
      newUsed[valueIndex] = true;

      setAttrAllocation(newAllocation);
      setUsedValues(newUsed);

      // Check if all attributes are assigned
      const allAssigned = ATTRIBUTE_KEYS.every((k) => newAllocation[k] !== null);
      if (allAssigned) {
        const attrs = Object.fromEntries(
          ATTRIBUTE_KEYS.map((k) => [k, newAllocation[k]!]),
        ) as Record<Attribute, number>;
        store.setAttributes(attrs);
      }
    };

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.attributes}</Text>
        <Text style={styles.attributeHint}>
          将 +2, +1, +1, 0, 0, -1 分配给六大属性
        </Text>
        {ATTRIBUTE_KEYS.map((attr) => (
          <View key={attr} style={styles.attributeRow}>
            <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
            <View style={styles.attributeValues}>
              {ATTRIBUTE_VALUES.map((val, idx) => {
                const isSelected = attrAllocation[attr] === val && usedValues[idx];
                const isUsed = usedValues[idx] && attrAllocation[attr] !== val;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.attributeValueChip,
                      isSelected && styles.attributeValueChipSelected,
                      isUsed && styles.attributeValueChipUsed,
                    ]}
                    onPress={() => assignAttribute(attr, idx)}
                    disabled={isUsed}
                  >
                    <Text
                      style={[
                        styles.attributeValueText,
                        isSelected && styles.attributeValueTextSelected,
                        isUsed && styles.attributeValueTextUsed,
                      ]}
                    >
                      {val > 0 ? '+' : ''}{val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderResourcesStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.resources}</Text>
      <View style={styles.resourceInfoBox}>
        <Text style={styles.resourceInfoTitle}>基础资源（由职业和属性决定）</Text>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>闪避值</Text>
          <Text style={styles.resourceInfoValue}>= 10 + 敏捷调整值</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>生命点</Text>
          <Text style={styles.resourceInfoValue}>= 职业基础 + 等级</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>压力点</Text>
          <Text style={styles.resourceInfoValue}>6 (固定)</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>希望点</Text>
          <Text style={styles.resourceInfoValue}>6 (固定)</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>护甲槽</Text>
          <Text style={styles.resourceInfoValue}>= 护甲提供</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>伤害阈值</Text>
          <Text style={styles.resourceInfoValue}>= 护甲基础 + 等级</Text>
        </View>
      </View>
      <Text style={styles.resourceNote}>
        这些数值将在完成角色创建后自动计算
      </Text>
    </View>
  );

  const renderEquipmentStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.equipment}</Text>
      <Text style={styles.equipmentSectionLabel}>主武器</Text>
      {gameData.weapons.length > 0 ? (
        <FlatList
          data={gameData.weapons.filter((w) => w.load !== 'offHand')}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.optionCard, store.mainWeaponId === item.id && styles.optionCardSelected]}
              onPress={() => store.setMainWeaponId(item.id)}
            >
              <Text style={styles.optionTitle}>{item.name}</Text>
              <Text style={styles.optionDesc}>{item.damageDie} 伤害 · {item.load === 'twoHanded' ? '双手' : '单手'}</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
        />
      ) : (
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>武器数据将在连接服务器后加载</Text>
        </View>
      )}

      <Text style={[styles.equipmentSectionLabel, { marginTop: 16 }]}>副武器（可选）</Text>
      <TouchableOpacity
        style={[styles.optionCard, store.offWeaponId === null && styles.optionCardSelected]}
        onPress={() => store.setOffWeaponId(null)}
      >
        <Text style={styles.optionTitle}>不装备副武器</Text>
      </TouchableOpacity>
      {gameData.weapons.length > 0 && (
        gameData.weapons
          .filter((w) => w.load === 'offHand' || w.load === 'oneHanded')
          .map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.optionCard, store.offWeaponId === item.id && styles.optionCardSelected]}
              onPress={() => store.setOffWeaponId(item.id)}
            >
              <Text style={styles.optionTitle}>{item.name}</Text>
              <Text style={styles.optionDesc}>{item.damageDie} 伤害 · {item.load === 'offHand' ? '副手' : '单手'}</Text>
            </TouchableOpacity>
          ))
      )}

      <Text style={[styles.equipmentSectionLabel, { marginTop: 16 }]}>护甲</Text>
      {gameData.armor.length > 0 ? (
        <FlatList
          data={gameData.armor}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.optionCard, store.armorId === item.id && styles.optionCardSelected]}
              onPress={() => store.setArmorId(item.id)}
            >
              <Text style={styles.optionTitle}>{item.name}</Text>
              <Text style={styles.optionDesc}>阈值:{item.baseThreshold}/{item.baseThresholdSevere} 槽:{item.armorSlots}</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
        />
      ) : (
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>护甲数据将在连接服务器后加载</Text>
        </View>
      )}
    </View>
  );

  const renderBackstoryStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.backstory}</Text>
      <TextInput
        style={styles.nameInput}
        value={store.name}
        onChangeText={store.setName}
        placeholder="角色名"
        placeholderTextColor="#7f8c8d"
      />
      <TextInput
        style={styles.textArea}
        value={store.backstory}
        onChangeText={store.setBackstory}
        placeholder="你的背景故事...你为何踏上冒险之旅？"
        placeholderTextColor="#7f8c8d"
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />
      <TextInput
        style={styles.textInput}
        value={store.personalQuest}
        onChangeText={store.setPersonalQuest}
        placeholder="个人任务（你希望达成的目标）"
        placeholderTextColor="#7f8c8d"
      />
    </View>
  );

  const renderDomainCardsStep = () => {
    // Filter domain cards by class domains
    const selectedClass = gameData.classes.find((c) => c.id === store.classId);
    const classDomains = selectedClass?.domains || [];
    const availableCards = gameData.domainCards.filter(
      (c) => c.level === 1 && (classDomains as string[]).includes(c.domain),
    );

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.domainCards}</Text>
        <Text style={styles.domainHint}>
          选择2张1级领域卡作为初始能力 (已选: {store.domainCards.length}/2)
        </Text>
        {classDomains.length > 0 && (
          <Text style={styles.domainFilterHint}>
            可选领域：{classDomains.map((d) => {
              const DOMAIN_LABELS: Record<string, string> = {
                arcane: '奥术', blade: '利刃', bone: '骸骨', codex: '典籍',
                elegance: '优雅', midnight: '午夜', sage: '贤者', splendor: '辉耀', valor: '勇气',
              };
              return DOMAIN_LABELS[d] || d;
            }).join('、')}
          </Text>
        )}
        {availableCards.length > 0 ? (
          availableCards.map((item) => {
            const isSelected = store.domainCards.some((c) => c.id === item.id);
            const isFull = store.domainCards.length >= 2 && !isSelected;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionCardSelected,
                  isFull && styles.optionCardDisabled,
                ]}
                onPress={() => {
                  if (isSelected) {
                    store.setDomainCards(store.domainCards.filter((c) => c.id !== item.id));
                  } else if (store.domainCards.length < 2) {
                    store.setDomainCards([...store.domainCards, item]);
                  }
                }}
                disabled={isFull}
              >
                <Text style={styles.optionTitle}>{item.name}</Text>
                <Text style={styles.optionDesc}>
                  {item.domain} · {item.type} · {(item.hopeCost ?? 0) > 0 ? `${item.hopeCost}希望` : '被动'}
                </Text>
                {/* Show details when selected */}
                {isSelected && (
                  <View style={styles.domainCardDetail}>
                    {item.effect && (
                      <Text style={styles.domainCardEffect}>{item.effect}</Text>
                    )}
                    {item.description && (
                      <Text style={styles.domainCardDesc}>{item.description}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>
              {gameData.domainCards.length > 0
                ? '请先选择职业以查看可选领域卡'
                : '领域卡数据将在连接服务器后加载'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderConnectionsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS.connections}</Text>
      {store.connections.map((conn, i) => (
        <View key={i} style={styles.connectionCard}>
          <View style={styles.connectionHeader}>
            <Text style={styles.connectionName}>{conn.name}</Text>
            <TouchableOpacity onPress={() => store.removeConnection(i)}>
              <Ionicons name="close-circle" size={18} color="#e74c3c" />
            </TouchableOpacity>
          </View>
          <Text style={styles.connectionRel}>{conn.relationship}</Text>
          <Text style={styles.connectionDesc}>{conn.description}</Text>
        </View>
      ))}
      <View style={styles.addConnectionBox}>
        <TextInput
          style={styles.textInput}
          value={newConnName}
          onChangeText={setNewConnName}
          placeholder="人物名"
          placeholderTextColor="#7f8c8d"
        />
        <TextInput
          style={styles.textInput}
          value={newConnRel}
          onChangeText={setNewConnRel}
          placeholder="关系（如：导师、旧友、家人）"
          placeholderTextColor="#7f8c8d"
        />
        <TextInput
          style={styles.textInput}
          value={newConnDesc}
          onChangeText={setNewConnDesc}
          placeholder="描述"
          placeholderTextColor="#7f8c8d"
        />
        <TouchableOpacity
          style={styles.addConnectionButton}
          onPress={() => {
            if (newConnName.trim()) {
              store.addConnection({
                name: newConnName.trim(),
                relationship: newConnRel.trim() || '未知',
                description: newConnDesc.trim(),
              });
              setNewConnName('');
              setNewConnRel('');
              setNewConnDesc('');
            }
          }}
        >
          <Ionicons name="add-circle" size={18} color="#3498db" />
          <Text style={styles.addConnectionText}>添加关系</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'class': return renderClassStep();
      case 'ancestry': return renderAncestryStep();
      case 'community': return renderCommunityStep();
      case 'attributes': return renderAttributesStep();
      case 'resources': return renderResourcesStep();
      case 'equipment': return renderEquipmentStep();
      case 'backstory': return renderBackstoryStep();
      case 'domainCards': return renderDomainCardsStep();
      case 'connections': return renderConnectionsStep();
    }
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
              i <= stepIndex && styles.progressDotActive,
              i === stepIndex && styles.progressDotCurrent,
            ]}
          />
        ))}
      </View>

      {/* Step title */}
      <View style={styles.stepHeader}>
        <Text style={styles.stepNumber}>步骤 {stepIndex + 1}/{totalSteps}</Text>
        <Text style={styles.stepTitle}>{STEP_LABELS[currentStep]}</Text>
      </View>

      {/* Step content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderCurrentStep()}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navButtons}>
        {stepIndex > 0 ? (
          <TouchableOpacity style={styles.navButton} onPress={store.goBack}>
            <Ionicons name="arrow-back" size={18} color="#ecf0f1" />
            <Text style={styles.navButtonText}>上一步</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {stepIndex < totalSteps - 1 ? (
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
  stepDescription: {
    color: '#bdc3c7',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  // Option card
  optionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  optionCardSelected: {
    borderColor: '#3498db',
    backgroundColor: '#3498db11',
  },
  optionCardDisabled: {
    opacity: 0.5,
  },
  optionTitle: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  optionDesc: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  // Placeholder
  placeholderBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c3e50',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: '#7f8c8d',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  // Attributes
  attributeHint: {
    color: '#f39c12',
    fontSize: 12,
    marginBottom: 12,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  attributeName: {
    color: '#ecf0f1',
    fontSize: 14,
    width: 50,
  },
  attributeValues: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  attributeValueChip: {
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attributeValueChipSelected: {
    backgroundColor: '#3498db',
  },
  attributeValueChipUsed: {
    backgroundColor: '#1a1a2e',
    opacity: 0.4,
  },
  attributeValueText: {
    color: '#bdc3c7',
    fontSize: 13,
  },
  attributeValueTextSelected: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  attributeValueTextUsed: {
    color: '#7f8c8d',
  },
  // Resources
  resourceInfoBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  resourceInfoTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resourceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  resourceInfoLabel: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  resourceInfoValue: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  resourceNote: {
    color: '#7f8c8d',
    fontSize: 12,
    textAlign: 'center',
  },
  // Equipment
  equipmentSectionLabel: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  // Inputs
  nameInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  textInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  textArea: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
    minHeight: 120,
  },
  // Domain cards
  domainHint: {
    color: '#9b59b6',
    fontSize: 12,
    marginBottom: 4,
  },
  domainFilterHint: {
    color: '#3498db',
    fontSize: 12,
    marginBottom: 12,
  },
  domainCardDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2c3e50',
  },
  domainCardEffect: {
    color: '#f39c12',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 18,
    marginBottom: 4,
  },
  domainCardDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
  },
  // Feature preview for ancestry/community
  featurePreviewList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2c3e50',
  },
  featurePreviewItem: {
    marginBottom: 8,
  },
  featurePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featurePreviewName: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  featurePreviewType: {
    color: '#f39c12',
    fontSize: 10,
    backgroundColor: '#f39c1222',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  featurePreviewCost: {
    color: '#e67e22',
    fontSize: 10,
  },
  featurePreviewDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  // Connections
  connectionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectionName: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  connectionRel: {
    color: '#3498db',
    fontSize: 12,
    marginTop: 2,
  },
  connectionDesc: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 4,
  },
  addConnectionBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
    borderStyle: 'dashed',
  },
  addConnectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addConnectionText: {
    color: '#3498db',
    fontSize: 14,
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
  // Class step new styles
  sectionLabel: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  classChip: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2c3e50',
    alignItems: 'center',
    minWidth: 80,
  },
  classChipSelected: {
    borderColor: '#3498db',
    backgroundColor: '#3498db22',
  },
  classChipName: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  classChipNameSelected: {
    color: '#3498db',
  },
  classChipEn: {
    color: '#7f8c8d',
    fontSize: 10,
    marginTop: 2,
  },
  classChipEnSelected: {
    color: '#3498db88',
  },
  classDetailPanel: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c3e50',
    marginBottom: 16,
  },
  classDetailTitle: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  classStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  classStatItem: {
    alignItems: 'center',
    minWidth: 50,
  },
  classStatLabel: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  classStatValue: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  classStatValueSmall: {
    color: '#9b59b6',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  featureSection: {
    marginBottom: 16,
  },
  featureSectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  featureCard: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f39c12',
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  featureName: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  featureCost: {
    color: '#3498db',
    fontSize: 11,
  },
  featureUses: {
    color: '#e67e22',
    fontSize: 11,
  },
  featureDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
  },
  subclassSection: {
    marginBottom: 16,
  },
  subclassCard: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  subclassCardSelected: {
    borderColor: '#9b59b6',
    backgroundColor: '#9b59b611',
  },
  subclassTitle: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
  },
  subclassTitleSelected: {
    color: '#9b59b6',
  },
  subclassEn: {
    color: '#7f8c8d',
    fontSize: 11,
    marginTop: 1,
  },
  subclassDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  subclassFeaturesPreview: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2c3e50',
  },
  subclassFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  subclassFeatureLevel: {
    color: '#f39c12',
    fontSize: 11,
    fontWeight: 'bold',
  },
  subclassFeatureName: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  subclassFeatureIsCard: {
    color: '#9b59b6',
    fontSize: 10,
  },
  subclassFeatureDesc: {
    color: '#bdc3c7',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  noDataText: {
    color: '#7f8c8d',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  questionsSection: {
    marginBottom: 8,
  },
  questionItem: {
    marginBottom: 12,
  },
  questionLabel: {
    color: '#e67e22',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  questionText: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  questionInput: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ecf0f1',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2c3e50',
    minHeight: 60,
  },
});
