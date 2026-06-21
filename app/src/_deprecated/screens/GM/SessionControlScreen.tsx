import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, LayoutAnimation } from 'react-native';
import { useGameStore } from '../../store/gameStore';
import { DiceTray } from '../../components/DiceTray/DiceTray';
import { SuggestionPanel } from '../../components/GM/SuggestionPanel';
import { ImagePanel } from '../../components/GM/ImagePanel';
import { CharacterDetailPanel } from '../../components/GM/CharacterDetailPanel';
import { sendInputText, sendChatMessage, startSession, endSession, sendInputVoice, sendInputVision, sendUndoLastAuto, sendAgentModeSwitch } from '../../hooks/useSocket';
import { useVoiceCapture, useCameraCapture } from '../../hooks/useMediaCapture';
import { useGameData } from '../../hooks/useGameData';

type AgentMode = 'multi' | 'unified';
type GMMessageTarget = 'players' | 'ai';
type GMInputMode = 'text' | 'voice' | 'vision';
type GMAssistType = 'narrative' | 'npc' | 'combat' | 'rules' | 'image' | 'scene' | 'none';

const ASSIST_LABELS: Record<GMAssistType, string> = {
  narrative: '场景叙事',
  npc: 'NPC对话',
  combat: '战斗行动',
  rules: '规则裁定',
  image: '场景图片',
  scene: '环境氛围',
  none: '无辅助',
};

