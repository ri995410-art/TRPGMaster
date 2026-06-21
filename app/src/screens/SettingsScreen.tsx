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

// ===== AI Preset Providers =====

const AI_PRESETS = [
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'nex-agi/Nex-N2-Pro' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'ollama', name: 'Ollama本地', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3' },
  { id: 'custom', name: '自定义', baseUrl: '', defaultModel: '' },
];

const TEMPERATURE_PRESETS = [
  { value: 0.4, label: '保守', desc: '稳定一致' },
  { value: 0.8, label: '标准', desc: '平衡创意' },
  { value: 1.2, label: '创意', desc: '丰富想象' },
];

export function SettingsScreen() {
  const character = useGameStore((s) => s.character);
  const isConnected = useGameStore((s) => s.isConnected);
  const serverUrl = useGameStore((s) => s.serverUrl);
  const aiConfig = useGameStore((s) => s.aiConfig);
  const setAiConfig = useGameStore((s) => s.setAiConfig);
  const reset = useGameStore((s) => s.reset);

  const [autoScroll, setAutoScroll] = useState(true);
  const [showDiceAnimation, setShowDiceAnimation] = useState(true);
  const [narrationSpeed, setNarrationSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');

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
    Alert.alert(
      '重置战役',
      '确定要重置当前战役吗？所有进度将丢失。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定重置',
          style: 'destructive',
          onPress: () => {
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

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#e74c3c' }]}>危险操作</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleResetCampaign}>
            <Ionicons name="trash" size={16} color="#e74c3c" />
            <Text style={styles.dangerButtonText}>重置战役</Text>
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
});
