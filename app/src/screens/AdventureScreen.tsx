import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore, type AdventureMessage, type AdventureChoice } from '../store/gameStore';
import { sendPlayerAction, sendPlayerChoice, requestSpotlight, submitS0, activateXCard, resumeSafety } from '../hooks/useSocket';
import { theme } from '../theme/theme';
import { NarrativeCard } from '../components/NarrativeCard';
import { ResourceGauge } from '../components/ResourceGauge';
import { SpotlightIndicator } from '../components/SpotlightIndicator';
import { SafetyOverlay } from '../components/SafetyOverlay';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const S0_PHASE_LABELS: Record<string, string> = {
  safety: '安全工具',
  worldbuilding: '世界观共创',
  connections: '角色联系',
  expectations: '战役期望',
  narrativePact: '共创契约',
};

export function AdventureScreen() {
  const navigation = useNavigation<NavigationProp>();
  const character = useGameStore((s) => s.character);
  const adventureMessages = useGameStore((s) => s.adventureMessages);
  const aiProcessing = useGameStore((s) => s.aiProcessing);
  const gmTyping = useGameStore((s) => s.gmTyping);
  const streamingText = useGameStore((s) => s.streamingText);
  const currentLocationName = useGameStore((s) => s.currentLocationName);
  const fearPoints = useGameStore((s) => s.fearPoints);
  const sessionZeroPhase = useGameStore((s) => s.sessionZeroPhase);
  const addAdventureMessage = useGameStore((s) => s.addAdventureMessage);
  const isConnected = useGameStore((s) => s.isConnected);
  const spotlightState = useGameStore((s) => s.spotlightState);
  const playerId = useGameStore((s) => s.playerId);
  const players = useGameStore((s) => s.players);
  const safetyState = useGameStore((s) => s.safetyState);
  const xcardPaused = useGameStore((s) => s.xcardPaused);
  const isHost = useGameStore((s) => s.isHost);

  // Spotlight: can this player act?
  const canAct = (!spotlightState || spotlightState.current === null || spotlightState.current === playerId)
    && (!safetyState || (safetyState.phase === 'play' && !safetyState.xcardActive));
  const isHoldingSpotlight = spotlightState?.current === playerId;
  const queuePosition = spotlightState?.queue.indexOf(playerId) ?? -1;
  const currentSpotlightPlayer = spotlightState?.current
    ? players.find(p => p.id === spotlightState.current)
    : null;

  const [inputText, setInputText] = useState('');
  const [s0Lines, setS0Lines] = useState('');
  const [s0Veils, setS0Veils] = useState('');
  const [s0Tone, setS0Tone] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Compute dynamic placeholder based on latest narrator message
  const getInputPlaceholder = (): string => {
    if (sessionZeroPhase) {
      const phaseLabels: Record<string, string> = {
        safety: '分享你的边界和舒适度...',
        worldbuilding: '描述你想象中的世界细节...',
        connections: '讲述你们之间的故事...',
        expectations: '告诉我你期待的体验...',
        narrativePact: '确认你准备好共创了吗...',
      };
      return phaseLabels[sessionZeroPhase] || '你的回答...';
    }

    // Check if the last narrator message ends with a question
    const lastNarratorMsg = [...adventureMessages].reverse().find(m => m.role === 'narrator' || m.role === 'npc');
    if (lastNarratorMsg?.content.endsWith('？') || lastNarratorMsg?.content.endsWith('?')) {
      return '你的回答...';
    }

    return '描述你的行动...';
  };

  const inputPlaceholder = getInputPlaceholder();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (adventureMessages.length > 0 || streamingText.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [adventureMessages.length, streamingText.length]);

  const handleSend = () => {
    if (!inputText.trim() || aiProcessing || !canAct) return;

    const playerMsg: AdventureMessage = {
      id: `msg_${Date.now()}_player`,
      role: 'player',
      content: inputText.trim(),
      timestamp: Date.now(),
    };

    addAdventureMessage(playerMsg);
    setInputText('');

    // Send to AI GM via Socket
    sendPlayerAction(inputText.trim());
  };

  const handleChoice = (choice: AdventureChoice) => {
    if (aiProcessing) return;

    const playerMsg: AdventureMessage = {
      id: `msg_${Date.now()}_choice`,
      role: 'player',
      content: choice.text,
      timestamp: Date.now(),
    };

    addAdventureMessage(playerMsg);

    // Send choice to AI GM via Socket
    sendPlayerChoice(choice.id, choice.text);
  };

  const renderMessage = ({ item }: { item: AdventureMessage }) => {
    if (item.role === 'player') {
      return (
        <View style={styles.playerMessage}>
          <Text style={styles.playerMessageText}>{item.content}</Text>
          <Text style={styles.messageTime}>
            {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      );
    }

    if (item.role === 'npc') {
      return (
        <View style={styles.npcMessage}>
          <Text style={styles.npcName}>{item.npcName || 'NPC'}</Text>
          <Text style={styles.npcMessageText}>{item.content}</Text>
          {item.choices && renderChoices(item.choices)}
        </View>
      );
    }

    // narrator or system
    return (
      <View style={styles.narratorMessage}>
        <Text style={styles.narratorMessageText}>{item.content}</Text>
        {item.choices && renderChoices(item.choices)}
      </View>
    );
  };

  const renderChoices = (choices: AdventureChoice[]) => (
    <View style={styles.choicesContainer}>
      {choices.map((choice) => (
        <TouchableOpacity
          key={choice.id}
          style={styles.choiceButton}
          onPress={() => handleChoice(choice)}
          disabled={aiProcessing}
        >
          <Text style={styles.choiceText}>{choice.text}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderResourceBar = () => {
    if (!character) return null;
    return (
      <View style={styles.resourceBar}>
        <ResourceGauge label="HP" current={character.hp} max={character.maxHp} icon="heart" color={theme.color.danger} />
        <ResourceGauge label="压力" current={character.stress} max={character.maxStress} icon="flash" color={theme.color.warning} />
        <ResourceGauge label="希望" current={character.hope} max={character.maxHope} icon="sunny" color={theme.color.emerald} />
        <ResourceGauge label="护甲" current={character.armorSlots} max={character.maxArmorSlots} icon="shield" color={theme.color.fog} />
        <ResourceGauge label="恐惧" current={fearPoints} max={99} icon="skull" color={theme.color.blood} />
      </View>
    );
  };

  const renderLocationBar = () => {
    if (sessionZeroPhase) {
      return (
        <View style={[styles.locationBar, styles.s0LocationBar]}>
          <Ionicons name="people" size={14} color={theme.color.warning} />
          <Text style={styles.s0LocationText}>
            Session Zero · {S0_PHASE_LABELS[sessionZeroPhase] || sessionZeroPhase}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.locationBar}>
        <Ionicons name="location" size={14} color={theme.color.emerald} />
        <Text style={styles.locationText}>
          {currentLocationName || '余烬村'}
        </Text>
      </View>
    );
  };

  const renderQuickActions = () => (
    <View style={styles.quickActions}>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => navigation.navigate('Combat')}
      >
        <Ionicons name="cut" size={16} color={theme.color.danger} />
        <Text style={styles.quickActionText}>战斗</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => navigation.navigate('Rest')}
      >
        <Ionicons name="cafe" size={16} color={theme.color.emerald} />
        <Text style={styles.quickActionText}>休整</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => {
          // TODO: Open dice roller
        }}
      >
        <Ionicons name="dice-outline" size={16} color={theme.color.warning} />
        <Text style={styles.quickActionText}>掷骰</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => {
          // TODO: Open inventory
        }}
      >
        <Ionicons name="bag-handle" size={16} color={theme.color.accent} />
        <Text style={styles.quickActionText}>物品</Text>
      </TouchableOpacity>
      {safetyState && (
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={activateXCard}
        >
          <Ionicons name="hand-left" size={16} color={theme.color.danger} />
          <Text style={styles.quickActionText}>X-Card</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" />
      {renderLocationBar()}
      {renderResourceBar()}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={adventureMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="book" size={48} color={theme.color.fog} />
              <Text style={styles.emptyTitle}>你的冒险即将开始</Text>
              <Text style={styles.emptySubtitle}>
                在下方输入你的行动，AI管家将引导你的德拉肯海姆之旅
              </Text>
            </View>
          }
          ListFooterComponent={
            gmTyping ? (
              streamingText.length > 0 ? (
                <NarrativeCard content={streamingText} isStreaming />
              ) : (
                <View style={styles.processingIndicator}>
                  <ActivityIndicator size="small" color={theme.color.accent} />
                  <Text style={styles.processingText}>GM正在落笔…</Text>
                </View>
              )
            ) : null
          }
        />
        {renderQuickActions()}
        <SpotlightIndicator
          spotlight={spotlightState}
          playerId={playerId}
          players={players}
          onRequestSpotlight={requestSpotlight}
        />
        {/* S0 Safety submission form */}
        {safetyState && sessionZeroPhase === 'safety' ? (
          <View style={styles.s0Form}>
            <Text style={styles.s0FormTitle}>安全工具设定</Text>
            <Text style={styles.s0FormHint}>设定你的边界，确保所有人都能享受游戏</Text>
            <TextInput
              style={styles.s0Input}
              value={s0Lines}
              onChangeText={setS0Lines}
              placeholder="Lines（绝不出现的内容，逗号分隔）"
              placeholderTextColor={theme.color.muted}
            />
            <TextInput
              style={styles.s0Input}
              value={s0Veils}
              onChangeText={setS0Veils}
              placeholder="Veils（只暗示不描写的内容，逗号分隔）"
              placeholderTextColor={theme.color.muted}
            />
            <TextInput
              style={styles.s0Input}
              value={s0Tone}
              onChangeText={setS0Tone}
              placeholder="基调偏好（如：严肃、幽默、史诗…逗号分隔）"
              placeholderTextColor={theme.color.muted}
            />
            <TouchableOpacity
              style={styles.s0SubmitButton}
              onPress={() => {
                const lines = s0Lines.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                const veils = s0Veils.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                const toneFlags = s0Tone.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                if (lines.length > 0 || veils.length > 0 || toneFlags.length > 0) {
                  submitS0(lines, veils, toneFlags);
                  setS0Lines('');
                  setS0Veils('');
                  setS0Tone('');
                }
              }}
            >
              <Text style={styles.s0SubmitText}>提交</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.textInput, sessionZeroPhase ? styles.s0TextInput : undefined]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={inputPlaceholder}
            placeholderTextColor={theme.color.muted}
            multiline
            maxLength={500}
            editable={!aiProcessing && canAct}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || aiProcessing || !canAct) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || aiProcessing || !canAct}
          >
            <Ionicons name="send" size={20} color={theme.color.parchment} />
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>
      {/* X-Card pause overlay */}
      {xcardPaused && (
        <SafetyOverlay isHost={isHost} onResume={resumeSafety} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.ink,
  },
  flex: {
    flex: 1,
  },
  // Location bar
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: theme.color.bgInput,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.fog,
  },
  locationText: {
    color: theme.color.emerald,
    fontSize: 13,
    marginLeft: 4,
    fontFamily: theme.font.body,
  },
  s0LocationBar: {
    backgroundColor: theme.color.bgCard,
    borderBottomColor: theme.color.warning,
  },
  s0LocationText: {
    color: theme.color.warning,
    fontSize: 13,
    marginLeft: 4,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
  // Resource bar
  resourceBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: theme.color.bgInput,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.fog,
    gap: 12,
  },
  // Message list
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
  },
  // Player message
  playerMessage: {
    alignSelf: 'flex-end',
    backgroundColor: theme.color.bgInput,
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    marginBottom: 8,
  },
  playerMessageText: {
    color: theme.color.parchment,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: theme.font.body,
  },
  messageTime: {
    color: theme.color.textDim,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  // Narrator message
  narratorMessage: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.bgCard,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.color.gold,
  },
  narratorMessageText: {
    color: theme.color.parchment,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: theme.font.body,
  },
  // NPC message
  npcMessage: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.bgCard,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.color.accent,
  },
  npcName: {
    color: theme.color.accent,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
    marginBottom: 4,
  },
  npcMessageText: {
    color: theme.color.parchment,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: theme.font.body,
  },
  // Choices
  choicesContainer: {
    marginTop: 8,
    gap: 6,
  },
  choiceButton: {
    backgroundColor: theme.color.bgInput,
    borderRadius: theme.radius.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.color.emerald,
  },
  choiceText: {
    color: theme.color.emerald,
    fontSize: 14,
    fontFamily: theme.font.body,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    color: theme.color.textDim,
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
    marginTop: 16,
  },
  emptySubtitle: {
    color: theme.color.muted,
    fontSize: 14,
    fontFamily: theme.font.body,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  // Processing indicator
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 6,
  },
  processingText: {
    color: theme.color.textDim,
    fontSize: 12,
    fontFamily: theme.font.body,
  },
  // Quick actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.bgInput,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  quickActionText: {
    color: theme.color.textDim,
    fontSize: 12,
    fontFamily: theme.font.body,
  },
  // Input container
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.color.bgInput,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.color.parchment,
    fontSize: 15,
    fontFamily: theme.font.body,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.color.fog,
  },
  s0TextInput: {
    borderColor: theme.color.warning,
    borderWidth: 2,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.color.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: theme.color.fog,
  },
  // S0 Safety form
  s0Form: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  s0FormTitle: {
    color: theme.color.warning,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
  s0FormHint: {
    color: theme.color.textDim,
    fontSize: 12,
    fontFamily: theme.font.body,
  },
  s0Input: {
    backgroundColor: theme.color.bgInput,
    borderRadius: theme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: theme.color.parchment,
    fontSize: 14,
    fontFamily: theme.font.body,
    borderWidth: 1,
    borderColor: theme.color.warning,
  },
  s0SubmitButton: {
    backgroundColor: theme.color.warning,
    borderRadius: theme.radius.button,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  s0SubmitText: {
    color: theme.color.ink,
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
});
