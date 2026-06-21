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
import { sendPlayerAction, sendPlayerChoice } from '../hooks/useSocket';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function AdventureScreen() {
  const navigation = useNavigation<NavigationProp>();
  const character = useGameStore((s) => s.character);
  const adventureMessages = useGameStore((s) => s.adventureMessages);
  const aiProcessing = useGameStore((s) => s.aiProcessing);
  const currentLocationName = useGameStore((s) => s.currentLocationName);
  const fearPoints = useGameStore((s) => s.fearPoints);
  const addAdventureMessage = useGameStore((s) => s.addAdventureMessage);
  const isConnected = useGameStore((s) => s.isConnected);

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (adventureMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [adventureMessages.length]);

  const handleSend = () => {
    if (!inputText.trim() || aiProcessing) return;

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
        <View style={styles.resourceItem}>
          <Ionicons name="heart" size={14} color="#e74c3c" />
          <Text style={styles.resourceText}>{character.hp}/{character.maxHp}</Text>
        </View>
        <View style={styles.resourceItem}>
          <Ionicons name="flash" size={14} color="#e67e22" />
          <Text style={styles.resourceText}>{character.stress}/{character.maxStress}</Text>
        </View>
        <View style={styles.resourceItem}>
          <Ionicons name="sunny" size={14} color="#3498db" />
          <Text style={styles.resourceText}>{character.hope}/{character.maxHope}</Text>
        </View>
        <View style={styles.resourceItem}>
          <Ionicons name="shield" size={14} color="#95a5a6" />
          <Text style={styles.resourceText}>{character.armorSlots}/{character.maxArmorSlots}</Text>
        </View>
        <View style={styles.resourceItem}>
          <Ionicons name="skull" size={14} color="#9b59b6" />
          <Text style={styles.resourceText}>{fearPoints}</Text>
        </View>
      </View>
    );
  };

  const renderLocationBar = () => (
    <View style={styles.locationBar}>
      <Ionicons name="location" size={14} color="#2ecc71" />
      <Text style={styles.locationText}>
        {currentLocationName || '余烬村'}
      </Text>
    </View>
  );

  const renderQuickActions = () => (
    <View style={styles.quickActions}>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => navigation.navigate('Combat')}
      >
        <Ionicons name="cut" size={16} color="#e74c3c" />
        <Text style={styles.quickActionText}>战斗</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => navigation.navigate('Rest')}
      >
        <Ionicons name="cafe" size={16} color="#2ecc71" />
        <Text style={styles.quickActionText}>休整</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => {
          // TODO: Open dice roller
        }}
      >
        <Ionicons name="dice-outline" size={16} color="#f39c12" />
        <Text style={styles.quickActionText}>掷骰</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => {
          // TODO: Open inventory
        }}
      >
        <Ionicons name="bag-handle" size={16} color="#9b59b6" />
        <Text style={styles.quickActionText}>物品</Text>
      </TouchableOpacity>
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
              <Ionicons name="book" size={48} color="#34495e" />
              <Text style={styles.emptyTitle}>你的冒险即将开始</Text>
              <Text style={styles.emptySubtitle}>
                在下方输入你的行动，AI管家将引导你的德拉肯海姆之旅
              </Text>
            </View>
          }
        />
        {aiProcessing && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color="#3498db" />
            <Text style={styles.processingText}>AI管家思考中...</Text>
          </View>
        )}
        {renderQuickActions()}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="描述你的行动..."
            placeholderTextColor="#7f8c8d"
            multiline
            maxLength={500}
            editable={!aiProcessing}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || aiProcessing) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || aiProcessing}
          >
            <Ionicons name="send" size={20} color="#ecf0f1" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
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
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a3e',
  },
  locationText: {
    color: '#2ecc71',
    fontSize: 13,
    marginLeft: 4,
  },
  // Resource bar
  resourceBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a3e',
    gap: 12,
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  resourceText: {
    color: '#bdc3c7',
    fontSize: 11,
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
    backgroundColor: '#2980b9',
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    marginBottom: 8,
  },
  playerMessageText: {
    color: '#ecf0f1',
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    color: '#bdc3c7',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  // Narrator message
  narratorMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  narratorMessageText: {
    color: '#ecf0f1',
    fontSize: 15,
    lineHeight: 22,
  },
  // NPC message
  npcMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e1a2e',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  npcName: {
    color: '#9b59b6',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  npcMessageText: {
    color: '#ecf0f1',
    fontSize: 15,
    lineHeight: 22,
  },
  // Choices
  choicesContainer: {
    marginTop: 8,
    gap: 6,
  },
  choiceButton: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#3498db',
  },
  choiceText: {
    color: '#3498db',
    fontSize: 14,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    color: '#bdc3c7',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#7f8c8d',
    fontSize: 14,
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
    color: '#7f8c8d',
    fontSize: 12,
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
    backgroundColor: '#16213e',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  quickActionText: {
    color: '#bdc3c7',
    fontSize: 12,
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
    backgroundColor: '#16213e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2980b9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#2c3e50',
  },
});