export function SessionControlScreen() {
  useGameData(); // Fetch classes/weapons/armor/domains for character panel
  const sessionState = useGameStore(s => s.sessionState);
  const characters = useGameStore(s => s.characters);
  const fearPoints = useGameStore(s => s.sessionState?.fearPoints ?? 0);
  const totalFearGained = useGameStore(s => s.sessionState?.totalFearGained ?? 0);
  const totalFearSpent = useGameStore(s => s.sessionState?.totalFearSpent ?? 0);
  const isConnected = useGameStore(s => s.isConnected);
  const chatMessages = useGameStore(s => s.chatMessages);
  const updateFearPoints = useGameStore(s => s.updateFearPoints);
  const [gmInput, setGmInput] = React.useState('');
  const [messageTarget, setMessageTarget] = React.useState<GMMessageTarget>('players');
  const [inputMode, setInputMode] = React.useState<GMInputMode>('text');
  const [assistType, setAssistType] = React.useState<GMAssistType>('none');
  const [showCharPanel, setShowCharPanel] = React.useState(false);
  const [showDice, setShowDice] = React.useState(false);
  const [showSidebarTab, setShowSidebarTab] = React.useState<'suggestions' | 'images'>('suggestions');
  const [selectedCharId, setSelectedCharId] = React.useState<string | null>(null);
  const agentMode = useGameStore(s => s.agentMode);
  const gameData = useGameStore(s => s.gameData);
  const serverUrl = useGameStore(s => s.serverUrl);

  const toggleAgentMode = React.useCallback(() => {
    const newMode: AgentMode = agentMode === 'multi' ? 'unified' : 'multi';
    sendAgentModeSwitch(newMode);
  }, [agentMode]);

  const { isRecording, startRecording, stopRecording } = useVoiceCapture();
  const { capture: cameraCapture } = useCameraCapture();

  const handleRoll = (hopeDie: number, fearDie: number, modifier: number, difficulty: number, _options?: any) => {
    if (fearDie > hopeDie) {
      updateFearPoints(1);
    }
  };

  const handleSendGMInput = () => {
    if (!gmInput.trim()) return;

    // Always send to AI for processing
    sendInputText(gmInput);

    // Only send as chat message if targeting players
    if (messageTarget === 'players') {
      sendChatMessage(gmInput);
    }

    setGmInput('');
  };

  const handleVoicePress = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        // Only send to server for STT processing - server will broadcast
        // the transcribed text as chat:message
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
      if (messageTarget === 'players') {
        sendChatMessage('[拍摄了场景图片]');
      }
    }
  };

  const toggleCharPanel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCharPanel(!showCharPanel);
  };

  const toggleDice = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowDice(!showDice);
  };

  const handleUndo = () => {
    sendUndoLastAuto();
  };

  const isSessionActive = sessionState?.status === 'active';
  const isSetup = sessionState?.status === 'setup';

  // Tension level display
  const tensionScore = totalFearGained + totalFearSpent;
  const tensionLabel = tensionScore >= 9 ? '极限' : tensionScore >= 6 ? '高压' : tensionScore >= 3 ? '紧张' : '平静';
  const tensionColor = tensionScore >= 9 ? '#e74c3c' : tensionScore >= 6 ? '#e67e22' : tensionScore >= 3 ? '#f39c12' : '#2ecc71';

  // Filter chat messages for display
  const displayMessages = chatMessages.slice(-30);

  return (
    <View style={styles.screen}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>状态</Text>
          <Text style={[styles.statusValue, isSessionActive && styles.activeText]}>
            {isSessionActive ? '进行中' : isSetup ? '未开始' : '已结束'}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>连接</Text>
          <Text style={[styles.statusValue, isConnected ? styles.connected : styles.disconnected]}>
            {isConnected ? '在线' : '离线'}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>恐惧</Text>
          <TouchableOpacity style={styles.fearButton} onPress={() => updateFearPoints(-1)}>
            <Text style={styles.fearButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.fearValue}>{fearPoints}</Text>
          <TouchableOpacity style={styles.fearButton} onPress={() => updateFearPoints(1)}>
            <Text style={styles.fearButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statusItem}>
          <Text style={[styles.tensionBadge, { backgroundColor: tensionColor }]}>
            紧张:{tensionLabel}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={toggleCharPanel}>
          <Text style={styles.iconButtonText}>{showCharPanel ? '▼' : '▶'} 角色({characters.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={toggleDice}>
          <Text style={styles.iconButtonText}>{showDice ? '▼' : '▶'} 骰子</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={handleUndo}>
          <Text style={styles.iconButtonText}>↩ 撤销</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, agentMode === 'unified' && styles.agentModeUnified]}
          onPress={toggleAgentMode}
        >
          <Text style={[styles.iconButtonText, agentMode === 'unified' && styles.iconButtonTextActive]}>
            {agentMode === 'multi' ? '多Agent' : '单Agent'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Fear detail row */}
      {(totalFearGained > 0 || totalFearSpent > 0) && (
        <View style={styles.fearDetailRow}>
          <Text style={styles.fearDetailText}>累计获得:{totalFearGained} | 累计消耗:{totalFearSpent}</Text>
        </View>
      )}

      {/* Collapsible Character Panel */}
      {showCharPanel && (
        <View style={styles.charPanel}>
          {characters.length === 0 && (
            <Text style={styles.emptyText}>等待玩家加入...</Text>
          )}
          {characters.map(char => (
            <TouchableOpacity key={char.id} style={styles.charRow} onPress={() => setSelectedCharId(char.id)}>
              <Text style={styles.charName}>{char.name}</Text>
              <Text style={styles.charStat}>HP:{char.hp}/{char.maxHp}</Text>
              <Text style={styles.charStat}>压力:{char.stress}/{char.maxStress}</Text>
              <Text style={styles.charStat}>希望:{char.hope}/{char.maxHope}</Text>
              <Text style={styles.charDetail}>详情▸</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Character Detail Modal */}
      {selectedCharId && (
        <CharacterDetailPanel
          character={characters.find(c => c.id === selectedCharId)!}
          gameData={gameData}
          serverUrl={serverUrl}
          visible={!!selectedCharId}
          onClose={() => setSelectedCharId(null)}
        />
      )}

      {/* Collapsible Dice Tray */}
      {showDice && (
        <View style={styles.dicePanel}>
          <DiceTray onRoll={handleRoll} />
        </View>
      )}

      {/* Main Content Area - Two columns */}
      <View style={styles.mainArea}>
        {/* Left column: Player Chat */}
        <View style={styles.chatColumn}>
          {/* Session Start/End */}
          {isSetup && (
            <TouchableOpacity style={styles.startButton} onPress={startSession}>
              <Text style={styles.startButtonText}>开始会话</Text>
            </TouchableOpacity>
          )}
          {isSessionActive && (
            <TouchableOpacity style={styles.endButton} onPress={endSession}>
              <Text style={styles.endButtonText}>结束会话</Text>
            </TouchableOpacity>
          )}

          {/* Scene Description */}
          <View style={styles.sceneBox}>
            <Text style={styles.sceneTitle}>当前场景</Text>
            <Text style={styles.sceneName}>
              {sessionState?.currentScene?.name || '等待会话开始...'}
            </Text>
            {sessionState?.currentScene?.description && (
              <Text style={styles.sceneDesc}>
                {sessionState.currentScene.description}
              </Text>
            )}
          </View>

          {/* Chat Messages */}
          <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatScrollContent}>
            <Text style={styles.chatTitle}>对话记录</Text>
            {displayMessages.length === 0 && (
              <Text style={styles.emptyText}>暂无对话</Text>
            )}
            {displayMessages.map((msg, i) => (
              <View key={msg.id || i} style={[
                styles.chatMessage,
                msg.type === 'system' && styles.chatSystemMessage,
                msg.autoSent && styles.chatAutoMessage,
              ]}>
                <Text style={[
                  styles.chatSender,
                  msg.type === 'system' && styles.chatSystemSender,
                  msg.type === 'gm' && styles.chatGmSender,
                ]}>
                  {msg.typeLabel ? `${msg.typeLabel}` : msg.senderName}
                </Text>
                <Text style={styles.chatText}>{msg.text}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Right column: Tabbed sidebar with Suggestions and Images */}
        <View style={styles.suggestionColumn}>
          <View style={styles.sidebarTabs}>
            <TouchableOpacity
              style={[styles.sidebarTab, showSidebarTab === 'suggestions' && styles.sidebarTabActive]}
              onPress={() => setShowSidebarTab('suggestions')}
            >
              <Text style={[styles.sidebarTabText, showSidebarTab === 'suggestions' && styles.sidebarTabTextActive]}>建议</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sidebarTab, showSidebarTab === 'images' && styles.sidebarTabActive]}
              onPress={() => setShowSidebarTab('images')}
            >
              <Text style={[styles.sidebarTabText, showSidebarTab === 'images' && styles.sidebarTabTextActive]}>图片</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sidebarContent}>
            {showSidebarTab === 'suggestions' ? <SuggestionPanel /> : <ImagePanel />}
          </View>
        </View>
      </View>

      {/* GM Input Box - Fixed at Bottom */}
      <View style={styles.gmInputBox}>
        {/* Message Target Toggle */}
        <View style={styles.targetRow}>
          <TouchableOpacity
            style={[styles.targetButton, messageTarget === 'players' && styles.targetButtonActive]}
            onPress={() => setMessageTarget('players')}
          >
            <Text style={[styles.targetButtonText, messageTarget === 'players' && styles.targetButtonTextActive]}>
              对玩家
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.targetButton, messageTarget === 'ai' && styles.targetButtonActiveAI]}
            onPress={() => setMessageTarget('ai')}
          >
            <Text style={[styles.targetButtonText, messageTarget === 'ai' && styles.targetButtonTextActiveAI]}>
              对AI助手
            </Text>
          </TouchableOpacity>

          {/* Assist type selector (only visible when targeting AI) */}
          {messageTarget === 'ai' && (
            <View style={styles.assistRow}>
              {(['none', 'narrative', 'npc', 'combat', 'rules', 'image', 'scene'] as GMAssistType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.assistButton, assistType === type && styles.assistButtonActive]}
                  onPress={() => setAssistType(type)}
                >
                  <Text style={[styles.assistButtonText, assistType === type && styles.assistButtonTextActive]}>
                    {ASSIST_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Input Mode Switcher */}
        <View style={styles.inputRow}>
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
              <Text style={[styles.modeButtonText, inputMode === 'vision' && styles.modeButtonTextActive]}>拍摄</Text>
            </TouchableOpacity>
          </View>

          {inputMode === 'text' && (
            <View style={styles.textInputRow}>
              <TextInput
                style={styles.gmInput}
                placeholder={
                  messageTarget === 'ai'
                    ? (assistType !== 'none' ? `请求AI生成${ASSIST_LABELS[assistType]}...` : '请求AI助手生成场景/图片...')
                    : '描述场景、NPC对话、规则裁定...'
                }
                placeholderTextColor="#7f8c8d"
                value={gmInput}
                onChangeText={setGmInput}
                multiline
              />
              <TouchableOpacity style={styles.gmSendButton} onPress={handleSendGMInput}>
                <Text style={styles.gmSendButtonText}>发送</Text>
              </TouchableOpacity>
            </View>
          )}

          {inputMode === 'voice' && (
            <TouchableOpacity
              style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
              onPress={handleVoicePress}
            >
              <Text style={styles.voiceButtonText}>
                {isRecording ? '🔴 录音中...点击停止' : '按住说话'}
              </Text>
            </TouchableOpacity>
          )}

          {inputMode === 'vision' && (
            <TouchableOpacity style={styles.visionButton} onPress={handleVisionPress}>
              <Text style={styles.visionButtonText}>拍摄场景</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  // Status Bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusLabel: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  statusValue: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  activeText: {
    color: '#2ecc71',
  },
  connected: {
    color: '#2ecc71',
  },
  disconnected: {
    color: '#e74c3c',
  },
  fearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fearButtonText: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  fearValue: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: 'bold',
    width: 24,
    textAlign: 'center',
  },
  tensionBadge: {
    color: '#ecf0f1',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  iconButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  iconButtonText: {
    color: '#bdc3c7',
    fontSize: 11,
  },
  agentModeUnified: {
    backgroundColor: '#e67e22',
  },
  iconButtonTextActive: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  // Fear detail row
  fearDetailRow: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  fearDetailText: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  // Collapsible Panels
  charPanel: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  charName: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
    width: 60,
  },
  charStat: {
    color: '#bdc3c7',
    fontSize: 11,
  },
  charDetail: {
    color: '#8e44ad',
    fontSize: 11,
    marginLeft: 'auto',
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  dicePanel: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  // Main Area - Two columns
  mainArea: {
    flex: 1,
    flexDirection: 'row',
  },
  chatColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#2a2a4e',
  },
  suggestionColumn: {
    width: '40%',
    maxWidth: 300,
  },
  // Session Start/End
  startButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
  },
  startButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  endButton: {
    backgroundColor: '#c0392b',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 4,
  },
  endButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Scene Description
  sceneBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 8,
  },
  sceneTitle: {
    color: '#8e44ad',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sceneName: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
  },
  sceneDesc: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  // Chat
  chatScroll: {
    flex: 1,
  },
  chatScrollContent: {
    padding: 12,
    paddingBottom: 8,
  },
  chatTitle: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  chatMessage: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 6,
    alignItems: 'flex-start',
  },
  chatSystemMessage: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    padding: 4,
    paddingHorizontal: 8,
  },
  chatAutoMessage: {
    backgroundColor: '#1a3a2e',
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
  chatSystemSender: {
    color: '#f39c12',
    fontSize: 11,
  },
  chatText: {
    color: '#bdc3c7',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  // GM Input Box
  gmInputBox: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  targetRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  targetButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  targetButtonActive: {
    backgroundColor: '#3498db',
  },
  targetButtonActiveAI: {
    backgroundColor: '#8e44ad',
  },
  targetButtonText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  targetButtonTextActive: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  targetButtonTextActiveAI: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  // Assist type row
  assistRow: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },
  assistButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  assistButtonActive: {
    backgroundColor: '#f39c12',
  },
  assistButtonText: {
    color: '#7f8c8d',
    fontSize: 10,
  },
  assistButtonTextActive: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  // Input row
  inputRow: {
    gap: 6,
  },
  modeSwitcher: {
    flexDirection: 'row',
    gap: 4,
  },
  modeButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 10,
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
  gmInput: {
    flex: 1,
    color: '#ecf0f1',
    fontSize: 14,
    maxHeight: 80,
    padding: 8,
    backgroundColor: '#2a2a4e',
    borderRadius: 8,
  },
  gmSendButton: {
    backgroundColor: '#8e44ad',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 8,
  },
  gmSendButtonText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  voiceButton: {
    backgroundColor: '#27ae60',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: '#c0392b',
  },
  voiceButtonText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
    fontSize: 13,
  },
  visionButton: {
    backgroundColor: '#8e44ad',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  visionButtonText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
    fontSize: 13,
  },
  // Sidebar tabs
  sidebarTabs: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  sidebarTab: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  sidebarTabActive: {
    backgroundColor: '#8e44ad',
  },
  sidebarTabText: {
    color: '#7f8c8d',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sidebarTabTextActive: {
    color: '#ecf0f1',
  },
  sidebarContent: {
    flex: 1,
  },
});