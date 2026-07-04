import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useGameStore } from '../store/gameStore';
import { sendCampaignReset } from '../hooks/useSocket';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

// ===== AI Preset Providers =====

const AI_PRESETS = [
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V4-Flash', signupHint: '前往 siliconflow.cn 注册获取' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', signupHint: '前往 platform.deepseek.com 注册获取' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', signupHint: '前往 platform.openai.com 注册获取' },
  { id: 'ollama', name: 'Ollama本地', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', signupHint: '本地运行，无需密钥' },
  { id: 'custom', name: '自定义', baseUrl: '', defaultModel: '', signupHint: '' },
];

const TEMPERATURE_PRESETS = [
  { value: 0.4, label: '保守', desc: '稳定一致' },
  { value: 0.8, label: '标准', desc: '平衡创意' },
  { value: 1.2, label: '创意', desc: '丰富想象' },
];

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const character = useGameStore((s) => s.character);
  const isConnected = useGameStore((s) => s.isConnected);
  const isHost = useGameStore((s) => s.isHost);
  const serverUrl = useGameStore((s) => s.serverUrl);
  const aiConfig = useGameStore((s) => s.aiConfig);
  const setAiConfig = useGameStore((s) => s.setAiConfig);
  const reset = useGameStore((s) => s.reset);
  const autoScroll = useGameStore((s) => s.autoScroll);
  const setAutoScroll = useGameStore((s) => s.setAutoScroll);
  const showDiceAnimation = useGameStore((s) => s.showDiceAnimation);
  const setShowDiceAnimation = useGameStore((s) => s.setShowDiceAnimation);
  const narrationSpeed = useGameStore((s) => s.narrationSpeed);
  const setNarrationSpeed = useGameStore((s) => s.setNarrationSpeed);

  // AI Config local state
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [narratorModel, setNarratorModel] = useState('');
  const [temperature, setTemperature] = useState(0.8);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Wizard state
  const needsWizard = !aiConfig || !aiConfig.apiKey;
  const [wizardStep, setWizardStep] = useState(needsWizard ? 1 : 0);
  const [wizardPreset, setWizardPreset] = useState<string | null>(null);
  const [wizardApiKey, setWizardApiKey] = useState('');
  const [wizardShowApiKey, setWizardShowApiKey] = useState(false);
  const [wizardBaseUrl, setWizardBaseUrl] = useState('');
  const [wizardModel, setWizardModel] = useState('');
  const [wizardTesting, setWizardTesting] = useState(false);
  const [wizardTestResult, setWizardTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load AI config from store into local state
  useEffect(() => {
    if (aiConfig) {
      setApiKey(aiConfig.apiKey || '');
      setBaseUrl(aiConfig.baseUrl || '');
      setDefaultModel(aiConfig.defaultModel || '');
      setNarratorModel(aiConfig.narratorModel || '');
      setTemperature(aiConfig.temperature ?? 0.8);
      setMaxTokens(aiConfig.maxTokens ?? 4096);
    }
  }, [aiConfig]);

  const handlePresetSelect = (preset: typeof AI_PRESETS[0]) => {
    setSelectedPreset(preset.id);
    if (preset.id !== 'custom') {
      setBaseUrl(preset.baseUrl);
      setDefaultModel(preset.defaultModel);
    } else {
      setBaseUrl('');
      setDefaultModel('');
    }
  };

  const handleWizardPresetSelect = (preset: typeof AI_PRESETS[0]) => {
    setWizardPreset(preset.id);
    if (preset.id !== 'custom') {
      setWizardBaseUrl(preset.baseUrl);
      setWizardModel(preset.defaultModel);
    } else {
      setWizardBaseUrl('');
      setWizardModel('');
    }
    setWizardStep(2);
  };

  const handleWizardTestAndSave = async () => {
    if (!serverUrl) {
      Alert.alert('未连接', '请先返回首页连接服务器');
      return;
    }

    setWizardTesting(true);
    setWizardTestResult(null);
    try {
      const saveRes = await fetch(`${serverUrl}/api/ai/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: wizardApiKey,
          baseUrl: wizardBaseUrl,
          defaultModel: wizardModel,
          temperature: 0.8,
          maxTokens: 4096,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveData.success) {
        setWizardTestResult({ success: false, message: saveData.errors?.join('\n') || '保存失败' });
        setWizardTesting(false);
        return;
      }

      const testRes = await fetch(`${serverUrl}/api/ai/test`, { method: 'POST' });
      const testData = await testRes.json();
      if (testData.success) {
        setAiConfig({
          apiKey: saveData.config.apiKey || '',
          baseUrl: saveData.config.baseUrl || '',
          defaultModel: saveData.config.defaultModel || '',
          narratorModel: '',
          temperature: 0.8,
          maxTokens: 4096,
          aiConnected: true,
        });
        setWizardTestResult({
          success: true,
          message: `连接成功 · 模型: ${testData.model} · 响应: ${testData.responseTime}ms`,
        });
      } else {
        setAiConfig({
          apiKey: saveData.config.apiKey || '',
          baseUrl: saveData.config.baseUrl || '',
          defaultModel: saveData.config.defaultModel || '',
          narratorModel: '',
          temperature: 0.8,
          maxTokens: 4096,
          aiConnected: false,
        });
        setWizardTestResult({
          success: false,
          message: `保存成功但AI连接失败: ${testData.error || '未知错误'}`,
        });
      }
    } catch (err: any) {
      setWizardTestResult({ success: false, message: `请求失败: ${err.message}` });
    } finally {
      setWizardTesting(false);
    }
  };

  const handleSave = async () => {
    if (!serverUrl) {
      Alert.alert('未连接', '请先连接服务器');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${serverUrl}/api/ai/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
          defaultModel: defaultModel || undefined,
          narratorModel,  // Always send — empty string means "use defaultModel"
          temperature,
          maxTokens,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Update local store
        setAiConfig({
          apiKey: data.config.apiKey || '',
          baseUrl: data.config.baseUrl || '',
          defaultModel: data.config.defaultModel || '',
          narratorModel: data.config.narratorModel || '',
          temperature: data.config.temperature ?? 0.8,
          maxTokens: data.config.maxTokens ?? 4096,
          aiConnected: data.config.aiConnected ?? false,
        });
        // Update local state with masked key from server
        setApiKey(data.config.apiKey || '');
        Alert.alert('保存成功', 'AI配置已更新');
      } else {
        Alert.alert('保存失败', data.errors?.join('\n') || '未知错误');
      }
    } catch (err: any) {
      Alert.alert('保存失败', err.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!serverUrl) {
      Alert.alert('未连接', '请先连接服务器');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${serverUrl}/api/ai/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: `连接成功 · 模型: ${data.model} · 响应: ${data.responseTime}ms · Tokens: ${data.tokenUsage}`,
        });
      } else {
        setTestResult({
          success: false,
          message: `连接失败: ${data.error || '未知错误'}`,
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `请求失败: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleResetCampaign = () => {
    if (!isHost) {
      Alert.alert('权限不足', '只有主持人(GM)才能重置战役');
      return;
    }
    Alert.alert(
      '重置战役',
      '确定要重置当前战役吗？所有进度将丢失。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定重置',
          style: 'destructive',
          onPress: () => {
            sendCampaignReset();
            reset();
          },
        },
      ],
    );
  };

  // Auto-detect preset based on baseUrl
  const detectPreset = () => {
    for (const preset of AI_PRESETS) {
      if (preset.id !== 'custom' && baseUrl.includes(preset.baseUrl.replace('https://', '').replace('http://', '').split('/')[0])) {
        return preset.id;
      }
    }
    return 'custom';
  };

  const selectedWizardPreset = AI_PRESETS.find(p => p.id === wizardPreset);

  if (wizardStep > 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.wizardCard}>
            <View style={styles.wizardHeader}>
              <Ionicons name="sparkles" size={28} color="#9b59b6" />
              <Text style={styles.wizardTitle}>配置AI管家</Text>
            </View>
            <Text style={styles.wizardSubtitle}>AI管家将为你讲述故事、扮演NPC、管理战斗</Text>

            {/* Step indicators */}
            <View style={styles.wizardStepIndicators}>
              {[1, 2, 3, 4].map((step) => (
                <View key={step} style={styles.wizardStepDotRow}>
                  <View style={[styles.wizardStepDot, wizardStep >= step && styles.wizardStepDotActive]}>
                    <Text style={[styles.wizardStepDotText, wizardStep >= step && styles.wizardStepDotTextActive]}>{step}</Text>
                  </View>
                  {step < 4 && <View style={[styles.wizardStepLine, wizardStep > step && styles.wizardStepLineActive]} />}
                </View>
              ))}
            </View>
            <View style={styles.wizardStepLabels}>
              <Text style={[styles.wizardStepLabel, wizardStep >= 1 && styles.wizardStepLabelActive]}>选择服务商</Text>
              <Text style={[styles.wizardStepLabel, wizardStep >= 2 && styles.wizardStepLabelActive]}>输入密钥</Text>
              <Text style={[styles.wizardStepLabel, wizardStep >= 3 && styles.wizardStepLabelActive]}>选择模型</Text>
              <Text style={[styles.wizardStepLabel, wizardStep >= 4 && styles.wizardStepLabelActive]}>测试连接</Text>
            </View>

            {/* Step 1: Choose provider */}
            {wizardStep === 1 && (
              <View style={styles.wizardContent}>
                <Text style={styles.wizardFieldLabel}>选择AI服务商</Text>
                {AI_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    style={[styles.wizardProviderCard, wizardPreset === preset.id && styles.wizardProviderCardActive]}
                    onPress={() => handleWizardPresetSelect(preset)}
                  >
                    <View style={styles.wizardProviderInfo}>
                      <Text style={[styles.wizardProviderName, wizardPreset === preset.id && styles.wizardProviderNameActive]}>{preset.name}</Text>
                      {preset.id !== 'custom' && (
                        <Text style={styles.wizardProviderUrl}>{preset.baseUrl}</Text>
                      )}
                    </View>
                    <Ionicons name={wizardPreset === preset.id ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={wizardPreset === preset.id ? '#9b59b6' : '#2c3e50'} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Step 2: Enter API Key */}
            {wizardStep === 2 && (
              <View style={styles.wizardContent}>
                <Text style={styles.wizardFieldLabel}>API 密钥</Text>
                {selectedWizardPreset?.signupHint ? (
                  <Text style={styles.wizardHint}>{selectedWizardPreset.signupHint}</Text>
                ) : null}
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.textInput}
                    value={wizardApiKey}
                    onChangeText={setWizardApiKey}
                    placeholder="输入API Key"
                    placeholderTextColor="#7f8c8d"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!wizardShowApiKey}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setWizardShowApiKey(!wizardShowApiKey)}>
                    <Ionicons name={wizardShowApiKey ? 'eye-off' : 'eye'} size={18} color="#7f8c8d" />
                  </TouchableOpacity>
                </View>
                <View style={styles.wizardNavRow}>
                  <TouchableOpacity style={styles.wizardBackButton} onPress={() => setWizardStep(1)}>
                    <Ionicons name="arrow-back" size={16} color="#bdc3c7" />
                    <Text style={styles.wizardBackText}>上一步</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.wizardNextButton, !wizardApiKey && styles.wizardNextButtonDisabled]}
                    onPress={() => wizardApiKey && setWizardStep(3)}
                    disabled={!wizardApiKey}
                  >
                    <Text style={styles.wizardNextText}>下一步</Text>
                    <Ionicons name="arrow-forward" size={16} color="#ecf0f1" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 3: Choose model */}
            {wizardStep === 3 && (
              <View style={styles.wizardContent}>
                <Text style={styles.wizardFieldLabel}>模型</Text>
                <TextInput
                  style={styles.textInputFull}
                  value={wizardModel}
                  onChangeText={setWizardModel}
                  placeholder="模型名称"
                  placeholderTextColor="#7f8c8d"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.wizardFieldLabel}>API 地址</Text>
                <TextInput
                  style={styles.textInputFull}
                  value={wizardBaseUrl}
                  onChangeText={setWizardBaseUrl}
                  placeholder="https://api.siliconflow.cn/v1"
                  placeholderTextColor="#7f8c8d"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <View style={styles.wizardNavRow}>
                  <TouchableOpacity style={styles.wizardBackButton} onPress={() => setWizardStep(2)}>
                    <Ionicons name="arrow-back" size={16} color="#bdc3c7" />
                    <Text style={styles.wizardBackText}>上一步</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.wizardNextButton, (!wizardModel || !wizardBaseUrl) && styles.wizardNextButtonDisabled]}
                    onPress={() => wizardModel && wizardBaseUrl && setWizardStep(4)}
                    disabled={!wizardModel || !wizardBaseUrl}
                  >
                    <Text style={styles.wizardNextText}>下一步</Text>
                    <Ionicons name="arrow-forward" size={16} color="#ecf0f1" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 4: Test connection */}
            {wizardStep === 4 && (
              <View style={styles.wizardContent}>
                <View style={styles.wizardSummary}>
                  <View style={styles.wizardSummaryRow}>
                    <Text style={styles.wizardSummaryLabel}>服务商</Text>
                    <Text style={styles.wizardSummaryValue}>{selectedWizardPreset?.name || '自定义'}</Text>
                  </View>
                  <View style={styles.wizardSummaryRow}>
                    <Text style={styles.wizardSummaryLabel}>API地址</Text>
                    <Text style={styles.wizardSummaryValue} numberOfLines={1}>{wizardBaseUrl}</Text>
                  </View>
                  <View style={styles.wizardSummaryRow}>
                    <Text style={styles.wizardSummaryLabel}>模型</Text>
                    <Text style={styles.wizardSummaryValue}>{wizardModel}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.wizardTestButton, wizardTesting && styles.actionButtonDisabled]}
                  onPress={handleWizardTestAndSave}
                  disabled={wizardTesting}
                >
                  {wizardTesting ? (
                    <ActivityIndicator size="small" color="#ecf0f1" />
                  ) : (
                    <>
                      <Ionicons name="pulse" size={18} color="#ecf0f1" />
                      <Text style={styles.wizardTestButtonText}>测试并保存</Text>
                    </>
                  )}
                </TouchableOpacity>
                {wizardTestResult && (
                  <View style={[styles.testResult, wizardTestResult.success ? styles.testSuccess : styles.testFail]}>
                    <Ionicons
                      name={wizardTestResult.success ? 'checkmark-circle' : 'close-circle'}
                      size={16}
                      color={wizardTestResult.success ? '#2ecc71' : '#e74c3c'}
                    />
                    <Text style={[styles.testResultText, { color: wizardTestResult.success ? '#2ecc71' : '#e74c3c' }]}>
                      {wizardTestResult.message}
                    </Text>
                  </View>
                )}
                {wizardTestResult?.success && (
                  <TouchableOpacity style={styles.wizardFinishButton} onPress={() => setWizardStep(0)}>
                    <Text style={styles.wizardFinishText}>完成，开始使用</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.wizardNavRow}>
                  <TouchableOpacity style={styles.wizardBackButton} onPress={() => setWizardStep(3)}>
                    <Ionicons name="arrow-back" size={16} color="#bdc3c7" />
                    <Text style={styles.wizardBackText}>上一步</Text>
                  </TouchableOpacity>
                  <View />
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Game Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>游戏状态</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>服务器连接</Text>
            <View style={[styles.statusBadge, isConnected ? styles.connected : styles.disconnected]}>
              <Text style={styles.statusText}>{isConnected ? '已连接' : '未连接'}</Text>
            </View>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>当前角色</Text>
            <Text style={styles.settingValue}>{character?.name || '无'}</Text>
          </View>
        </View>

        {/* Display Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>显示设置</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>自动滚动对话</Text>
            <Switch
              value={autoScroll}
              onValueChange={setAutoScroll}
              trackColor={{ false: '#2c3e50', true: '#2980b9' }}
              thumbColor="#ecf0f1"
            />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>掷骰动画</Text>
            <Switch
              value={showDiceAnimation}
              onValueChange={setShowDiceAnimation}
              trackColor={{ false: '#2c3e50', true: '#2980b9' }}
              thumbColor="#ecf0f1"
            />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>叙事速度</Text>
            <View style={styles.speedButtons}>
              {(['slow', 'normal', 'fast'] as const).map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[styles.speedButton, narrationSpeed === speed && styles.speedButtonActive]}
                  onPress={() => setNarrationSpeed(speed)}
                >
                  <Text style={[styles.speedButtonText, narrationSpeed === speed && styles.speedButtonTextActive]}>
                    {speed === 'slow' ? '慢' : speed === 'normal' ? '中' : '快'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ===== AI Configuration ===== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>AI管家设置</Text>
            <View style={[styles.aiStatusDot, aiConfig?.aiConnected ? styles.aiConnected : styles.aiDisconnected]} />
          </View>

          {/* Preset Providers */}
          <Text style={styles.fieldLabel}>预设服务商</Text>
          <View style={styles.presetRow}>
            {AI_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetChip,
                  (selectedPreset || detectPreset()) === preset.id && styles.presetChipActive,
                ]}
                onPress={() => handlePresetSelect(preset)}
              >
                <Text style={[
                  styles.presetChipText,
                  (selectedPreset || detectPreset()) === preset.id && styles.presetChipTextActive,
                ]}>
                  {preset.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* API Key */}
          <Text style={styles.fieldLabel}>API 密钥</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="输入API Key"
              placeholderTextColor="#7f8c8d"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showApiKey}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowApiKey(!showApiKey)}>
              <Ionicons name={showApiKey ? 'eye-off' : 'eye'} size={18} color="#7f8c8d" />
            </TouchableOpacity>
          </View>

          {/* Base URL */}
          <Text style={styles.fieldLabel}>API 地址</Text>
          <TextInput
            style={styles.textInputFull}
            value={baseUrl}
            onChangeText={(text) => { setBaseUrl(text); setSelectedPreset(null); }}
            placeholder="https://api.siliconflow.cn/v1"
            placeholderTextColor="#7f8c8d"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {/* Default Model */}
          <Text style={styles.fieldLabel}>默认模型</Text>
          <TextInput
            style={styles.textInputFull}
            value={defaultModel}
            onChangeText={(text) => { setDefaultModel(text); setSelectedPreset(null); }}
            placeholder="nex-agi/Nex-N2-Pro"
            placeholderTextColor="#7f8c8d"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Narrator Model */}
          <Text style={styles.fieldLabel}>叙事模型（可选，留空则用默认）</Text>
          <TextInput
            style={styles.textInputFull}
            value={narratorModel}
            onChangeText={setNarratorModel}
            placeholder="与默认模型相同"
            placeholderTextColor="#7f8c8d"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Temperature */}
          <Text style={styles.fieldLabel}>温度（创意程度）</Text>
          <View style={styles.temperatureRow}>
            {TEMPERATURE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.value}
                style={[
                  styles.tempButton,
                  temperature === preset.value && styles.tempButtonActive,
                ]}
                onPress={() => setTemperature(preset.value)}
              >
                <Text style={[
                  styles.tempButtonLabel,
                  temperature === preset.value && styles.tempButtonLabelActive,
                ]}>
                  {preset.label}
                </Text>
                <Text style={[
                  styles.tempButtonDesc,
                  temperature === preset.value && styles.tempButtonDescActive,
                ]}>
                  {preset.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Max Completion Tokens (NOT context window — this is max tokens the AI can generate per response) */}
          <View style={styles.tokenRow}>
            <Text style={styles.fieldLabel}>最大回复Token</Text>
            <Text style={styles.tokenValue}>{maxTokens >= 1048576 ? `${maxTokens / 1048576}M` : maxTokens >= 1024 ? `${maxTokens / 1024}K` : maxTokens}</Text>
          </View>
          <View style={styles.tokenSliderRow}>
            {[512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576].map((val) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.tokenChip,
                  maxTokens === val && styles.tokenChipActive,
                ]}
                onPress={() => setMaxTokens(val)}
              >
                <Text style={[
                  styles.tokenChipText,
                  maxTokens === val && styles.tokenChipTextActive,
                ]}>
                  {val >= 1048576 ? `${val / 1048576}M` : val >= 1024 ? `${val / 1024}K` : val}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Test & Save */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.testButton, testing && styles.actionButtonDisabled]}
              onPress={handleTest}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#ecf0f1" />
              ) : (
                <>
                  <Ionicons name="pulse" size={16} color="#ecf0f1" />
                  <Text style={styles.testButtonText}>测试</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.actionButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ecf0f1" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#ecf0f1" />
                  <Text style={styles.saveButtonText}>保存</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Test Result */}
          {testResult && (
            <View style={[styles.testResult, testResult.success ? styles.testSuccess : styles.testFail]}>
              <Ionicons
                name={testResult.success ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={testResult.success ? '#2ecc71' : '#e74c3c'}
              />
              <Text style={[styles.testResultText, { color: testResult.success ? '#2ecc71' : '#e74c3c' }]}>
                {testResult.message}
              </Text>
            </View>
          )}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>版本</Text>
            <Text style={styles.settingValue}>2.0.0</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>规则系统</Text>
            <Text style={styles.settingValue}>匕首之心 (Daggerheart)</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>战役设定</Text>
            <Text style={styles.settingValue}>德拉肯海姆 (Drakkenheim)</Text>
          </View>
        </View>

        {/* Tutorial */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>新手教程</Text>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.navigate('Tutorial')}
          >
            <Ionicons name="school" size={20} color="#2ecc71" />
            <Text style={styles.menuButtonText}>规则教程</Text>
            <Ionicons name="chevron-forward" size={16} color="#7f8c8d" />
          </TouchableOpacity>
        </View>

        {/* GM Tools */}
        {isHost && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>GM工具</Text>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => navigation.navigate('GMPanel')}
            >
              <Ionicons name="construct" size={20} color="#3498db" />
              <Text style={styles.menuButtonText}>GM控制面板</Text>
              <Ionicons name="chevron-forward" size={16} color="#7f8c8d" />
            </TouchableOpacity>
          </View>
        )}

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#e74c3c' }]}>危险操作</Text>
          <TouchableOpacity
            style={[styles.dangerButton, !isHost && styles.dangerButtonDisabled]}
            onPress={handleResetCampaign}
            disabled={!isHost}
          >
            <Ionicons name="trash" size={16} color={isHost ? '#e74c3c' : '#555'} />
            <Text style={[styles.dangerButtonText, !isHost && styles.dangerButtonTextDisabled]}>
              重置战役{!isHost ? '（仅主持人）' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Section
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
  },
  // Setting row
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#16213e',
  },
  settingLabel: {
    color: '#ecf0f1',
    fontSize: 14,
  },
  settingValue: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  // Status badge
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  connected: {
    backgroundColor: '#2ecc7133',
  },
  disconnected: {
    backgroundColor: '#e74c3c33',
  },
  statusText: {
    fontSize: 12,
  },
  // AI status dot
  aiStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  aiConnected: {
    backgroundColor: '#2ecc71',
  },
  aiDisconnected: {
    backgroundColor: '#e74c3c',
  },
  // Speed buttons
  speedButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  speedButton: {
    backgroundColor: '#2c3e50',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  speedButtonActive: {
    backgroundColor: '#2980b9',
  },
  speedButtonText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  speedButtonTextActive: {
    color: '#ecf0f1',
  },
  // Field label
  fieldLabel: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  // Text inputs
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
    paddingRight: 4,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
  },
  eyeButton: {
    padding: 8,
  },
  textInputFull: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  // Preset chips
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  presetChipActive: {
    backgroundColor: '#9b59b622',
    borderColor: '#9b59b6',
  },
  presetChipText: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  presetChipTextActive: {
    color: '#9b59b6',
    fontWeight: 'bold',
  },
  // Temperature
  temperatureRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tempButton: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  tempButtonActive: {
    backgroundColor: '#e67e2222',
    borderColor: '#e67e22',
  },
  tempButtonLabel: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tempButtonLabelActive: {
    color: '#e67e22',
  },
  tempButtonDesc: {
    color: '#7f8c8d',
    fontSize: 10,
    marginTop: 2,
  },
  tempButtonDescActive: {
    color: '#e67e22',
  },
  // Token
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tokenValue: {
    color: '#3498db',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tokenSliderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tokenChip: {
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  tokenChipActive: {
    backgroundColor: '#3498db22',
    borderColor: '#3498db',
  },
  tokenChipText: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  tokenChipTextActive: {
    color: '#3498db',
    fontWeight: 'bold',
  },
  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  testButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2c3e50',
    borderRadius: 8,
    paddingVertical: 10,
  },
  testButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#9b59b6',
    borderRadius: 8,
    paddingVertical: 10,
  },
  saveButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  // Test result
  testResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  testSuccess: {
    backgroundColor: '#2ecc7111',
  },
  testFail: {
    backgroundColor: '#e74c3c11',
  },
  testResultText: {
    fontSize: 12,
    flex: 1,
  },
  // Danger zone
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a3e',
    borderRadius: 8,
  },
  menuButtonText: {
    flex: 1,
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: '500',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  dangerButtonText: {
    color: '#e74c3c',
    fontSize: 14,
  },
  dangerButtonDisabled: {
    opacity: 0.4,
  },
  dangerButtonTextDisabled: {
    color: '#555',
  },
  // Wizard styles
  wizardCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  wizardTitle: {
    color: '#ecf0f1',
    fontSize: 22,
    fontWeight: 'bold',
  },
  wizardSubtitle: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 16,
  },
  wizardStepIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  wizardStepDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wizardStepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wizardStepDotActive: {
    backgroundColor: '#9b59b6',
  },
  wizardStepDotText: {
    color: '#7f8c8d',
    fontSize: 12,
    fontWeight: 'bold',
  },
  wizardStepDotTextActive: {
    color: '#ecf0f1',
  },
  wizardStepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#2c3e50',
  },
  wizardStepLineActive: {
    backgroundColor: '#9b59b6',
  },
  wizardStepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  wizardStepLabel: {
    color: '#7f8c8d',
    fontSize: 10,
    flex: 1,
    textAlign: 'center',
  },
  wizardStepLabelActive: {
    color: '#9b59b6',
  },
  wizardContent: {
    marginTop: 8,
  },
  wizardFieldLabel: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  wizardHint: {
    color: '#9b59b6',
    fontSize: 12,
    marginBottom: 8,
  },
  wizardProviderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  wizardProviderCardActive: {
    borderColor: '#9b59b6',
    backgroundColor: '#9b59b611',
  },
  wizardProviderInfo: {
    flex: 1,
  },
  wizardProviderName: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
  },
  wizardProviderNameActive: {
    color: '#9b59b6',
  },
  wizardProviderUrl: {
    color: '#7f8c8d',
    fontSize: 11,
    marginTop: 2,
  },
  wizardNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  wizardBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  wizardBackText: {
    color: '#bdc3c7',
    fontSize: 14,
  },
  wizardNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9b59b6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  wizardNextButtonDisabled: {
    opacity: 0.4,
  },
  wizardNextText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  wizardSummary: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  wizardSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  wizardSummaryLabel: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  wizardSummaryValue: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  wizardTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9b59b6',
    borderRadius: 8,
    paddingVertical: 12,
  },
  wizardTestButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  wizardFinishButton: {
    backgroundColor: '#2ecc71',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  wizardFinishText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
