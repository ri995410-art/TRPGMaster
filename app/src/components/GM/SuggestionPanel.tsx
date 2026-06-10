import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import type { Suggestion, SuggestionOption, RiskLevel, AgentType } from '@trpgmaster/shared';
import { useGameStore } from '../../store/gameStore';
import { sendSuggestionAdopt, sendSuggestionDismiss } from '../../hooks/useSocket';

// L2 auto-send timeout (matches server-side)
const L2_AUTO_SEND_TIMEOUT = 10_000;

function getRiskColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'L0': return '#3498db'; // Blue - auto, informational
    case 'L1': return '#27ae60'; // Green - auto + undo
    case 'L2': return '#f39c12'; // Orange - options + timeout
    case 'L3': return '#e74c3c'; // Red - needs confirmation
    case 'L4': return '#95a5a6'; // Gray - GM only, background
    default: return '#95a5a6';
  }
}

function getRiskLabel(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'L0': return '自动';
    case 'L1': return '自动·可撤';
    case 'L2': return '选择';
    case 'L3': return '待确认';
    case 'L4': return '后台';
    default: return '';
  }
}

// Single suggestion card
function SuggestionCard({ suggestion, onAdopt, onDismiss, onEdit }: {
  suggestion: Suggestion;
  onAdopt: (id: string, optionIndex: number) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string, optionIndex: number, content: string) => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // L2 countdown: only shows the timer UI, auto-send is handled by the server
  useEffect(() => {
    if (suggestion.riskLevel !== 'L2' || !suggestion.autoSendAt) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, suggestion.autoSendAt! - Date.now());
      const seconds = Math.ceil(remaining / 1000);
      setCountdown(seconds);

      if (remaining <= 0) {
        // Server handles the auto-send broadcast, just dismiss locally
        onDismiss(suggestion.id);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [suggestion.id, suggestion.riskLevel, suggestion.autoSendAt, onDismiss]);

  const riskColor = getRiskColor(suggestion.riskLevel);

  const handleAdopt = (optionIndex: number) => {
    onAdopt(suggestion.id, optionIndex);
  };

  const handleEdit = (optionIndex: number) => {
    onEdit(suggestion.id, optionIndex, suggestion.options[optionIndex].content);
  };

  // L0: Auto-sent, just show info card
  if (suggestion.riskLevel === 'L0') {
    return (
      <View style={[styles.card, { borderLeftColor: riskColor }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.typeLabel, { color: riskColor }]}>{suggestion.typeLabel}</Text>
          <Text style={styles.riskBadge}>{getRiskLabel(suggestion.riskLevel)}</Text>
        </View>
        <Text style={styles.autoText}>
          {suggestion.options[0]?.content || '已自动发送'}
        </Text>
      </View>
    );
  }

  // L1: Auto-sent + undo
  if (suggestion.riskLevel === 'L1') {
    return (
      <View style={[styles.card, { borderLeftColor: riskColor }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.typeLabel, { color: riskColor }]}>{suggestion.typeLabel}</Text>
          <Text style={styles.riskBadge}>{getRiskLabel(suggestion.riskLevel)}</Text>
        </View>
        <Text style={styles.autoText}>
          {suggestion.options[0]?.content || '已自动发送'}
        </Text>
        <TouchableOpacity style={styles.undoButton} onPress={() => onDismiss(suggestion.id)}>
          <Text style={styles.undoButtonText}>撤销</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // L2: Options + countdown auto-send
  if (suggestion.riskLevel === 'L2') {
    return (
      <View style={[styles.card, { borderLeftColor: riskColor }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.typeLabel, { color: riskColor }]}>{suggestion.typeLabel}</Text>
          <View style={styles.headerRight}>
            {countdown !== null && countdown > 0 && (
              <Text style={styles.countdownText}>{countdown}s后自动发送</Text>
            )}
            <Text style={styles.riskBadge}>{getRiskLabel(suggestion.riskLevel)}</Text>
          </View>
        </View>

        {/* GM-only text */}
        {suggestion.gmOnly && (
          <View style={styles.gmOnlyBox}>
            <Text style={styles.gmOnlyLabel}>仅GM可见</Text>
            <Text style={styles.gmOnlyText}>{suggestion.gmOnly}</Text>
          </View>
        )}

        {/* Options */}
        {suggestion.options.map((option, index) => (
          <View key={index} style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionRadio,
                selectedIndex === index && styles.optionRadioSelected,
              ]}
              onPress={() => setSelectedIndex(index)}
            >
              <Text style={styles.optionRadioText}>
                {selectedIndex === index ? '●' : '○'}
              </Text>
            </TouchableOpacity>
            <View style={styles.optionContent}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionText}>{option.content}</Text>
            </View>
          </View>
        ))}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.adoptButton} onPress={() => handleAdopt(selectedIndex)}>
            <Text style={styles.adoptButtonText}>采纳发布</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(selectedIndex)}>
            <Text style={styles.editButtonText}>采纳修改</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={() => onDismiss(suggestion.id)}>
            <Text style={styles.dismissButtonText}>忽略</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // L3: Draft + confirmation
  if (suggestion.riskLevel === 'L3') {
    return (
      <View style={[styles.card, { borderLeftColor: riskColor }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.typeLabel, { color: riskColor }]}>{suggestion.typeLabel}</Text>
          <Text style={styles.riskBadge}>{getRiskLabel(suggestion.riskLevel)}</Text>
        </View>

        {suggestion.options.map((option, index) => (
          <View key={index} style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionRadio,
                selectedIndex === index && styles.optionRadioSelected,
              ]}
              onPress={() => setSelectedIndex(index)}
            >
              <Text style={styles.optionRadioText}>
                {selectedIndex === index ? '●' : '○'}
              </Text>
            </TouchableOpacity>
            <View style={styles.optionContent}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionText}>{option.content}</Text>
            </View>
          </View>
        ))}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.adoptButton} onPress={() => handleAdopt(selectedIndex)}>
            <Text style={styles.adoptButtonText}>确认发布</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(selectedIndex)}>
            <Text style={styles.editButtonText}>编辑</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={() => onDismiss(suggestion.id)}>
            <Text style={styles.dismissButtonText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // L4: GM only background - minimal display
  return (
    <View style={[styles.card, styles.l4Card, { borderLeftColor: riskColor }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.typeLabel, { color: riskColor }]}>{suggestion.typeLabel}</Text>
        <Text style={styles.riskBadge}>{getRiskLabel(suggestion.riskLevel)}</Text>
      </View>
      <Text style={styles.l4Text} numberOfLines={2}>
        {suggestion.options[0]?.content || '后台处理中...'}
      </Text>
    </View>
  );
}

