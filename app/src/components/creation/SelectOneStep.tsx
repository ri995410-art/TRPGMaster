import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StepRendererProps } from './StepRendererProps';
import { sharedStyles } from './StepRendererProps';
import type { ClassData, SubclassData, Attribute, AncestryData, CommunityData, WeaponData, ArmorData } from '@trpgmaster/shared';

const DOMAIN_LABELS: Record<string, string> = {
  arcane: '奥术', blade: '利刃', bone: '骸骨', codex: '典籍',
  elegance: '优雅', midnight: '午夜', sage: '贤者', splendor: '辉耀', valor: '勇气',
};

/**
 * SelectOneStep — generic single-select step.
 *
 * For Daggerheart, handles:
 * - Class selection (with subclasses, class details, background/relationship questions)
 * - Ancestry selection (with features)
 * - Community selection (with feature)
 * - Equipment selection (weapons + armor)
 */
export function SelectOneStep({ stepDef, data, onChange, gameData }: StepRendererProps) {
  const config = stepDef.rendererConfig || {};
  const dataKey = config.dataKey as string || stepDef.dataKey;

  // Equipment step: special multi-section rendering
  if (dataKey === 'weapons+armor') {
    return <EquipmentSection data={data} onChange={onChange} gameData={gameData} />;
  }

  // Class step: special rendering with subclasses and class details
  if (dataKey === 'classes' && config.showSubclasses) {
    return <ClassSection data={data} onChange={onChange} gameData={gameData} />;
  }

  // Ancestry step
  if (dataKey === 'ancestries') {
    return <AncestrySection data={data} onChange={onChange} gameData={gameData} />;
  }

  // Community step
  if (dataKey === 'communities') {
    return <CommunitySection data={data} onChange={onChange} gameData={gameData} />;
  }

  // Generic single-select fallback
  return <GenericSelectSection stepDef={stepDef} data={data} onChange={onChange} gameData={gameData} />;
}

// ===== Class Section (DH-specific) =====

