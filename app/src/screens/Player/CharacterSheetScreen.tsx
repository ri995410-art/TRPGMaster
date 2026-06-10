import React from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useGameStore } from '../../store/gameStore';
import { DiceTray } from '../../components/DiceTray/DiceTray';
import { ImagePanel } from '../../components/GM/ImagePanel';
import { sendInputText, sendGameEvent, sendChatMessage, sendInputVoice, sendInputVision } from '../../hooks/useSocket';
import { useVoiceCapture, useCameraCapture } from '../../hooks/useMediaCapture';
import { useGameData } from '../../hooks/useGameData';
import { ATTRIBUTE_LABELS, CONDITION_LABELS, DOMAIN_LABELS, WEAPON_TRAIT_LABELS, ARMOR_TRAIT_LABELS, DISTANCE_LABELS } from '@trpgmaster/shared';
import type { Character, DomainCard as DomainCardType, ClassData, WeaponData, ArmorData, WeaponTrait, ArmorTrait } from '@trpgmaster/shared';

export function CharacterSheetScreen() {
  useGameData(); // Fetch classes/weapons/armor/domains from server
  const sessionState = useGameStore(s => s.sessionState);
  const characters = useGameStore(s => s.characters);
  const myCharacterId = useGameStore(s => s.myCharacterId);
  const isConnected = useGameStore(s => s.isConnected);
  const chatMessages = useGameStore(s => s.chatMessages);
  const lastParsedIntent = useGameStore(s => s.lastParsedIntent);
  const inputMode = useGameStore(s => s.inputMode);
  const setInputMode = useGameStore(s => s.setInputMode);
  const gameData = useGameStore(s => s.gameData);
  const [actionText, setActionText] = React.useState('');

  const { isRecording, startRecording, stopRecording } = useVoiceCapture();
  const { capture: cameraCapture } = useCameraCapture();

  const myCharacter = characters.find(c => c.id === myCharacterId);

  const handleStatChange = (characterId: string, stat: 'hp' | 'stress' | 'hope' | 'armorSlots', delta: number) => {
    const store = useGameStore.getState();
    switch (stat) {
      case 'hp': store.updateCharacterHp(characterId, delta); break;
      case 'stress': store.updateCharacterStress(characterId, delta); break;
      case 'hope': store.updateCharacterHope(characterId, delta); break;
    }
  };

  const handleSendAction = () => {
    if (!actionText.trim()) return;

    sendInputText(actionText, myCharacterId || undefined);
    sendChatMessage(actionText);
    setActionText('');
  };

  const handleVoicePress = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        sendInputVoice(result.audioData, result.format, result.duration);
      }
    } else {
      await startRecording();
    }
  };

  const handleVisionPress = async () => {
    const result = await cameraCapture();
    if (result) {
      sendInputVision(result.imageData, result.format);
      sendChatMessage('[拍摄了场景图片]');
    }
  };

  // Lookup helpers
  const classData = gameData.classes.find(c => c.id === myCharacter?.classId);
  const mainWeapon = gameData.weapons.find(w => w.id === myCharacter?.mainWeaponId);
  const offWeapon = gameData.weapons.find(w => w.id === myCharacter?.offWeaponId);
  const armorItem = gameData.armor.find(a => a.id === myCharacter?.armorId);

  const isSetup = sessionState?.status === 'setup';
  const isSessionActive = sessionState?.status === 'active';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Waiting Area */}
      {isSetup && (
        <View style={styles.waitingBanner}>
          <Text style={styles.waitingTitle}>等待GM开始会话</Text>
          <Text style={styles.waitingSubtext}>
            已加入 {characters.length} 位角色
          </Text>
          {characters.length > 0 && (
            <View style={styles.playerList}>
              {characters.map(c => (
                <View key={c.id} style={styles.playerItem}>
                  <Text style={styles.playerName}>{c.name}</Text>
                  <Text style={styles.playerClass}>{c.classId}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Full Character Sheet */}
      {!myCharacter && isConnected && (
        <View style={styles.noCharBox}>
          <Text style={styles.noCharText}>尚未创建角色</Text>
          <Text style={styles.noCharSub}>请返回完成角色创建流程</Text>
        </View>
      )}
      {myCharacter && (
        <View style={styles.sheet}>
          {/* Header: Name + Level + Class */}
          <View style={styles.sheetHeader}>
            <View style={styles.nameRow}>
              <Text style={styles.charName}>{myCharacter.name}</Text>
              <Text style={styles.charLevel}>Lv.{myCharacter.level}</Text>
            </View>
            <Text style={styles.charClass}>
              {classData ? `${classData.name} (${classData.nameEn})` : myCharacter.classId}
            </Text>

            {/* Class Feature */}
            {classData && (
              <View style={styles.featureBox}>
                <Text style={styles.featureLabel}>职业特性</Text>
                <Text style={styles.featureText}>{classData.hopeFeature}</Text>
              </View>
            )}

            {/* Primary Attribute */}
            {classData && (
              <View style={styles.primaryAttrRow}>
                <Text style={styles.primaryAttrLabel}>主要属性</Text>
                <Text style={styles.primaryAttrValue}>
                  {ATTRIBUTE_LABELS[classData.primaryAttribute]}
                </Text>
              </View>
            )}
          </View>

          {/* Resources */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>资源</Text>
            {renderResourceBar('HP', myCharacter.hp, myCharacter.maxHp, '#e74c3c', isSetup, (d) => handleStatChange(myCharacter.id, 'hp', d))}
            {renderResourceBar('压力', myCharacter.stress, myCharacter.maxStress, '#e67e22', isSetup, (d) => handleStatChange(myCharacter.id, 'stress', d))}
            {renderResourceBar('希望', myCharacter.hope, myCharacter.maxHope, '#3498db', isSetup, (d) => handleStatChange(myCharacter.id, 'hope', d))}
            {renderResourceBar('护甲', myCharacter.armorSlots, myCharacter.maxArmorSlots, '#95a5a6', isSetup, (d) => handleStatChange(myCharacter.id, 'armorSlots', d))}
          </View>

          {/* Attributes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>属性</Text>
            <View style={styles.attributesGrid}>
              {(Object.entries(myCharacter.attributes) as [keyof typeof ATTRIBUTE_LABELS, number][]).map(([attr, value]) => (
                <View key={attr} style={styles.attributeChip}>
                  <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
                  <Text style={[styles.attributeValue, value > 0 && styles.positive, value < 0 && styles.negative]}>
                    {value > 0 ? '+' : ''}{value}
                  </Text>
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
                <Text style={styles.thresholdValue}>{myCharacter.evasion}</Text>
              </View>
              <View style={styles.thresholdItem}>
                <Text style={styles.thresholdLabel}>重度</Text>
                <Text style={styles.thresholdValue}>{myCharacter.majorThreshold}</Text>
              </View>
              <View style={styles.thresholdItem}>
                <Text style={styles.thresholdLabel}>严重</Text>
                <Text style={styles.thresholdValue}>{myCharacter.severeThreshold}</Text>
              </View>
            </View>
          </View>

          {/* Conditions */}
          {myCharacter.conditions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>状态条件</Text>
              <View style={styles.conditionsWrap}>
                {myCharacter.conditions.map((cond) => (
                  <View key={cond} style={styles.conditionBadge}>
                    <Text style={styles.conditionText}>{CONDITION_LABELS[cond] || cond}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Domain Cards */}
          {myCharacter.domainCards.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>领域卡</Text>
              {myCharacter.domainCards.map((card) => (
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
                  </View>
                  {card.cost && <Text style={styles.domainCardCost}>消耗: {card.cost}</Text>}
                  <Text style={styles.domainCardDesc} numberOfLines={3}>{card.effect || card.description}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Equipment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>装备</Text>
            {mainWeapon && (
              <View style={styles.equipRow}>
                <Text style={styles.equipLabel}>主手</Text>
                <View style={styles.equipInfo}>
                  <Text style={styles.equipName}>{mainWeapon.name}</Text>
                  <Text style={styles.equipDetail}>
                    {mainWeapon.damageDie}{mainWeapon.damageModifier >= 0 ? (mainWeapon.damageModifier > 0 ? `+${mainWeapon.damageModifier}` : '') : mainWeapon.damageModifier} {ATTRIBUTE_LABELS[mainWeapon.attribute] || mainWeapon.attribute}
                    {' '}{mainWeapon.load === 'twoHanded' ? '双手' : mainWeapon.load === 'offHand' ? '副手' : '单手'}
                    {mainWeapon.distance ? ` ${DISTANCE_LABELS[mainWeapon.distance] || mainWeapon.distance}` : ''}
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
                    {offWeapon.damageDie}{offWeapon.damageModifier >= 0 ? (offWeapon.damageModifier > 0 ? `+${offWeapon.damageModifier}` : '') : offWeapon.damageModifier} {ATTRIBUTE_LABELS[offWeapon.attribute] || offWeapon.attribute}
                  </Text>
                  {offWeapon.traits.length > 0 && (
                    <View style={styles.traitRow}>
                      {offWeapon.traits.map((t: WeaponTrait) => (
                        <View key={t} style={styles.traitBadge}>
                          <Text style={styles.traitText}>{WEAPON_TRAIT_LABELS[t] || t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
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
          {myCharacter.inventory.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>物品栏</Text>
              {myCharacter.inventory.map((item) => (
                <View key={item.id} style={styles.inventoryRow}>
                  <Text style={styles.inventoryCheck}>{item.equipped ? '▣' : '□'}</Text>
                  <Text style={styles.inventoryName}>{item.name}</Text>
                  {item.quantity > 1 && <Text style={styles.inventoryQty}>x{item.quantity}</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Experiences */}
          {myCharacter.experiences.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>经历</Text>
              {myCharacter.experiences.map((exp) => (
                <View key={exp.id} style={styles.experienceRow}>
                  <Text style={styles.experienceName}>{exp.name}</Text>
                  <Text style={[styles.experienceMod, exp.modifier > 0 && styles.positive]}>
                    +{exp.modifier}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Scars & Corruption */}
          {(myCharacter.scars.length > 0 || myCharacter.corruption > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>伤痕 / 污染</Text>
              {myCharacter.scars.map((scar) => (
                <View key={scar.id} style={styles.scarRow}>
                  <Text style={styles.scarName}>{scar.name}</Text>
                  {scar.lostHopeSlot && <Text style={styles.scarLost}>失去希望位</Text>}
                </View>
              ))}
              {myCharacter.corruption > 0 && (
                <View style={styles.corruptionRow}>
                  <Text style={styles.corruptionLabel}>污染等级</Text>
                  <View style={styles.corruptionDots}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <View
                        key={i}
                        style={[styles.corruptionDot, i < myCharacter.corruption && styles.corruptionDotActive]}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Other Characters - compact view during active session */}
      {isSessionActive && characters.filter(c => c.id !== myCharacterId).map(char => (
        <CompactCharacterCard key={char.id} character={char} gameData={gameData} />
      ))}

      {/* Dice Tray */}
      {isSessionActive && (
        <DiceTray onRoll={(h, f, m, d, opts) => {
          // Compute roll result based on DaggerHeart duality dice rules
          let result: string;
          const total = h + f + m;
          if (h === f) {
            result = 'criticalSuccess'; // matching doubles = critical success
          } else if (h > f) {
            result = total >= d ? 'hopeSuccess' : 'hopeFailure';
          } else {
            result = total >= d ? 'fearSuccess' : 'fearFailure';
          }
          sendGameEvent({
            id: Date.now().toString(),
            sessionId: useGameStore.getState().sessionId || '',
            timestamp: Date.now(),
            type: 'player:roll',
            source: 'player',
            hopeDie: h,
            fearDie: f,
            modifier: m,
            difficulty: d,
            result,
            characterId: myCharacterId || '',
            advantageCount: opts?.advantageCount,
            disadvantageCount: opts?.disadvantageCount,
            rollType: opts?.rollType,
          } as any);
        }} />
      )}

      {/* Action Input */}
      <View style={styles.actionBox}>
        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={[styles.modeButton, inputMode === 'text' && styles.modeButtonActive]}
            onPress={() => setInputMode('text')}
          >
            <Text style={[styles.modeButtonText, inputMode === 'text' && styles.modeButtonTextActive]}>文字</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, inputMode === 'voice' && styles.modeButtonActive]}
            onPress={() => setInputMode('voice')}
          >
            <Text style={[styles.modeButtonText, inputMode === 'voice' && styles.modeButtonTextActive]}>语音</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, inputMode === 'vision' && styles.modeButtonActive]}
            onPress={() => setInputMode('vision')}
          >
            <Text style={[styles.modeButtonText, inputMode === 'vision' && styles.modeButtonTextActive]}>视觉</Text>
          </TouchableOpacity>
        </View>

        {inputMode === 'text' && (
          <View style={styles.textInputRow}>
            <TextInput
              style={styles.actionInput}
              placeholder="描述你的行动..."
              placeholderTextColor="#7f8c8d"
              value={actionText}
              onChangeText={setActionText}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendAction}>
              <Text style={styles.sendButtonText}>行动</Text>
            </TouchableOpacity>
          </View>
        )}

        {inputMode === 'voice' && (
          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
            onPress={handleVoicePress}
          >
            <Text style={styles.voiceButtonText}>
              {isRecording ? '录音中...点击停止' : '按住说话'}
            </Text>
          </TouchableOpacity>
        )}

        {inputMode === 'vision' && (
          <TouchableOpacity style={styles.visionButton} onPress={handleVisionPress}>
            <Text style={styles.visionButtonText}>拍摄场景</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Parsed Intent Display */}
      {lastParsedIntent && lastParsedIntent.intentType !== 'unknown' && (
        <View style={styles.intentBox}>
          <Text style={styles.intentText}>
            意图: {lastParsedIntent.intentType} ({Math.round(lastParsedIntent.confidence * 100)}%)
          </Text>
        </View>
      )}

      {/* Chat Log */}
      <View style={styles.chatBox}>
        <Text style={styles.chatTitle}>对话记录</Text>
        {chatMessages.length === 0 && (
          <Text style={styles.chatEmpty}>暂无对话</Text>
        )}
        {chatMessages.slice(-20).map((msg, i) => (
          <View key={msg.id || i} style={[
            styles.chatMessage,
            msg.type === 'system' ? styles.chatSystemMessage : undefined,
            msg.typeLabel ? styles.chatTypedMessage : undefined,
          ]}>
            <Text style={[
              styles.chatSender,
              msg.type === 'system' ? styles.chatSystemSender : undefined,
              msg.type === 'gm' ? styles.chatGmSender : undefined,
              msg.typeLabel ? styles.chatTypedSender : undefined,
            ]}>
              {msg.typeLabel || msg.senderName}
            </Text>
            <Text style={styles.chatText}>{msg.text}</Text>
          </View>
        ))}
      </View>

      <ImagePanel />
    </ScrollView>
  );
}

// ===== Resource Bar =====
function renderResourceBar(
  label: string,
  current: number,
  max: number,
  color: string,
  canEdit: boolean,
  onChange: (delta: number) => void,
) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  return (
    <View style={rBarStyles.row}>
      <Text style={rBarStyles.label}>{label}</Text>
      <View style={rBarStyles.barContainer}>
        <View style={[rBarStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      {canEdit ? (
        <View style={rBarStyles.buttons}>
          <TouchableOpacity style={rBarStyles.button} onPress={() => onChange(-1)}>
            <Text style={rBarStyles.buttonText}>-</Text>
          </TouchableOpacity>
          <Text style={rBarStyles.value}>{current}/{max}</Text>
          <TouchableOpacity style={rBarStyles.button} onPress={() => onChange(1)}>
            <Text style={rBarStyles.buttonText}>+</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={rBarStyles.valueReadonly}>{current}/{max}</Text>
      )}
    </View>
  );
}

// ===== Compact Card for other characters =====
function CompactCharacterCard({ character, gameData }: { character: Character; gameData: { classes: ClassData[]; weapons: WeaponData[]; armor: ArmorData[] } }) {
  const classData = gameData.classes.find(c => c.id === character.classId);
  return (
    <View style={compactStyles.container}>
      <View style={compactStyles.header}>
        <Text style={compactStyles.name}>{character.name}</Text>
        <Text style={compactStyles.classInfo}>
          Lv.{character.level} {classData?.name || character.classId}
        </Text>
      </View>
      <View style={compactStyles.resources}>
        <Text style={compactStyles.resText}>HP {character.hp}/{character.maxHp}</Text>
        <Text style={compactStyles.resText}>压力 {character.stress}/{character.maxStress}</Text>
        <Text style={compactStyles.resText}>希望 {character.hope}/{character.maxHope}</Text>
      </View>
      {character.conditions.length > 0 && (
        <View style={compactStyles.conditions}>
          {character.conditions.map(c => (
            <View key={c} style={compactStyles.conditionBadge}>
              <Text style={compactStyles.conditionText}>{CONDITION_LABELS[c] || c}</Text>
            </View>
          ))}
        </View>
      )}
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

// ===== Styles =====

const rBarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: '#bdc3c7',
    fontSize: 12,
    width: 36,
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
  buttons: {
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  value: {
    color: '#ecf0f1',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
  valueReadonly: {
    color: '#bdc3c7',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
});

const compactStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#16213e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  name: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
  },
  classInfo: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  resources: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  resText: {
    color: '#95a5a6',
    fontSize: 11,
  },
  conditions: {
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
    fontSize: 10,
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  content: {
    padding: 16,
  },

  // Waiting Area
  waitingBanner: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f39c12',
  },
  waitingTitle: {
    color: '#f39c12',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  waitingSubtext: {
    color: '#7f8c8d',
    fontSize: 14,
    marginBottom: 12,
  },
  playerList: {
    width: '100%',
    gap: 4,
  },
  playerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  playerName: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerClass: {
    color: '#bdc3c7',
    fontSize: 13,
  },

  // Character Sheet
  noCharBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f39c12',
  },
  noCharText: {
    color: '#f39c12',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noCharSub: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 4,
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3498db',
  },
  sheetHeader: {
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  charName: {
    color: '#ecf0f1',
    fontSize: 22,
    fontWeight: 'bold',
  },
  charLevel: {
    color: '#bdc3c7',
    fontSize: 16,
  },
  charClass: {
    color: '#f39c12',
    fontSize: 14,
    marginTop: 2,
  },
  featureBox: {
    backgroundColor: '#2a2a4e',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  featureLabel: {
    color: '#f39c12',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  featureText: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  primaryAttrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  primaryAttrLabel: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  primaryAttrValue: {
    color: '#2ecc71',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Sections
  section: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  sectionTitle: {
    color: '#3498db',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 4,
  },
  attributeName: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  attributeValue: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },

  // Thresholds
  thresholdRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thresholdItem: {
    alignItems: 'center',
  },
  thresholdLabel: {
    color: '#7f8c8d',
    fontSize: 11,
    marginBottom: 2,
  },
  thresholdValue: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Conditions
  conditionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  conditionBadge: {
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
    marginBottom: 3,
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

  // Action Input
  actionBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
  },
  modeSwitcher: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 4,
  },
  modeButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  modeButtonActive: {
    backgroundColor: '#3498db',
  },
  modeButtonText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  modeButtonTextActive: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  actionInput: {
    flex: 1,
    color: '#ecf0f1',
    fontSize: 14,
    maxHeight: 80,
    padding: 8,
  },
  sendButton: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendButtonText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  voiceButton: {
    backgroundColor: '#27ae60',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: '#c0392b',
  },
  voiceButtonText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  visionButton: {
    backgroundColor: '#8e44ad',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  visionButtonText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  intentBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  intentText: {
    color: '#3498db',
    fontSize: 12,
  },

  // Chat
  chatBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  chatTitle: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  chatEmpty: {
    color: '#7f8c8d',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  chatMessage: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  chatSystemMessage: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    padding: 4,
    paddingHorizontal: 8,
  },
  chatTypedMessage: {
    backgroundColor: '#1a2a3e',
    borderRadius: 6,
    padding: 4,
    paddingHorizontal: 8,
  },
  chatSender: {
    color: '#3498db',
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 40,
  },
  chatGmSender: {
    color: '#8e44ad',
  },
  chatTypedSender: {
    color: '#f39c12',
    fontWeight: 'bold',
    fontSize: 11,
  },
  chatSystemSender: {
    color: '#f39c12',
    fontSize: 11,
  },
  chatText: {
    color: '#bdc3c7',
    fontSize: 13,
    flex: 1,
  },
});
