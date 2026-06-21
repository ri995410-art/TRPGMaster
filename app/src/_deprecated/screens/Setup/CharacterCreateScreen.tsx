import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useCharacterCreateStore, STEP_LABELS } from '../../store/characterCreateStore';
import type { CreationStep } from '../../store/characterCreateStore';
import type { Attribute, Experience, DomainCard, DomainType, WeaponLoad, WeaponTrait, ArmorTrait } from '@trpgmaster/shared';
import { ATTRIBUTE_LABELS, DOMAIN_LABELS, WEAPON_TRAIT_LABELS, ARMOR_TRAIT_LABELS } from '@trpgmaster/shared';
import { useGameStore } from '../../store/gameStore';
import { getSocket } from '../../hooks/useSocket';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type CharCreateNavProp = NativeStackNavigationProp<RootStackParamList, 'CharacterCreate'>;

// ===== Step Indicator =====

function StepIndicator() {
  const currentStep = useCharacterCreateStore((s) => s.currentStep);
  const totalSteps = useCharacterCreateStore((s) => s.getTotalSteps());
  const steps = Object.keys(STEP_LABELS) as CreationStep[];

  return (
    <View style={styles.stepIndicator}>
      {steps.map((step, i) => (
        <View key={step} style={styles.stepDotContainer}>
          <View style={[
            styles.stepDot,
            i === currentStep && styles.stepDotActive,
            i < currentStep && styles.stepDotComplete,
          ]}>
            <Text style={[
              styles.stepDotText,
              i <= currentStep && styles.stepDotTextActive,
            ]}>{i + 1}</Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.stepLine, i < currentStep && styles.stepLineComplete]} />
          )}
        </View>
      ))}
    </View>
  );
}

// ===== Feature Detail Panel (shown when item selected) =====

function FeatureDetail({ title, features }: { title: string; features: string[] }) {
  return (
    <View style={styles.featureDetail}>
      <Text style={styles.featureDetailTitle}>{title}</Text>
      {features.map((f, i) => (
        <Text key={i} style={styles.featureDetailText}>• {f}</Text>
      ))}
    </View>
  );
}

// ===== Class Select =====

