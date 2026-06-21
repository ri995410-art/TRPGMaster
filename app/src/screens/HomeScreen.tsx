import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useGameStore } from '../store/gameStore';
import { connectToServer, disconnect } from '../hooks/useSocket';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

const DEFAULT_SERVER_URL = 'http://localhost:3000';

export function HomeScreen({ navigation }: Props) {
  const character = useGameStore((s) => s.character);
  const campaignId = useGameStore((s) => s.campaignId);
  const isConnected = useGameStore((s) => s.isConnected);

  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [connecting, setConnecting] = useState(false);

  const hasActiveCampaign = !!campaignId;

  const handleConnect = async () => {
    if (isConnected) return;

    setConnecting(true);
    try {
      const socketId = await connectToServer(serverUrl);
      console.log('[HomeScreen] Connected to server, socketId:', socketId);
      Alert.alert('连接成功', '已连接到游戏服务器');
    } catch (err: any) {
      console.error('[HomeScreen] Connection failed:', err);
      Alert.alert('连接失败', `无法连接到服务器: ${err.message || '未知错误'}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    Alert.alert('已断开', '已断开与服务器的连接');
  };

  const handleContinue = () => {
    navigation.navigate('Main');
  };

  const handleNewCampaign = () => {
    navigation.navigate('CharacterCreate', {});
  };

  const handleCharacterRoster = () => {
    navigation.navigate('CharacterRoster');
  };

  const handleMultiplayer = () => {
    navigation.navigate('SessionJoin');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.logo}>TRPGMaster</Text>
          <Text style={styles.tagline}>AI管家 · 匕首之心 · 德拉肯海姆</Text>
          <View style={styles.ruleBadge}>
            <Ionicons name="dice-outline" size={14} color="#f39c12" />
            <Text style={styles.ruleText}>Daggerheart Rules</Text>
          </View>
        </View>

        {/* Server connection */}
        <View style={styles.connectionSection}>
          <Text style={styles.sectionTitle}>服务器连接</Text>
          <View style={styles.serverInputRow}>
            <TextInput
              style={styles.serverInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="服务器地址"
              placeholderTextColor="#7f8c8d"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnected && !connecting}
            />
            {isConnected ? (
              <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                <Ionicons name="unlink" size={18} color="#e74c3c" />
                <Text style={styles.disconnectText}>断开</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.connectButton, connecting && styles.connectButtonDisabled]}
                onPress={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color="#ecf0f1" />
                ) : (
                  <>
                    <Ionicons name="link" size={18} color="#ecf0f1" />
                    <Text style={styles.connectText}>连接</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.connectionStatus}>
            <View style={[styles.statusDot, isConnected ? styles.statusDotConnected : styles.statusDotDisconnected]} />
            <Text style={[styles.statusText, isConnected && styles.statusTextConnected]}>
              {isConnected ? '已连接' : '未连接'}
            </Text>
          </View>
        </View>

        {/* Main actions */}
        <View style={styles.actions}>
          {hasActiveCampaign && (
            <TouchableOpacity
              style={[styles.actionCard, styles.continueCard]}
              onPress={handleContinue}
            >
              <Ionicons name="play-circle" size={32} color="#2ecc71" />
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionTitle}>继续冒险</Text>
                <Text style={styles.actionDesc}>
                  {character ? `${character.name} · Lv.${character.level}` : '返回当前战役'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionCard, styles.newCard]}
            onPress={handleNewCampaign}
          >
            <Ionicons name="add-circle" size={32} color="#9b59b6" />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>创建角色</Text>
              <Text style={styles.actionDesc}>
                创建新角色，开始德拉肯海姆的冒险之旅
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.rosterCard]}
            onPress={handleCharacterRoster}
          >
            <Ionicons name="people" size={32} color="#3498db" />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>角色列表</Text>
              <Text style={styles.actionDesc}>
                管理你的角色，切换活跃角色
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.multiCard]}
            onPress={handleMultiplayer}
          >
            <Ionicons name="wifi" size={32} color="#e67e22" />
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>多人游戏</Text>
              <Text style={styles.actionDesc}>
                创建或加入房间，与朋友一起冒险
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
          </TouchableOpacity>
        </View>

        {/* Campaign info */}
        <View style={styles.campaignSection}>
          <Text style={styles.campaignTitle}>德拉肯海姆战役</Text>
          <Text style={styles.campaignDesc}>
            五百年前，一颗陨石击中了德拉肯海姆，翠晶从坑洞中蔓延开来。迷雾笼罩了废墟，变异生物在阴影中游荡。五个派系在这座死城中争夺权力和翠晶的秘密。你将成为一名冒险者，踏入这片危险的领域——
          </Text>

          <View style={styles.campaignDetails}>
            <View style={styles.detailItem}>
              <Ionicons name="people" size={16} color="#9b59b6" />
              <Text style={styles.detailText}>5个派系</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="map" size={16} color="#3498db" />
              <Text style={styles.detailText}>10+探索地点</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="skull" size={16} color="#e74c3c" />
              <Text style={styles.detailText}>污染与变异</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="diamond" size={16} color="#2ecc71" />
              <Text style={styles.detailText}>翠晶收集</Text>
            </View>
          </View>
        </View>

        {/* Features */}
        <View style={styles.features}>
          <Text style={styles.featureTitle}>AI管家功能</Text>
          <View style={styles.featureGrid}>
            {[
              { icon: 'chatbubbles' as const, label: '沉浸叙事', color: '#3498db' },
              { icon: 'document-text' as const, label: '规则裁判', color: '#e74c3c' },
              { icon: 'person' as const, label: 'NPC扮演', color: '#9b59b6' },
              { icon: 'cut' as const, label: '战斗管理', color: '#e67e22' },
              { icon: 'people' as const, label: '派系政治', color: '#2ecc71' },
              { icon: 'compass' as const, label: '战役推进', color: '#f39c12' },
            ].map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: `${f.color}22` }]}>
                  <Ionicons name={f.icon} size={18} color={f.color} />
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  // Hero
  hero: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  logo: {
    color: '#ecf0f1',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  tagline: {
    color: '#9b59b6',
    fontSize: 14,
    marginTop: 4,
  },
  ruleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f39c1222',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  ruleText: {
    color: '#f39c12',
    fontSize: 11,
  },
  // Connection section
  connectionSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  sectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  serverInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  serverInput: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2980b9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e74c3c22',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e74c3c44',
  },
  disconnectText: {
    color: '#e74c3c',
    fontSize: 14,
    fontWeight: 'bold',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotConnected: {
    backgroundColor: '#2ecc71',
  },
  statusDotDisconnected: {
    backgroundColor: '#e74c3c',
  },
  statusText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  statusTextConnected: {
    color: '#2ecc71',
  },
  // Actions
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 16,
  },
  continueCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#2ecc71',
  },
  newCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#9b59b6',
  },
  rosterCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#3498db',
  },
  multiCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#e67e22',
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  actionDesc: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  // Campaign section
  campaignSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  campaignTitle: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  campaignDesc: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  campaignDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  // Features
  features: {
    marginTop: 8,
  },
  featureTitle: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featureItem: {
    alignItems: 'center',
    width: '30%',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureLabel: {
    color: '#bdc3c7',
    fontSize: 11,
    textAlign: 'center',
  },
});