export function SuggestionPanel() {
  const suggestions = useGameStore(s => s.suggestions);
  const dismissSuggestion = useGameStore(s => s.dismissSuggestion);
  const adoptSuggestion = useGameStore(s => s.adoptSuggestion);

  const handleAdopt = useCallback((id: string, optionIndex: number) => {
    const suggestion = suggestions.find(s => s.id === id);
    if (!suggestion) return;

    // Adopt in store (adds chat message locally)
    adoptSuggestion(id, optionIndex);

    // Send to server for broadcasting to other clients
    // Server will send chat:message to all clients (including this one)
    sendSuggestionAdopt(id, optionIndex);
  }, [suggestions, adoptSuggestion]);

  const handleDismiss = useCallback((id: string) => {
    dismissSuggestion(id);
    sendSuggestionDismiss(id);
  }, [dismissSuggestion]);

  const handleEdit = useCallback((id: string, optionIndex: number, content: string) => {
    // Dismiss the suggestion and let the GM edit in the input box
    // The SessionControlScreen will handle loading content into the input
    dismissSuggestion(id);
  }, [dismissSuggestion]);

  // Only show non-L4 suggestions prominently
  const activeSuggestions = suggestions.filter(s => s.riskLevel !== 'L4');
  const backgroundSuggestions = suggestions.filter(s => s.riskLevel === 'L4');

  if (suggestions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>AI即时建议</Text>
        </View>
        <Text style={styles.emptyText}>等待AI生成建议...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI即时建议</Text>
        <Text style={styles.count}>{activeSuggestions.length}</Text>
      </View>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {activeSuggestions.map(suggestion => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onAdopt={handleAdopt}
            onDismiss={handleDismiss}
            onEdit={handleEdit}
          />
        ))}
        {backgroundSuggestions.length > 0 && (
          <View style={styles.backgroundSection}>
            <Text style={styles.backgroundLabel}>后台处理</Text>
            {backgroundSuggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAdopt={handleAdopt}
                onDismiss={handleDismiss}
                onEdit={handleEdit}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  count: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  // Card
  card: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  riskBadge: {
    color: '#7f8c8d',
    fontSize: 10,
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  countdownText: {
    color: '#e74c3c',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Auto text (L0/L1)
  autoText: {
    color: '#ecf0f1',
    fontSize: 13,
    lineHeight: 18,
  },
  // GM-only box
  gmOnlyBox: {
    backgroundColor: '#2a1a3e',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#9b59b6',
  },
  gmOnlyLabel: {
    color: '#9b59b6',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  gmOnlyText: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  // Options
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 6,
  },
  optionRadio: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionRadioSelected: {
    // Visual handled by text
  },
  optionRadioText: {
    color: '#3498db',
    fontSize: 14,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    color: '#3498db',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  optionText: {
    color: '#ecf0f1',
    fontSize: 13,
    lineHeight: 18,
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  adoptButton: {
    backgroundColor: '#27ae60',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adoptButtonText: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: '#f39c12',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editButtonText: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dismissButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dismissButtonText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  undoButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  undoButtonText: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // L4 background
  l4Card: {
    opacity: 0.6,
  },
  l4Text: {
    color: '#7f8c8d',
    fontSize: 11,
    lineHeight: 14,
  },
  backgroundSection: {
    marginTop: 8,
  },
  backgroundLabel: {
    color: '#7f8c8d',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
});