function ClassSelectStep() {
  const classId = useCharacterCreateStore((s) => s.classId);
  const setClassId = useCharacterCreateStore((s) => s.setClassId);
  const classes = useGameStore((s) => s.gameData.classes);
  const serverUrl = useGameStore((s) => s.serverUrl);

  const data = classes.length > 0 ? classes : [];

  const selectedClass = data.find((c: any) => c.id === classId);

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择你的职业</Text>
      {data.length === 0 && (
        <View style={styles.loadingBox}>
          <Text style={styles.stepHint}>正在加载职业数据...</Text>
          <Text style={styles.debugText}>服务器: {serverUrl || '(未设置)'}</Text>
          {!serverUrl && <Text style={styles.debugText}>请先从首页"加入会话"连接服务器</Text>}
        </View>
      )}
      <View style={styles.grid}>
        {data.map((cls: any) => (
          <TouchableOpacity
            key={cls.id}
            style={[styles.selectCard, classId === cls.id && styles.selectCardActive]}
            onPress={() => setClassId(cls.id)}
          >
            <Text style={[styles.selectCardName, classId === cls.id && styles.selectCardNameActive]}>
              {cls.name}
            </Text>
            <Text style={styles.selectCardDesc}>{cls.domains?.map((d: string) => DOMAIN_LABELS[d as DomainType] || d).join(' + ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {selectedClass && (
        <FeatureDetail
          title={`${selectedClass.name} 职业特性`}
          features={[
            `希望特性：${selectedClass.hopeFeature || ''}`,
            `主要属性：${ATTRIBUTE_LABELS[selectedClass.primaryAttribute] || selectedClass.primaryAttribute}`,
            `基础HP：${selectedClass.baseHp}  压力：${selectedClass.baseStress}  闪避：${selectedClass.baseEvasion}`,
          ]}
        />
      )}
    </View>
  );
}

// ===== Subclass Select =====

function SubclassSelectStep() {
  const classId = useCharacterCreateStore((s) => s.classId);
  const subclassId = useCharacterCreateStore((s) => s.subclassId);
  const setSubclassId = useCharacterCreateStore((s) => s.setSubclassId);
  const subclasses = useGameStore((s) => s.gameData.subclasses);

  // Filter subclasses for the selected class
  const available = classId ? subclasses.filter((sc: any) => sc.classId === classId) : [];

  const selectedSubclass = available.find((sc: any) => sc.id === subclassId);

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择子职业</Text>
      {!classId && <Text style={styles.stepHint}>请先选择职业</Text>}
      {classId && available.length === 0 && <Text style={styles.stepHint}>加载中...</Text>}
      <View style={styles.grid}>
        {available.map((sc: any) => (
          <TouchableOpacity
            key={sc.id}
            style={[styles.selectCard, subclassId === sc.id && styles.selectCardActive]}
            onPress={() => setSubclassId(sc.id)}
          >
            <Text style={[styles.selectCardName, subclassId === sc.id && styles.selectCardNameActive]}>
              {sc.name}
            </Text>
            <Text style={styles.selectCardDesc} numberOfLines={3}>
              {sc.description || ''}
            </Text>
            {sc.castingAttribute && (
              <Text style={styles.selectCardSub}>
                施法属性：{ATTRIBUTE_LABELS[sc.castingAttribute as Attribute] || sc.castingAttribute}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      {selectedSubclass && selectedSubclass.feature && (
        <FeatureDetail
          title={`${selectedSubclass.name} 特性`}
          features={[selectedSubclass.feature]}
        />
      )}
    </View>
  );
}

// ===== Ancestry Select =====

function AncestrySelectStep() {
  const ancestryId = useCharacterCreateStore((s) => s.ancestryId);
  const setAncestryId = useCharacterCreateStore((s) => s.setAncestryId);
  const ancestries = useGameStore((s) => s.gameData.ancestries);
  const [isMixed, setIsMixed] = React.useState(false);
  const secondAncestryId = useCharacterCreateStore((s) => s.secondAncestryId);
  const setSecondAncestryId = useCharacterCreateStore((s) => s.setSecondAncestryId);
  const mixedAncestryFeature1 = useCharacterCreateStore((s) => s.mixedAncestryFeature1);
  const setMixedAncestryFeature1 = useCharacterCreateStore((s) => s.setMixedAncestryFeature1);
  const mixedAncestryFeature2 = useCharacterCreateStore((s) => s.mixedAncestryFeature2);
  const setMixedAncestryFeature2 = useCharacterCreateStore((s) => s.setMixedAncestryFeature2);

  const data = ancestries.length > 0 ? ancestries : [];

  const selectedAncestry = data.find((a: any) => a.id === ancestryId);
  const selectedSecond = data.find((a: any) => a.id === secondAncestryId);

  // When toggling mixed off, clear second ancestry and feature selections
  const toggleMixed = () => {
    if (isMixed) {
      setSecondAncestryId(null);
      setMixedAncestryFeature1(null);
      setMixedAncestryFeature2(null);
    }
    setIsMixed(!isMixed);
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择你的血统</Text>
      {data.length === 0 && <Text style={styles.stepHint}>加载中...</Text>}
      <View style={styles.grid}>
        {data.map((a: any) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.selectCard, ancestryId === a.id && styles.selectCardActive]}
            onPress={() => { setAncestryId(a.id); setMixedAncestryFeature1(null); }}
          >
            <Text style={[styles.selectCardName, ancestryId === a.id && styles.selectCardNameActive]}>
              {a.name}
            </Text>
            <Text style={styles.selectCardDesc} numberOfLines={2}>
              {a.features?.[0] || ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mixed ancestry toggle */}
      <TouchableOpacity
        style={[styles.mixedToggle, isMixed && styles.mixedToggleActive]}
        onPress={toggleMixed}
      >
        <Text style={[styles.mixedToggleText, isMixed && styles.mixedToggleTextActive]}>
          {isMixed ? '✓ 混血血统已开启' : '开启混血血统（混合种族）'}
        </Text>
      </TouchableOpacity>

      {isMixed && (
        <>
          <Text style={styles.subTitle}>第二血统</Text>
          <View style={styles.grid}>
            {data.filter((a: any) => a.id !== ancestryId).map((a: any) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.selectCard, secondAncestryId === a.id && styles.selectCardActive]}
                onPress={() => { setSecondAncestryId(a.id); setMixedAncestryFeature2(null); }}
              >
                <Text style={[styles.selectCardName, secondAncestryId === a.id && styles.selectCardNameActive]}>
                  {a.name}
                </Text>
                <Text style={styles.selectCardDesc} numberOfLines={1}>
                  {a.features?.[0] || ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Feature selection for non-mixed: show all features */}
      {selectedAncestry && !isMixed && (
        <FeatureDetail
          title={`${selectedAncestry.name} 血统特性`}
          features={selectedAncestry.features || []}
        />
      )}

      {/* Feature selection for mixed ancestry: pick one from each */}
      {isMixed && selectedAncestry && (
        <View style={styles.featureDetail}>
          <Text style={styles.featureDetailTitle}>
            从 {selectedAncestry.name} 选择一个特性
          </Text>
          {(selectedAncestry.features || []).map((f: string, i: number) => (
            <TouchableOpacity
              key={i}
              style={[styles.featureOption, mixedAncestryFeature1 === f && styles.featureOptionActive]}
              onPress={() => setMixedAncestryFeature1(f)}
            >
              <Text style={[styles.featureOptionText, mixedAncestryFeature1 === f && styles.featureOptionTextActive]}>
                {mixedAncestryFeature1 === f ? '✓ ' : '○ '}{f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {isMixed && selectedSecond && (
        <View style={styles.featureDetail}>
          <Text style={styles.featureDetailTitle}>
            从 {selectedSecond.name} 选择一个特性
          </Text>
          {(selectedSecond.features || []).map((f: string, i: number) => (
            <TouchableOpacity
              key={i}
              style={[styles.featureOption, mixedAncestryFeature2 === f && styles.featureOptionActive]}
              onPress={() => setMixedAncestryFeature2(f)}
            >
              <Text style={[styles.featureOptionText, mixedAncestryFeature2 === f && styles.featureOptionTextActive]}>
                {mixedAncestryFeature2 === f ? '✓ ' : '○ '}{f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ===== Community Select =====

function CommunitySelectStep() {
  const communityId = useCharacterCreateStore((s) => s.communityId);
  const setCommunityId = useCharacterCreateStore((s) => s.setCommunityId);
  const communities = useGameStore((s) => s.gameData.communities);

  const data = communities && communities.length > 0 ? communities : [];

  const selectedCommunity = data.find((c: any) => c.id === communityId);

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择你的社区</Text>
      {data.length === 0 && <Text style={styles.stepHint}>加载中...</Text>}
      <View style={styles.grid}>
        {data.map((c: any) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.selectCard, communityId === c.id && styles.selectCardActive]}
            onPress={() => setCommunityId(c.id)}
          >
            <Text style={[styles.selectCardName, communityId === c.id && styles.selectCardNameActive]}>
              {c.name}
            </Text>
            <Text style={styles.selectCardDesc} numberOfLines={2}>
              {c.feature || c.description || ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {selectedCommunity && (selectedCommunity as any).feature && (
        <FeatureDetail
          title={`${selectedCommunity.name} 社区特性`}
          features={[(selectedCommunity as any).feature]}
        />
      )}
    </View>
  );
}

// ===== Attribute Assign =====

const ATTRIBUTES: { key: Attribute; label: string }[] = [
  { key: 'agility', label: ATTRIBUTE_LABELS.agility },
  { key: 'strength', label: ATTRIBUTE_LABELS.strength },
  { key: 'finesse', label: ATTRIBUTE_LABELS.finesse },
  { key: 'instinct', label: ATTRIBUTE_LABELS.instinct },
  { key: 'presence', label: ATTRIBUTE_LABELS.presence },
  { key: 'knowledge', label: ATTRIBUTE_LABELS.knowledge },
];
const MODIFIERS = [2, 1, 1, 0, 0, -1];

function AttributeAssignStep() {
  const attributes = useCharacterCreateStore((s) => s.attributes);
  const setAttributes = useCharacterCreateStore((s) => s.setAttributes);

  const currentAttrs = attributes || { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 };

  const usedModifiers = Object.values(currentAttrs);
  const availableModifiers = MODIFIERS.filter(m => {
    const usedCount = usedModifiers.filter(v => v === m).length;
    const totalCount = MODIFIERS.filter(v => v === m).length;
    return usedCount < totalCount;
  });

  const handleAssign = (attr: Attribute, value: number) => {
    setAttributes({ ...currentAttrs, [attr]: value });
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>分配属性</Text>
      <Text style={styles.stepHint}>将 +2,+1,+1,0,0,-1 分配到6个属性</Text>
      {ATTRIBUTES.map(({ key, label }) => (
        <View key={key} style={styles.attrRow}>
          <Text style={styles.attrLabel}>{label}</Text>
          <View style={styles.attrButtons}>
            {MODIFIERS.map((mod) => {
              const isSelected = currentAttrs[key] === mod;
              const canSelect = isSelected || availableModifiers.includes(mod) ||
                (usedModifiers.filter(v => v === mod).length < MODIFIERS.filter(v => v === mod).length);
              return (
                <TouchableOpacity
                  key={mod}
                  style={[
                    styles.attrButton,
                    isSelected && styles.attrButtonActive,
                    !canSelect && styles.attrButtonDisabled,
                  ]}
                  disabled={!canSelect && !isSelected}
                  onPress={() => handleAssign(key, isSelected ? 0 : mod)}
                >
                  <Text style={[styles.attrButtonText, isSelected && styles.attrButtonTextActive]}>
                    {mod > 0 ? `+${mod}` : mod}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ===== Experience Input =====

function ExperienceInputStep() {
  const experiences = useCharacterCreateStore((s) => s.experiences);
  const setExperiences = useCharacterCreateStore((s) => s.setExperiences);
  const [newExp, setNewExp] = React.useState('');
  const [newMod, setNewMod] = React.useState<2 | 1>(2);

  const addExperience = () => {
    if (!newExp.trim()) return;
    if (experiences.length >= 4) return;
    setExperiences([...experiences, { id: `exp_${Date.now()}`, name: newExp.trim(), modifier: newMod }]);
    setNewExp('');
  };

  const removeExperience = (id: string) => {
    setExperiences(experiences.filter(e => e.id !== id));
  };

  const hasPlus2 = experiences.some(e => e.modifier === 2);
  const canAddPlus2 = !hasPlus2;

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择经历</Text>
      <Text style={styles.stepHint}>至少需要1个+2经历和1个+1经历（最多4个）</Text>

      {experiences.map((exp) => (
        <View key={exp.id} style={styles.expRow}>
          <Text style={styles.expText}>{exp.name} (+{exp.modifier})</Text>
          <TouchableOpacity onPress={() => removeExperience(exp.id)}>
            <Text style={styles.expRemove}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {experiences.length < 4 && (
        <View style={styles.expInputArea}>
          <View style={styles.expInputRow}>
            <TouchableOpacity
              style={[styles.modToggle, newMod === 2 && styles.modToggleActive]}
              onPress={() => canAddPlus2 && setNewMod(2)}
              disabled={!canAddPlus2 && newMod !== 2}
            >
              <Text style={[styles.modToggleText, newMod === 2 && styles.modToggleTextActive]}>+2</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modToggle, newMod === 1 && styles.modToggleActive]}
              onPress={() => setNewMod(1)}
            >
              <Text style={[styles.modToggleText, newMod === 1 && styles.modToggleTextActive]}>+1</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.expTextInput}
            value={newExp}
            onChangeText={setNewExp}
            placeholder="输入经历名称..."
            placeholderTextColor="#7f8c8d"
            onSubmitEditing={addExperience}
          />
          <TouchableOpacity style={styles.addExpButton} onPress={addExperience}>
            <Text style={styles.addExpButtonText}>添加</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ===== Weapon Select =====

function WeaponSelectStep() {
  const mainWeaponId = useCharacterCreateStore((s) => s.mainWeaponId);
  const offWeaponId = useCharacterCreateStore((s) => s.offWeaponId);
  const setMainWeaponId = useCharacterCreateStore((s) => s.setMainWeaponId);
  const setOffWeaponId = useCharacterCreateStore((s) => s.setOffWeaponId);
  const allWeapons = useGameStore((s) => s.gameData.weapons);

  const mainWeapons = allWeapons.filter((w: any) => w.load === 'oneHanded' || w.load === 'twoHanded');
  const offHandWeapons = allWeapons.filter((w: any) => w.load === 'offHand');

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择武器</Text>

      <Text style={styles.subTitle}>主手武器</Text>
      <View style={styles.grid}>
        {mainWeapons.map((w: any) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.selectCard, mainWeaponId === w.id && styles.selectCardActive]}
            onPress={() => setMainWeaponId(w.id)}
          >
            <Text style={[styles.selectCardName, mainWeaponId === w.id && styles.selectCardNameActive]}>
              {w.name}
            </Text>
            <Text style={styles.selectCardDesc}>
              {ATTRIBUTE_LABELS[w.attribute as Attribute] || w.attribute} | {w.damageDie}{w.damageModifier > 0 ? `+${w.damageModifier}` : w.damageModifier < 0 ? w.damageModifier : ''}
              {' '}{w.load === 'twoHanded' ? '双手' : '单手'}
            </Text>
            {w.traits && w.traits.length > 0 && (
              <Text style={styles.selectCardSub}>
                {w.traits.map((t: string) => WEAPON_TRAIT_LABELS[t as WeaponTrait] || t).join(', ')}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.subTitle}>副手武器（可选）</Text>
      <View style={styles.grid}>
        <TouchableOpacity
          style={[styles.selectCard, !offWeaponId && styles.selectCardActive]}
          onPress={() => setOffWeaponId(null)}
        >
          <Text style={[styles.selectCardName, !offWeaponId && styles.selectCardNameActive]}>无</Text>
        </TouchableOpacity>
        {offHandWeapons.map((w: any) => {
          // Determine display based on weapon type (shields show armor bonus, others show damage)
          const isShield = w.traits?.includes('protect') || w.traits?.includes('barricade');
          return (
            <TouchableOpacity
              key={w.id}
              style={[styles.selectCard, offWeaponId === w.id && styles.selectCardActive]}
              onPress={() => setOffWeaponId(w.id)}
            >
              <Text style={[styles.selectCardName, offWeaponId === w.id && styles.selectCardNameActive]}>
                {w.name}
              </Text>
              <Text style={styles.selectCardDesc}>
                {isShield
                  ? w.description || (w.traits?.includes('barricade') ? '屏障：+2护甲值，-1闪避值' : '防御：+1护甲值')
                  : `${w.damageDie}${w.damageModifier > 0 ? `+${w.damageModifier}` : ''} ${ATTRIBUTE_LABELS[w.attribute as Attribute] || ''}`
                }
              </Text>
              {w.traits && w.traits.length > 0 && (
                <Text style={styles.selectCardSub}>
                  {w.traits.map((t: string) => WEAPON_TRAIT_LABELS[t as WeaponTrait] || t).join(', ')}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ===== Armor Select =====

function ArmorSelectStep() {
  const armorId = useCharacterCreateStore((s) => s.armorId);
  const setArmorId = useCharacterCreateStore((s) => s.setArmorId);
  const armors = useGameStore((s) => s.gameData.armor);

  const data = armors.length > 0 ? armors : [];

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择护甲</Text>
      {data.length === 0 && <Text style={styles.stepHint}>加载中...</Text>}
      <View style={styles.grid}>
        {data.map((a: any) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.selectCard, armorId === a.id && styles.selectCardActive]}
            onPress={() => setArmorId(a.id)}
          >
            <Text style={[styles.selectCardName, armorId === a.id && styles.selectCardNameActive]}>
              {a.name}
            </Text>
            <Text style={styles.selectCardDesc}>
              阈值 {a.baseThreshold}/{a.baseThresholdSevere} {a.armorSlots}槽
              {a.evasionPenalty ? ` 闪避${a.evasionPenalty}` : ''}
            </Text>
            {a.traits && a.traits.length > 0 && (
              <Text style={styles.selectCardSub}>
                {a.traits.map((t: string) => ARMOR_TRAIT_LABELS[t as ArmorTrait] || t).join(', ')}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ===== Domain Card Select =====

function DomainCardSelectStep() {
  const domainCards = useCharacterCreateStore((s) => s.domainCards);
  const setDomainCards = useCharacterCreateStore((s) => s.setDomainCards);
  const classId = useCharacterCreateStore((s) => s.classId);
  const allDomainCards = useGameStore((s) => s.gameData.domainCards);
  const classes = useGameStore((s) => s.gameData.classes);

  // Get the selected class's domains
  const selectedClass = classes.find((c: any) => c.id === classId);
  const classDomains: string[] = selectedClass?.domains || [];

  // Filter domain cards to only show Level 1 cards from the class's domains
  const availableCards = allDomainCards.length > 0 && classDomains.length > 0
    ? allDomainCards.filter((card: any) => classDomains.includes(card.domain as string) && card.level === 1)
    : [];

  const toggleCard = (card: DomainCard) => {
    const isSelected = domainCards.some(c => c.id === card.id);
    if (isSelected) {
      setDomainCards(domainCards.filter(c => c.id !== card.id));
    } else if (domainCards.length < 5) {
      setDomainCards([...domainCards, card]);
    }
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>选择领域卡</Text>
      <Text style={styles.stepHint}>
        选择2-5张一级领域卡
        {classDomains.length > 0 ? `（${classDomains.map((d: string) => DOMAIN_LABELS[d as DomainType] || d).join('、')}领域）` : '（请先选择职业）'}
      </Text>
      {availableCards.length === 0 && (
        <Text style={styles.stepHint}>
          {classId ? '等待领域卡数据加载...' : '请先选择职业'}
        </Text>
      )}
      <View style={styles.grid}>
        {availableCards.map((card: any) => {
          const isSelected = domainCards.some(c => c.id === card.id);
          return (
            <TouchableOpacity
              key={card.id}
              style={[styles.selectCard, isSelected && styles.selectCardActive]}
              onPress={() => toggleCard(card)}
            >
              <Text style={[styles.selectCardName, isSelected && styles.selectCardNameActive]}>
                {card.name}
              </Text>
              <Text style={styles.selectCardDesc}>
                {DOMAIN_LABELS[card.domain as DomainType] || card.domain} Lv.{card.level}
                {card.recallCost > 0 ? ` ⚡${card.recallCost}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ===== Backstory =====

function BackstoryStep() {
  const name = useCharacterCreateStore((s) => s.name);
  const backstory = useCharacterCreateStore((s) => s.backstory);
  const personalQuest = useCharacterCreateStore((s) => s.personalQuest);
  const setName = useCharacterCreateStore((s) => s.setName);
  const setBackstory = useCharacterCreateStore((s) => s.setBackstory);
  const setPersonalQuest = useCharacterCreateStore((s) => s.setPersonalQuest);

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>完善角色背景</Text>

      <Text style={styles.inputLabel}>角色名称 *</Text>
      <TextInput
        style={styles.textInput}
        value={name}
        onChangeText={setName}
        placeholder="输入角色名称"
        placeholderTextColor="#7f8c8d"
      />

      <Text style={styles.inputLabel}>背景故事</Text>
      <TextInput
        style={[styles.textInput, styles.textArea]}
        value={backstory}
        onChangeText={setBackstory}
        placeholder="描述你的角色背景..."
        placeholderTextColor="#7f8c8d"
        multiline
        numberOfLines={4}
      />

      <Text style={styles.inputLabel}>个人任务</Text>
      <TextInput
        style={styles.textInput}
        value={personalQuest}
        onChangeText={setPersonalQuest}
        placeholder="你的角色想要完成什么？"
        placeholderTextColor="#7f8c8d"
      />
    </View>
  );
}

// ===== Step Components Map =====
const STEP_COMPONENTS: Record<CreationStep, React.FC> = {
  class: ClassSelectStep,
  subclass: SubclassSelectStep,
  ancestry: AncestrySelectStep,
  community: CommunitySelectStep,
  attributes: AttributeAssignStep,
  experiences: ExperienceInputStep,
  weapons: WeaponSelectStep,
  armor: ArmorSelectStep,
  domainCards: DomainCardSelectStep,
  backstory: BackstoryStep,
};

// ===== Main Screen =====

export function CharacterCreateScreen({ navigation }: { navigation: CharCreateNavProp }) {
  const currentStep = useCharacterCreateStore((s) => s.currentStep);
  const goNext = useCharacterCreateStore((s) => s.goNext);
  const goBack = useCharacterCreateStore((s) => s.goBack);
  const getCurrentStep = useCharacterCreateStore((s) => s.getCurrentStep);
  const reset = useCharacterCreateStore((s) => s.reset);
  const [submitting, setSubmitting] = React.useState(false);

  // Fetch game data directly from server REST API
  // (not using useGameData hook to avoid timing issues with isConnected)
  const gameDataLoaded = useGameStore((s) => s.gameData.loaded);
  const serverUrl = useGameStore((s) => s.serverUrl);
  const classesCount = useGameStore((s) => s.gameData.classes.length);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (gameDataLoaded && classesCount > 0) return;
    if (!serverUrl) {
      setFetchError('未设置服务器地址，请先加入会话');
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        setFetchError(null);
        console.log('[CharacterCreate] Fetching game data from', serverUrl);

        const endpoints = [
          { key: 'classes', url: `${serverUrl}/api/data/classes` },
          { key: 'subclasses', url: `${serverUrl}/api/data/subclasses` },
          { key: 'weapons', url: `${serverUrl}/api/data/weapons` },
          { key: 'armor', url: `${serverUrl}/api/data/armor` },
          { key: 'domainCards', url: `${serverUrl}/api/data/domains` },
          { key: 'ancestries', url: `${serverUrl}/api/data/ancestries` },
          { key: 'communities', url: `${serverUrl}/api/data/communities` },
        ];

        const results = await Promise.all(
          endpoints.map(async (ep) => {
            try {
              const res = await fetch(ep.url);
              if (!res.ok) return { key: ep.key, data: [] };
              return { key: ep.key, data: await res.json() };
            } catch (e) {
              console.warn(`[CharacterCreate] Failed to fetch ${ep.key}:`, e);
              return { key: ep.key, data: [] };
            }
          })
        );

        if (cancelled) return;

        const data: Record<string, any[]> = {};
        for (const r of results) data[r.key] = r.data;

        console.log(`[CharacterCreate] Fetched: ${data.classes?.length || 0} classes, ${data.weapons?.length || 0} weapons, ${data.armor?.length || 0} armor, ${data.domainCards?.length || 0} domainCards, ${data.ancestries?.length || 0} ancestries, ${data.communities?.length || 0} communities`);

        useGameStore.getState().setGameData({
          classes: data.classes || [],
          subclasses: data.subclasses || [],
          weapons: data.weapons || [],
          armor: data.armor || [],
          domainCards: data.domainCards || [],
          ancestries: data.ancestries || [],
          communities: data.communities || [],
          loaded: true,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[CharacterCreate] Failed to fetch game data:', msg);
        setFetchError(msg);
      }
    };

    // Small delay to let navigation settle, then fetch
    const timer = setTimeout(fetchData, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [serverUrl, gameDataLoaded, classesCount]);

  const stepName = getCurrentStep();
  const StepComponent = STEP_COMPONENTS[stepName];
  const isLastStep = currentStep === 9;

  const handleNext = async () => {
    if (isLastStep) {
      const store = useCharacterCreateStore.getState();
      const socket = getSocket();
      const serverUrl = useGameStore.getState().serverUrl;

      if (!socket || !serverUrl) {
        Alert.alert('错误', '未连接到服务器，请返回重试');
        return;
      }

      if (!store.name.trim()) {
        Alert.alert('提示', '请输入角色名称');
        return;
      }
      if (!store.classId) {
        Alert.alert('提示', '请选择职业');
        return;
      }
      if (!store.mainWeaponId) {
        Alert.alert('提示', '请选择主手武器');
        return;
      }
      if (!store.armorId) {
        Alert.alert('提示', '请选择护甲');
        return;
      }
      if (store.experiences.length < 2) {
        Alert.alert('提示', '请至少添加2个经历');
        return;
      }

      setSubmitting(true);
      try {
        const characterData = {
          classId: store.classId,
          subclassId: store.subclassId || null,
          ancestryId: store.ancestryId || 'human',
          secondAncestryId: store.secondAncestryId || null,
          mixedAncestryFeature1: store.mixedAncestryFeature1 || null,
          mixedAncestryFeature2: store.mixedAncestryFeature2 || null,
          communityId: store.communityId || 'high-city',
          name: store.name,
          attributes: store.attributes || { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
          experiences: store.experiences,
          mainWeaponId: store.mainWeaponId,
          offWeaponId: store.offWeaponId || null,
          armorId: store.armorId,
          domainCards: store.domainCards,
          backstory: store.backstory,
          personalQuest: store.personalQuest,
        };

        const res = await fetch(`${serverUrl}/api/character/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: socket.id,
            data: characterData,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          Alert.alert('创建失败', err.errors?.join(', ') || '服务器错误');
          setSubmitting(false);
          return;
        }

        const { character } = await res.json();

        useGameStore.getState().setMyCharacter(character.id);
        reset();
        navigation.navigate('PlayerSheet');
      } catch (err: any) {
        Alert.alert('错误', '角色创建失败：' + (err?.message || '网络错误'));
      } finally {
        setSubmitting(false);
      }
    } else {
      goNext();
    }
  };

  return (
    <View style={styles.container}>
      <StepIndicator />

      <Text style={styles.stepLabel}>
        第 {currentStep + 1} 步：{STEP_LABELS[stepName]}
      </Text>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StepComponent />
      </ScrollView>

      <View style={styles.navigation}>
        <TouchableOpacity
          style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
          onPress={goBack}
          disabled={currentStep === 0}
        >
          <Text style={styles.navButtonText}>上一步</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, submitting && styles.navButtonDisabled]}
          onPress={handleNext}
          disabled={submitting}
        >
          <Text style={styles.navButtonText}>
            {submitting ? '创建中...' : isLastStep ? '完成创建' : '下一步'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 16,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#34495e',
  },
  stepDotActive: {
    borderColor: '#3498db',
    backgroundColor: '#16213e',
  },
  stepDotComplete: {
    borderColor: '#2ecc71',
    backgroundColor: '#1a3a2e',
  },
  stepDotText: {
    color: '#7f8c8d',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepDotTextActive: {
    color: '#ecf0f1',
  },
  stepLine: {
    width: 12,
    height: 2,
    backgroundColor: '#34495e',
  },
  stepLineComplete: {
    backgroundColor: '#2ecc71',
  },
  stepLabel: {
    color: '#95a5a6',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  stepContent: {
    paddingBottom: 20,
  },
  stepTitle: {
    color: '#ecf0f1',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  stepHint: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 12,
  },
  loadingBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e74c3c44',
  },
  debugText: {
    color: '#e74c3c',
    fontSize: 11,
    marginTop: 4,
  },
  subTitle: {
    color: '#bdc3c7',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectCard: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    width: '48%',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectCardActive: {
    borderColor: '#3498db',
    backgroundColor: '#1a2d50',
  },
  selectCardName: {
    color: '#bdc3c7',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  selectCardNameActive: {
    color: '#3498db',
  },
  selectCardDesc: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  selectCardSub: {
    color: '#3498db',
    fontSize: 10,
    marginTop: 2,
  },
  // Feature detail panel
  featureDetail: {
    backgroundColor: '#1a2a3e',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  featureDetailTitle: {
    color: '#f39c12',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  featureDetailText: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 3,
  },
  // Feature option (for mixed ancestry selection)
  featureOption: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  featureOptionActive: {
    borderColor: '#f39c12',
    backgroundColor: '#1a2d3e',
  },
  featureOptionText: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
  },
  featureOptionTextActive: {
    color: '#f39c12',
    fontWeight: 'bold',
  },
  // Mixed ancestry toggle
  mixedToggle: {
    backgroundColor: '#2c3e50',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#7f8c8d',
  },
  mixedToggleActive: {
    backgroundColor: '#8e44ad',
    borderColor: '#8e44ad',
  },
  mixedToggleText: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
  },
  mixedToggleTextActive: {
    color: '#fff',
  },
  // Attributes
  attrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  attrLabel: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    width: 60,
  },
  attrButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  attrButton: {
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#34495e',
  },
  attrButtonActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  attrButtonDisabled: {
    opacity: 0.3,
  },
  attrButtonText: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
  },
  attrButtonTextActive: {
    color: '#fff',
  },
  // Experience
  expRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  expText: {
    color: '#ecf0f1',
    fontSize: 14,
    flex: 1,
  },
  expRemove: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  expInputArea: {
    marginTop: 8,
  },
  expInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  expTextInput: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    color: '#ecf0f1',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#34495e',
    marginBottom: 6,
  },
  modToggle: {
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#34495e',
  },
  modToggleActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  modToggleText: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modToggleTextActive: {
    color: '#fff',
  },
  addExpButton: {
    backgroundColor: '#2ecc71',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  addExpButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Text inputs
  inputLabel: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    color: '#ecf0f1',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#34495e',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Navigation
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
  },
  navButton: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#34495e',
    opacity: 0.6,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
