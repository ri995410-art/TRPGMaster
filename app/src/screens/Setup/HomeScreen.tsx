import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

export function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.logo}>TRPGMaster</Text>
        <Text style={styles.tagline}>AI辅助的TRPG游戏主持系统</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionCard, styles.gmCard]}
          onPress={() => navigation.navigate('CreateSession')}
        >
          <Text style={styles.actionIcon}>GM</Text>
          <Text style={styles.actionTitle}>创建会话</Text>
          <Text style={styles.actionDesc}>作为游戏主持人，创建一场新的跑团会话</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, styles.playerCard]}
          onPress={() => navigation.navigate('JoinSession')}
        >
          <Text style={styles.actionIcon}>P</Text>
          <Text style={styles.actionTitle}>加入会话</Text>
          <Text style={styles.actionDesc}>作为玩家，加入GM已创建的跑团会话</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.features}>
        <Text style={styles.featureTitle}>核心功能</Text>
        <View style={styles.featureGrid}>
          {[
            { icon: 'AI', label: '多Agent实时辅助' },
            { icon: 'R', label: '规则自动裁定' },
            { icon: 'V', label: '语音视觉输入' },
            { icon: 'I', label: 'AI插画生成' },
            { icon: 'F', label: '派系关系追踪' },
            { icon: 'N', label: '个人小说生成' },
          ].map((f, i) => (
            <View key={i} style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureIconText}>{f.icon}</Text>
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  logo: {
    color: '#ecf0f1',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  tagline: {
    color: '#8e44ad',
    fontSize: 16,
    marginTop: 4,
  },
  actions: {
    gap: 12,
    marginBottom: 32,
  },
  actionCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  gmCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#8e44ad',
  },
  playerCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#3498db',
  },
  actionIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ecf0f1',
    marginBottom: 4,
  },
  actionTitle: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  actionDesc: {
    color: '#7f8c8d',
    fontSize: 14,
  },
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
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureIconText: {
    color: '#8e44ad',
    fontSize: 14,
    fontWeight: 'bold',
  },
  featureLabel: {
    color: '#bdc3c7',
    fontSize: 11,
    textAlign: 'center',
  },
});