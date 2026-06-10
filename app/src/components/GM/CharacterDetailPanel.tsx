import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import { ATTRIBUTE_LABELS, CONDITION_LABELS, DOMAIN_LABELS, WEAPON_TRAIT_LABELS, ARMOR_TRAIT_LABELS } from '@trpgmaster/shared';
import type { Character, ClassData, WeaponData, ArmorData, Ancestry as AncestryType, Community as CommunityType, DomainCard as DomainCardType, WeaponTrait, ArmorTrait } from '@trpgmaster/shared';
import { sendCharacterUpdate } from '../../hooks/useSocket';

interface CharacterDetailPanelProps {
  character: Character;
  gameData: {
    classes: ClassData[];
    weapons: WeaponData[];
    armor: ArmorData[];
    ancestries: AncestryType[];
    communities: CommunityType[];
  };
  serverUrl: string;
  visible: boolean;
  onClose: () => void;
}

export function CharacterDetailPanel({ character, gameData, serverUrl, visible, onClose }: CharacterDetailPanelProps) {
  // Lookup helpers
  const classData = gameData.classes.find(c => c.id === character.classId);
  const mainWeapon = gameData.weapons.find(w => w.id === character.mainWeaponId);
  const offWeapon = gameData.weapons.find(w => w.id === character.offWeaponId);
  const armorItem = gameData.armor.find(a => a.id === character.armorId);
  const ancestryData = gameData.ancestries?.find(a => a.id === character.ancestryId);
  const secondAncestryData = character.secondAncestryId ? gameData.ancestries?.find(a => a.id === character.secondAncestryId) : undefined;
  const communityData = gameData.communities?.find(c => c.id === character.communityId);

  // GM action states
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');

  // Send an update to the server
  const handleUpdate = (updates: Record<string, unknown>) => {
    sendCharacterUpdate(character.id, updates);
  };

  // Level up handler
  const handleLevelUp = async () => {
    Alert.alert(
      '确认升级',
      `确认将 ${character.name} 从 ${character.level} 级升级到 ${character.level + 1} 级？\n\n升级效果:\n- 等级+1\n- 伤害阈值+1\n- 获得新的领域卡选择\n- 可能获得升阶成就`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认升级',
          style: 'default',
          onPress: async () => {
            try {
              const response = await fetch(`${serverUrl}/api/character/levelup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  characterId: character.id,
                  newLevel: character.level + 1,
                  options: ['increaseHp', 'increaseStress'], // Default upgrade options
                }),
              });
              const result = await response.json();
              if (result.errors && result.errors.length > 0) {
                Alert.alert('升级失败', result.errors.join('\n'));
              } else {
                Alert.alert('升级成功', `${character.name} 已升级到 ${character.level + 1} 级！${result.tierChanged ? '\n位阶变化!' : ''}`);
              }
            } catch (err) {
              Alert.alert('升级失败', '网络错误，请检查服务器连接');
            }
          },
        },
      ]
    );
  };

  // Add item to inventory via API
  const addItemDirectly = async (name: string, description: string) => {
    try {
      await fetch(`${serverUrl}/api/character/${character.id}/inventory/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, quantity: 1 }),
      });
    } catch (err) {
      // Also add locally as fallback
      const newItem = {
        id: `item_${Date.now()}`,
        name,
        quantity: 1,
        description,
        equipped: false,
      };
      handleUpdate({ inventory: [...character.inventory, newItem] });
    }
  };

  // Increment/decrement a numeric field
  const handleStatDelta = (field: string, current: number, max: number, delta: number) => {
    const newVal = Math.max(0, Math.min(max, current + delta));
    handleUpdate({ [field]: newVal });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Text style={styles.charName}>{character.name}</Text>
              <Text style={styles.charClass}>
                Lv.{character.level} {classData?.name || character.classId}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {/* Class Feature */}
            {classData && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>职业特性</Text>
                <Text style={styles.featureText}>{classData.hopeFeature}</Text>
                <Text style={styles.primaryAttr}>
                  主要属性: {ATTRIBUTE_LABELS[classData.primaryAttribute]}
                </Text>
              </View>
            )}

            {/* Ancestry & Community */}
            {(ancestryData || communityData) && (
              <View style={styles.section}>
                {ancestryData && (
                  <>
                    <Text style={styles.sectionTitle}>
                      血统: {ancestryData.name}
                      {secondAncestryData ? ` + ${secondAncestryData.name}` : ''}
                    </Text>
                    {ancestryData.features?.map((f, i) => (
                      <Text key={i} style={styles.featureText}>• {f}</Text>
                    ))}
                    {ancestryData.structuredFeatures?.map((f, i) => (
                      <View key={i} style={{ marginBottom: 4 }}>
                        <Text style={styles.featureName}>{f.name} ({f.type})</Text>
                        <Text style={styles.featureDesc}>{f.description}</Text>
                      </View>
                    ))}
                    {secondAncestryData && (
                      <>
                        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>
                          混血: {secondAncestryData.name}
                        </Text>
                        {secondAncestryData.features?.map((f, i) => (
                          <Text key={i} style={styles.featureText}>• {f}</Text>
                        ))}
                      </>
                    )}
                  </>
                )}
                {communityData && (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: ancestryData ? 8 : 0 }]}>
                      社区: {communityData.name}
                    </Text>
                    <Text style={styles.featureText}>{communityData.feature}</Text>
                  </>
                )}
              </View>
            )}

            {/* Resources - Editable */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>资源</Text>
              {renderEditableResource('HP', character.hp, character.maxHp, 'hp')}
              {renderEditableResource('压力', character.stress, character.maxStress, 'stress')}
              {renderEditableResource('希望', character.hope, character.maxHope, 'hope')}
              {renderEditableResource('护甲槽', character.armorSlots, character.maxArmorSlots, 'armorSlots')}

              {/* Max values (editable) */}
              <View style={styles.maxRow}>
                <Text style={styles.maxLabel}>最大HP:</Text>
                <StatEditor value={character.maxHp} field="maxHp" onUpdate={handleUpdate} />
                <Text style={styles.maxLabel}>最大压力:</Text>
                <StatEditor value={character.maxStress} field="maxStress" onUpdate={handleUpdate} />
                <Text style={styles.maxLabel}>最大希望:</Text>
                <StatEditor value={character.maxHope} field="maxHope" onUpdate={handleUpdate} />
              </View>
            </View>

            {/* Attributes - Editable */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>属性</Text>
              <View style={styles.attributesGrid}>
                {(Object.entries(character.attributes) as [keyof typeof ATTRIBUTE_LABELS, number][]).map(([attr, value]) => (
                  <View key={attr} style={styles.attributeRow}>
                    <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
                    <View style={styles.attributeButtons}>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => {
                          const newAttrs = { ...character.attributes, [attr]: value - 1 };
                          handleUpdate({ attributes: newAttrs });
                        }}
                      >
                        <Text style={styles.smallButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={[styles.attributeValue, value > 0 && styles.positive, value < 0 && styles.negative]}>
                        {value > 0 ? '+' : ''}{value}
                      </Text>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => {
                          const newAttrs = { ...character.attributes, [attr]: value + 1 };
                          handleUpdate({ attributes: newAttrs });
                        }}
                      >
                        <Text style={styles.smallButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Thresholds */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>阈值</Text>
              <View style={styles.thresholdRow}>
                <View style={styles.thresholdItem}>
                  <Text style={styles.thresholdLabel}>闪避</Text>
                  <StatEditor value={character.evasion} field="evasion" onUpdate={handleUpdate} />
                </View>
                <View style={styles.thresholdItem}>
                  <Text style={styles.thresholdLabel}>重度</Text>
                  <StatEditor value={character.majorThreshold} field="majorThreshold" onUpdate={handleUpdate} />
                </View>
                <View style={styles.thresholdItem}>
                  <Text style={styles.thresholdLabel}>严重</Text>
                  <StatEditor value={character.severeThreshold} field="severeThreshold" onUpdate={handleUpdate} />
                </View>
              </View>
            </View>

            {/* Conditions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>状态条件</Text>
              <View style={styles.conditionsWrap}>
                {character.conditions.map(cond => (
                  <View key={cond} style={styles.conditionBadge}>
                    <Text style={styles.conditionText}>{CONDITION_LABELS[cond] || cond}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        handleUpdate({ conditions: character.conditions.filter(c => c !== cond) });
                      }}
                    >
                      <Text style={styles.removeX}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {/* Add condition buttons */}
                {(['vulnerable', 'restrained', 'hidden', 'enchanted', 'poisoned', 'stunned'] as const)
                  .filter(c => !character.conditions.includes(c))
                  .map(cond => (
                    <TouchableOpacity
                      key={cond}
                      style={styles.addConditionBadge}
                      onPress={() => {
                        handleUpdate({ conditions: [...character.conditions, cond] });
                      }}
                    >
                      <Text style={styles.addConditionText}>+ {CONDITION_LABELS[cond]}</Text>
                    </TouchableOpacity>
                  ))
                }
              </View>
            </View>

            {/* Domain Cards */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>领域卡 ({character.domainCards.length})</Text>
              {character.domainCards.map(card => (
                <View key={card.id} style={styles.domainCard}>
                  <View style={styles.domainCardHeader}>
                    <Text style={styles.domainCardName}>{card.name}</Text>
                    <View style={[styles.domainBadge, { backgroundColor: getDomainColor(card.domain) }]}>
                      <Text style={styles.domainBadgeText}>{DOMAIN_LABELS[card.domain]}</Text>
                    </View>
                    <Text style={styles.domainCardLevel}>Lv.{card.level}</Text>
                    {card.recallCost > 0 && (
                      <Text style={styles.domainCardRecall}>⚡{card.recallCost}</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        handleUpdate({ domainCards: character.domainCards.filter(dc => dc.id !== card.id) });
                      }}
                    >
                      <Text style={styles.removeX}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {card.cost && <Text style={styles.domainCardCost}>消耗: {card.cost}</Text>}
                  <Text style={styles.domainCardDesc} numberOfLines={3}>{card.effect || card.description}</Text>
                </View>
              ))}
            </View>

            {/* Equipment */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>装备</Text>
              {mainWeapon && (
                <View style={styles.equipRow}>
                  <Text style={styles.equipLabel}>主手</Text>
                  <View style={styles.equipInfo}>
                    <Text style={styles.equipName}>{mainWeapon.name}</Text>
                    <Text style={styles.equipDetail}>
                      {mainWeapon.damageDie}{mainWeapon.damageModifier > 0 ? `+${mainWeapon.damageModifier}` : mainWeapon.damageModifier < 0 ? mainWeapon.damageModifier : ''} {ATTRIBUTE_LABELS[mainWeapon.attribute] || mainWeapon.attribute}
                      {' '}{mainWeapon.load === 'twoHanded' ? '双手' : mainWeapon.load === 'offHand' ? '副手' : '单手'}
                    </Text>
                    {mainWeapon.traits.length > 0 && (
                      <View style={styles.traitRow}>
                        {mainWeapon.traits.map((t: WeaponTrait) => (
                          <View key={t} style={styles.traitBadge}>
                            <Text style={styles.traitText}>{WEAPON_TRAIT_LABELS[t] || t}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
              {offWeapon && (
                <View style={styles.equipRow}>
                  <Text style={styles.equipLabel}>副手</Text>
                  <View style={styles.equipInfo}>
                    <Text style={styles.equipName}>{offWeapon.name}</Text>
                    <Text style={styles.equipDetail}>
                      {offWeapon.damageDie}{offWeapon.damageModifier > 0 ? `+${offWeapon.damageModifier}` : offWeapon.damageModifier < 0 ? offWeapon.damageModifier : ''}
                    </Text>
                  </View>
                </View>
              )}
              {armorItem && (
                <View style={styles.equipRow}>
                  <Text style={styles.equipLabel}>护甲</Text>
                  <View style={styles.equipInfo}>
                    <Text style={styles.equipName}>{armorItem.name}</Text>
                    <Text style={styles.equipDetail}>
                      阈值 {armorItem.baseThreshold}/{armorItem.baseThresholdSevere} {armorItem.armorSlots}槽
                      {armorItem.evasionPenalty !== 0 ? ` 闪避${armorItem.evasionPenalty}` : ''}
                    </Text>
                    {armorItem.traits.length > 0 && (
                      <View style={styles.traitRow}>
                        {armorItem.traits.map((t: ArmorTrait) => (
                          <View key={t} style={styles.traitBadge}>
                            <Text style={styles.traitText}>{ARMOR_TRAIT_LABELS[t] || t}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
              {!mainWeapon && !offWeapon && !armorItem && (
                <Text style={styles.emptyText}>暂无装备数据</Text>
              )}
            </View>

            {/* Inventory */}
            {character.inventory.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>物品栏 ({character.inventory.length})</Text>
                {character.inventory.map(item => (
                  <View key={item.id} style={styles.inventoryRow}>
                    <Text style={styles.inventoryCheck}>{item.equipped ? '▣' : '□'}</Text>
                    <Text style={styles.inventoryName}>{item.name}</Text>
                    {item.quantity > 1 && <Text style={styles.inventoryQty}>x{item.quantity}</Text>}
                    <TouchableOpacity
                      onPress={() => {
                        handleUpdate({ inventory: character.inventory.filter(i => i.id !== item.id) });
                      }}
                    >
                      <Text style={styles.removeX}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Experiences */}
            {character.experiences.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>经历</Text>
                {character.experiences.map(exp => (
                  <View key={exp.id} style={styles.experienceRow}>
                    <Text style={styles.experienceName}>{exp.name}</Text>
                    <View style={styles.attributeButtons}>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => {
                          const newExps = character.experiences.map(e =>
                            e.id === exp.id ? { ...e, modifier: e.modifier - 1 } : e
                          );
                          handleUpdate({ experiences: newExps });
                        }}
                      >
                        <Text style={styles.smallButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.experienceMod}>+{exp.modifier}</Text>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => {
                          const newExps = character.experiences.map(e =>
                            e.id === exp.id ? { ...e, modifier: e.modifier + 1 } : e
                          );
                          handleUpdate({ experiences: newExps });
                        }}
                      >
                        <Text style={styles.smallButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Scars & Corruption */}
            {(character.scars.length > 0 || character.corruption > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>伤痕 / 污染</Text>
                {character.scars.map(scar => (
                  <View key={scar.id} style={styles.scarRow}>
                    <Text style={styles.scarName}>{scar.name}</Text>
                    {scar.lostHopeSlot && <Text style={styles.scarLost}>失去希望位</Text>}
                  </View>
                ))}
                {character.corruption > 0 && (
                  <View style={styles.corruptionRow}>
                    <Text style={styles.corruptionLabel}>污染等级</Text>
                    <View style={styles.corruptionDots}>
                      {Array.from({ length: 6 }, (_, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => handleUpdate({ corruption: i + 1 })}
                        >
                          <View
                            style={[styles.corruptionDot, i < character.corruption && styles.corruptionDotActive]}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => handleUpdate({ corruption: 0 })}>
                      <Text style={styles.resetText}>重置</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* GM Actions: Level Up & Add Item */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>GM操作</Text>

              {/* Level Up Button */}
              {character.level < 10 && (
                <TouchableOpacity
                  style={styles.gmActionButton}
                  onPress={() => handleLevelUp()}
                >
                  <Text style={styles.gmActionText}>⬆ 升级到 {character.level + 1} 级</Text>
                </TouchableOpacity>
              )}

              {/* Add Item Button */}
              <TouchableOpacity
                style={[styles.gmActionButton, { backgroundColor: '#27ae60' }]}
                onPress={() => setShowAddItem(true)}
              >
                <Text style={styles.gmActionText}>+ 发放物品</Text>
              </TouchableOpacity>

              {/* Quick consumable buttons */}
              <View style={styles.quickItemsRow}>
                <TouchableOpacity style={styles.quickItemBtn} onPress={() => addItemDirectly('小型生命药水', '立刻恢复1d4生命点')}>
                  <Text style={styles.quickItemText}>🧪生命药水</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickItemBtn} onPress={() => addItemDirectly('小型耐力药水', '立刻清除1d4压力点')}>
                  <Text style={styles.quickItemText}>🧪耐力药水</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickItemBtn} onPress={() => addItemDirectly('护甲缝合剂', '修复护甲槽')}>
                  <Text style={styles.quickItemText}>🧪护甲缝合</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Add Item Modal */}
            <Modal visible={showAddItem} animationType="slide" transparent>
              <View style={styles.overlay}>
                <View style={styles.addItemPanel}>
                  <Text style={styles.addItemTitle}>发放物品给 {character.name}</Text>
                  <TextInput
                    style={styles.addItemInput}
                    placeholder="物品名称"
                    placeholderTextColor="#7f8c8d"
                    value={newItemName}
                    onChangeText={setNewItemName}
                  />
                  <TextInput
                    style={[styles.addItemInput, { height: 60 }]}
                    placeholder="描述（可选）"
                    placeholderTextColor="#7f8c8d"
                    value={newItemDesc}
                    onChangeText={setNewItemDesc}
                    multiline
                  />
                  <View style={styles.addItemButtons}>
                    <TouchableOpacity style={styles.addItemCancel} onPress={() => setShowAddItem(false)}>
                      <Text style={styles.addItemCancelText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addItemConfirm}
                      onPress={() => {
                        if (newItemName.trim()) {
                          addItemDirectly(newItemName.trim(), newItemDesc.trim());
                          setShowAddItem(false);
                          setNewItemName('');
                          setNewItemDesc('');
                        }
                      }}
                    >
                      <Text style={styles.addItemConfirmText}>确认发放</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Helper: render editable resource bar
  function renderEditableResource(label: string, current: number, max: number, field: string) {
    const pct = max > 0 ? (current / max) * 100 : 0;
    const color = field === 'hp' ? '#e74c3c' : field === 'stress' ? '#e67e22' : field === 'hope' ? '#3498db' : '#95a5a6';
    return (
      <View style={eResStyles.row}>
        <Text style={eResStyles.label}>{label}</Text>
        <View style={eResStyles.barContainer}>
          <View style={[eResStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <TouchableOpacity style={eResStyles.button} onPress={() => handleStatDelta(field, current, max, -1)}>
          <Text style={eResStyles.buttonText}>-</Text>
        </TouchableOpacity>
        <Text style={eResStyles.value}>{current}/{max}</Text>
        <TouchableOpacity style={eResStyles.button} onPress={() => handleStatDelta(field, current, max, 1)}>
          <Text style={eResStyles.buttonText}>+</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

// ===== Stat Editor (generic +/- for any numeric field) =====
function StatEditor({ value, field, onUpdate }: { value: number; field: string; onUpdate: (u: Record<string, unknown>) => void }) {
  return (
    <View style={statStyles.container}>
      <TouchableOpacity style={statStyles.button} onPress={() => onUpdate({ [field]: value - 1 })}>
        <Text style={statStyles.buttonText}>-</Text>
      </TouchableOpacity>
      <Text style={statStyles.value}>{value}</Text>
      <TouchableOpacity style={statStyles.button} onPress={() => onUpdate({ [field]: value + 1 })}>
        <Text style={statStyles.buttonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ===== Domain color helper =====
function getDomainColor(domain: string): string {
  const colors: Record<string, string> = {
    arcane: '#9b59b6',
    blade: '#e74c3c',
    bone: '#7f8c8d',
    codex: '#3498db',
    elegance: '#e91e63',
    midnight: '#2c3e50',
    sage: '#27ae60',
    splendor: '#f39c12',
    valor: '#ff5722',
    song: '#1abc9c',
    nature: '#2ecc71',
  };
  return colors[domain] || '#3498db';
}

// ===== Sub-component Styles =====

const eResStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: '#bdc3c7',
    fontSize: 12,
    width: 44,
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#2c3e50',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  button: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  buttonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  value: {
    color: '#ecf0f1',
    fontSize: 12,
    width: 44,
    textAlign: 'center',
  },
});

const statStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  value: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    width: 28,
    textAlign: 'center',
  },
});

// ===== Main Styles =====

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 2,
    borderColor: '#8e44ad',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerInfo: {
    flex: 1,
  },
  charName: {
    color: '#ecf0f1',
    fontSize: 22,
    fontWeight: 'bold',
  },
  charClass: {
    color: '#f39c12',
    fontSize: 14,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Sections
  section: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  sectionTitle: {
    color: '#8e44ad',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  // Class Feature
  featureText: {
    color: '#ecf0f1',
    fontSize: 13,
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    padding: 8,
    marginBottom: 3,
  },
  featureName: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  featureDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 16,
  },
  primaryAttr: {
    color: '#2ecc71',
    fontSize: 12,
    marginTop: 6,
  },

  // Max values row
  maxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#16213e',
  },
  maxLabel: {
    color: '#7f8c8d',
    fontSize: 11,
  },

  // Attributes
  attributesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  attributeName: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  attributeValue: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    width: 28,
    textAlign: 'center',
  },
  attributeButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  smallButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallButtonText: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Thresholds
  thresholdRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  thresholdItem: {
    alignItems: 'center',
    gap: 4,
  },
  thresholdLabel: {
    color: '#7f8c8d',
    fontSize: 11,
  },

  // Conditions
  conditionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  conditionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e74c3c33',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  conditionText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: 'bold',
  },
  removeX: {
    color: '#7f8c8d',
    fontSize: 12,
    marginLeft: 2,
  },
  addConditionBadge: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e74c3c44',
    borderStyle: 'dashed',
  },
  addConditionText: {
    color: '#e74c3c99',
    fontSize: 11,
  },

  // Domain Cards
  domainCard: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  domainCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  domainCardName: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  domainBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  domainBadgeText: {
    color: '#ecf0f1',
    fontSize: 10,
    fontWeight: 'bold',
  },
  domainCardLevel: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  domainCardRecall: {
    color: '#f1c40f',
    fontSize: 11,
    fontWeight: 'bold',
  },
  domainCardCost: {
    color: '#e67e22',
    fontSize: 11,
    marginBottom: 2,
  },
  domainCardDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 16,
  },

  // Equipment
  equipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  equipLabel: {
    color: '#7f8c8d',
    fontSize: 12,
    width: 36,
  },
  equipInfo: {
    flex: 1,
  },
  equipName: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  equipDetail: {
    color: '#95a5a6',
    fontSize: 11,
  },
  traitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  traitBadge: {
    backgroundColor: '#2c3e50',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  traitText: {
    color: '#3498db',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Inventory
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  inventoryCheck: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  inventoryName: {
    color: '#ecf0f1',
    fontSize: 13,
    flex: 1,
  },
  inventoryQty: {
    color: '#95a5a6',
    fontSize: 11,
  },

  // Experiences
  experienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  experienceName: {
    color: '#ecf0f1',
    fontSize: 13,
    flex: 1,
  },
  experienceMod: {
    color: '#2ecc71',
    fontSize: 13,
    fontWeight: 'bold',
    width: 28,
    textAlign: 'center',
  },

  // Scars & Corruption
  scarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  scarName: {
    color: '#e74c3c',
    fontSize: 13,
    flex: 1,
  },
  scarLost: {
    color: '#9b59b6',
    fontSize: 11,
  },
  corruptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  corruptionLabel: {
    color: '#9b59b6',
    fontSize: 12,
  },
  corruptionDots: {
    flexDirection: 'row',
    gap: 4,
  },
  corruptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2c3e50',
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  corruptionDotActive: {
    backgroundColor: '#9b59b6',
  },
  resetText: {
    color: '#7f8c8d',
    fontSize: 11,
    textDecorationLine: 'underline',
  },

  // GM Actions
  gmActionButton: {
    backgroundColor: '#8e44ad',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  gmActionText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  quickItemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  quickItemBtn: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#27ae6044',
  },
  quickItemText: {
    color: '#2ecc71',
    fontSize: 11,
  },

  // Add Item Modal
  addItemPanel: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    width: '85%',
    padding: 20,
    borderWidth: 2,
    borderColor: '#27ae60',
  },
  addItemTitle: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  addItemInput: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    color: '#ecf0f1',
    fontSize: 14,
    marginBottom: 12,
  },
  addItemButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  addItemCancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2c3e50',
  },
  addItemCancelText: {
    color: '#bdc3c7',
    fontSize: 14,
  },
  addItemConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#27ae60',
  },
  addItemConfirmText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