function ClassSection({ data, onChange, gameData }: { data: Record<string, unknown>; onChange: (key: string, value: unknown) => void; gameData: any }) {
  const classId = data.classId as string | null || null;
  const subclassId = data.subclassId as string | null || null;
  const classBackgroundAnswers = (data.classBackgroundAnswers as string[]) || [];
  const classRelationshipAnswers = (data.classRelationshipAnswers as string[]) || [];

  const selectedClass: ClassData | undefined = gameData.classes.find((c: ClassData) => c.id === classId);
  const subclassesForClass: SubclassData[] = gameData.subclasses.filter((sc: SubclassData) => sc.classId === classId);
  const selectedSubclass: SubclassData | undefined = subclassesForClass.find((sc: SubclassData) => sc.id === subclassId);

  const handleClassSelect = (id: string) => {
    onChange('classId', id);
    onChange('subclassId', null);
    onChange('classBackgroundAnswers', []);
    onChange('classRelationshipAnswers', []);
  };

  const handleSubclassSelect = (id: string) => {
    onChange('subclassId', id);
    onChange('classBackgroundAnswers', []);
    onChange('classRelationshipAnswers', []);
  };

  const handleBackgroundAnswer = (index: number, answer: string) => {
    const answers = [...classBackgroundAnswers];
    answers[index] = answer;
    onChange('classBackgroundAnswers', answers);
  };

  const handleRelationshipAnswer = (index: number, answer: string) => {
    const answers = [...classRelationshipAnswers];
    answers[index] = answer;
    onChange('classRelationshipAnswers', answers);
  };

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>选择你的职业和子职业</Text>

      {/* Class selection grid */}
      <Text style={sharedStyles.sectionLabel}>选择职业</Text>
      {gameData.classes.length > 0 ? (
        <View style={styles.classGrid}>
          {gameData.classes.map((cls: ClassData) => (
            <TouchableOpacity
              key={cls.id}
              style={[
                styles.classChip,
                classId === cls.id && styles.classChipSelected,
              ]}
              onPress={() => handleClassSelect(cls.id)}
            >
              <Text style={[styles.classChipName, classId === cls.id && styles.classChipNameSelected]}>
                {cls.name}
              </Text>
              <Text style={[styles.classChipEn, classId === cls.id && styles.classChipEnSelected]}>
                {cls.nameEn}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>
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
                {selectedClass.domains.map((d: string) => DOMAIN_LABELS[d] || d).join('、')}
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
              subclassesForClass.map((sc: SubclassData) => (
                <TouchableOpacity
                  key={sc.id}
                  style={[
                    styles.subclassCard,
                    subclassId === sc.id && styles.subclassCardSelected,
                  ]}
                  onPress={() => handleSubclassSelect(sc.id)}
                >
                  <Text style={[styles.subclassTitle, subclassId === sc.id && styles.subclassTitleSelected]}>
                    {sc.name}
                  </Text>
                  <Text style={styles.subclassEn}>{sc.nameEn}</Text>
                  <Text style={styles.subclassDesc}>{sc.description}</Text>

                  {/* Show subclass features preview */}
                  {subclassId === sc.id && (
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
              <Text style={sharedStyles.noDataText}>子职业数据将在连接服务器后加载</Text>
            )}
          </View>

          {/* Background & Relationship questions */}
          {selectedSubclass && (
            <View style={styles.questionsSection}>
              <Text style={styles.featureSectionTitle}>背景与关系</Text>
              {selectedSubclass.backgroundQuestions.map((q: string, i: number) => (
                <View key={`bg-${i}`} style={styles.questionItem}>
                  <Text style={styles.questionLabel}>背景问题 {i + 1}</Text>
                  <Text style={styles.questionText}>{q}</Text>
                  <TextInput
                    style={styles.questionInput}
                    value={classBackgroundAnswers[i] || ''}
                    onChangeText={(text) => handleBackgroundAnswer(i, text)}
                    placeholder="你的回答..."
                    placeholderTextColor="#7f8c8d"
                    multiline
                  />
                </View>
              ))}
              {selectedSubclass.relationshipQuestions.map((q: string, i: number) => (
                <View key={`rel-${i}`} style={styles.questionItem}>
                  <Text style={styles.questionLabel}>关系问题 {i + 1}</Text>
                  <Text style={styles.questionText}>{q}</Text>
                  <TextInput
                    style={styles.questionInput}
                    value={classRelationshipAnswers[i] || ''}
                    onChangeText={(text) => handleRelationshipAnswer(i, text)}
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
}

// ===== Ancestry Section =====

function AncestrySection({ data, onChange, gameData }: { data: Record<string, unknown>; onChange: (key: string, value: unknown) => void; gameData: any }) {
  const ancestryId = data.ancestryId as string | null || null;

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>选择你的种族</Text>
      {gameData.ancestries.length > 0 ? (
        gameData.ancestries.map((item: AncestryData) => (
          <TouchableOpacity
            key={item.id}
            style={[sharedStyles.optionCard, ancestryId === item.id && sharedStyles.optionCardSelected]}
            onPress={() => onChange('ancestryId', item.id)}
          >
            <Text style={sharedStyles.optionTitle}>{item.name} ({item.nameEn})</Text>
            <Text style={sharedStyles.optionDesc}>{item.description}</Text>
            {/* Show ancestry features */}
            {ancestryId === item.id && item.features && (
              <View style={sharedStyles.featurePreviewList}>
                {item.features.map((feat: any, fi: number) => (
                  <View key={fi} style={sharedStyles.featurePreviewItem}>
                    <View style={sharedStyles.featurePreviewHeader}>
                      <Text style={sharedStyles.featurePreviewName}>{feat.name}</Text>
                      <Text style={sharedStyles.featurePreviewType}>
                        {feat.type === 'passive' ? '被动' : feat.type === 'action' ? '行动' : feat.type === 'trait' ? '特性' : feat.type}
                      </Text>
                      {feat.hopeCost && <Text style={sharedStyles.featurePreviewCost}>{feat.hopeCost}希望</Text>}
                      {feat.stressCost && <Text style={sharedStyles.featurePreviewCost}>{feat.stressCost}压力</Text>}
                    </View>
                    <Text style={sharedStyles.featurePreviewDesc}>{feat.description}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        ))
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>
            种族数据将在连接服务器后加载
          </Text>
        </View>
      )}
    </View>
  );
}

// ===== Community Section =====

function CommunitySection({ data, onChange, gameData }: { data: Record<string, unknown>; onChange: (key: string, value: unknown) => void; gameData: any }) {
  const communityId = data.communityId as string | null || null;

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>选择你的成长社群</Text>
      {gameData.communities.length > 0 ? (
        gameData.communities.map((item: CommunityData) => (
          <TouchableOpacity
            key={item.id}
            style={[sharedStyles.optionCard, communityId === item.id && sharedStyles.optionCardSelected]}
            onPress={() => onChange('communityId', item.id)}
          >
            <Text style={sharedStyles.optionTitle}>{item.name} ({item.nameEn})</Text>
            <Text style={sharedStyles.optionDesc}>{item.description}</Text>
            {/* Show community feature */}
            {communityId === item.id && item.feature && (
              <View style={sharedStyles.featurePreviewList}>
                <View style={sharedStyles.featurePreviewItem}>
                  <View style={sharedStyles.featurePreviewHeader}>
                    <Text style={sharedStyles.featurePreviewName}>{item.feature.name}</Text>
                    <Text style={sharedStyles.featurePreviewType}>
                      {item.feature.type === 'passive' ? '被动' : '行动'}
                    </Text>
                    {item.feature.hopeCost && <Text style={sharedStyles.featurePreviewCost}>{item.feature.hopeCost}希望</Text>}
                    {item.feature.stressCost && <Text style={sharedStyles.featurePreviewCost}>{item.feature.stressCost}压力</Text>}
                  </View>
                  <Text style={sharedStyles.featurePreviewDesc}>{item.feature.description}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>
            社群数据将在连接服务器后加载
          </Text>
        </View>
      )}
    </View>
  );
}

// ===== Equipment Section (weapons + armor) =====

function EquipmentSection({ data, onChange, gameData }: { data: Record<string, unknown>; onChange: (key: string, value: unknown) => void; gameData: any }) {
  const mainWeaponId = data.mainWeaponId as string | null || null;
  const offWeaponId = data.offWeaponId as string | null ?? null;
  const armorId = data.armorId as string | null || null;

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>选择武器和护甲</Text>
      <Text style={styles.equipmentSectionLabel}>主武器</Text>
      {gameData.weapons.length > 0 ? (
        <FlatList
          data={gameData.weapons.filter((w: WeaponData) => w.load !== 'offHand')}
          keyExtractor={(item: WeaponData) => item.id}
          renderItem={({ item }: { item: WeaponData }) => (
            <TouchableOpacity
              style={[sharedStyles.optionCard, mainWeaponId === item.id && sharedStyles.optionCardSelected]}
              onPress={() => onChange('mainWeaponId', item.id)}
            >
              <Text style={sharedStyles.optionTitle}>{item.name}</Text>
              <Text style={sharedStyles.optionDesc}>{item.damageDie} 伤害 · {item.load === 'twoHanded' ? '双手' : '单手'}</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
        />
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>武器数据将在连接服务器后加载</Text>
        </View>
      )}

      <Text style={[styles.equipmentSectionLabel, { marginTop: 16 }]}>副武器（可选）</Text>
      <TouchableOpacity
        style={[sharedStyles.optionCard, offWeaponId === null && sharedStyles.optionCardSelected]}
        onPress={() => onChange('offWeaponId', null)}
      >
        <Text style={sharedStyles.optionTitle}>不装备副武器</Text>
      </TouchableOpacity>
      {gameData.weapons.length > 0 && (
        gameData.weapons
          .filter((w: WeaponData) => w.load === 'offHand' || w.load === 'oneHanded')
          .map((item: WeaponData) => (
            <TouchableOpacity
              key={item.id}
              style={[sharedStyles.optionCard, offWeaponId === item.id && sharedStyles.optionCardSelected]}
              onPress={() => onChange('offWeaponId', item.id)}
            >
              <Text style={sharedStyles.optionTitle}>{item.name}</Text>
              <Text style={sharedStyles.optionDesc}>{item.damageDie} 伤害 · {item.load === 'offHand' ? '副手' : '单手'}</Text>
            </TouchableOpacity>
          ))
      )}

      <Text style={[styles.equipmentSectionLabel, { marginTop: 16 }]}>护甲</Text>
      {gameData.armor.length > 0 ? (
        <FlatList
          data={gameData.armor}
          keyExtractor={(item: ArmorData) => item.id}
          renderItem={({ item }: { item: ArmorData }) => (
            <TouchableOpacity
              style={[sharedStyles.optionCard, armorId === item.id && sharedStyles.optionCardSelected]}
              onPress={() => onChange('armorId', item.id)}
            >
              <Text style={sharedStyles.optionTitle}>{item.name}</Text>
              <Text style={sharedStyles.optionDesc}>阈值:{item.baseThreshold}/{item.baseThresholdSevere} 槽:{item.armorSlots}</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
        />
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>护甲数据将在连接服务器后加载</Text>
        </View>
      )}
    </View>
  );
}

// ===== Generic fallback select =====

function GenericSelectSection({ stepDef, data, onChange, gameData }: StepRendererProps) {
  const config = stepDef.rendererConfig || {};
  const dataKey = config.dataKey as string || stepDef.dataKey;
  const selectedId = data[stepDef.dataKey] as string | null || null;
  const items: any[] = gameData[dataKey] || [];

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
      {items.length > 0 ? (
        items.map((item: any) => (
          <TouchableOpacity
            key={item.id}
            style={[sharedStyles.optionCard, selectedId === item.id && sharedStyles.optionCardSelected]}
            onPress={() => onChange(stepDef.dataKey, item.id)}
          >
            <Text style={sharedStyles.optionTitle}>{item.name}{item.nameEn ? ` (${item.nameEn})` : ''}</Text>
            {item.description && <Text style={sharedStyles.optionDesc}>{item.description}</Text>}
          </TouchableOpacity>
        ))
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>数据将在连接服务器后加载</Text>
        </View>
      )}
    </View>
  );
}

// ===== Local styles (class-specific, matching CharacterCreateScreen) =====

const styles = StyleSheet.create({
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
  equipmentSectionLabel: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
