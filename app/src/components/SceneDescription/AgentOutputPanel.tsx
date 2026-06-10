import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import type { AgentOutput } from '../store/gameStore';

interface AgentOutputPanelProps {
  outputs: AgentOutput[];
  isGM?: boolean;
}

type FilterType = 'all' | 'narrative' | 'rules' | 'combat' | 'npc' | 'faction' | 'sceneDirector' | 'imageDirector' | 'novel';

const AGENT_LABELS: Record<string, string> = {
  narrative: '叙事',
  rules: '规则',
  sceneDirector: '场景',
  npc: 'NPC',
  combat: '战斗',
  faction: '派系',
  imageDirector: '图像',
  novel: '小说',
  memoryCompressor: '记忆',
  intentParser: '意图',
};

const GM_ONLY_AGENTS = new Set(['memoryCompressor', 'sceneDirector', 'intentParser']);
const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'narrative', label: '叙事' },
  { key: 'rules', label: '规则' },
  { key: 'combat', label: '战斗' },
  { key: 'npc', label: 'NPC' },
  { key: 'faction', label: '派系' },
  { key: 'sceneDirector', label: '场景' },
  { key: 'imageDirector', label: '图像' },
  { key: 'novel', label: '小说' },
];

function getAgentColor(agentType: string): string {
  const colors: Record<string, string> = {
    narrative: '#8e44ad',
    rules: '#3498db',
    sceneDirector: '#e67e22',
    npc: '#2ecc71',
    combat: '#e74c3c',
    faction: '#f39c12',
    imageDirector: '#1abc9c',
    novel: '#9b59b6',
    memoryCompressor: '#95a5a6',
    intentParser: '#2ecc71',
  };
  return colors[agentType] || '#95a5a6';
}

function isGMOnlyOutput(agentType: string): boolean {
  return GM_ONLY_AGENTS.has(agentType);
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function tryParseJSON(text: string): { parsed: boolean; data?: Record<string, unknown> } {
  try {
    const obj = JSON.parse(text);
    if (typeof obj === 'object' && obj !== null) {
      return { parsed: true, data: obj };
    }
  } catch {
    // Not JSON
  }
  return { parsed: false };
}

export function AgentOutputPanel({ outputs, isGM = false }: AgentOutputPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filter outputs
  const filteredOutputs = outputs
    .filter(o => {
      if (!isGM && isGMOnlyOutput(o.agentType)) return false;
      if (filter !== 'all' && o.agentType !== filter) return false;
      return true;
    })
    .slice(-20);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI助手</Text>
        <Text style={styles.count}>{filteredOutputs.length}</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterTab, filter === opt.key && styles.filterTabActive]}
            onPress={() => setFilter(opt.key)}
          >
            <Text style={[styles.filterTabText, filter === opt.key && styles.filterTabTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredOutputs}
        keyExtractor={(item, index) => `${item.agentType}_${item.timestamp}_${index}`}
        renderItem={({ item }) => {
          const key = `${item.agentType}_${item.timestamp}`;
          const isExpanded = expanded.has(key);
          const { parsed, data } = tryParseJSON(item.output);
          const displayText = parsed && data
            ? (isExpanded ? JSON.stringify(data, null, 2) : Object.values(data).slice(0, 2).join(' | '))
            : (isExpanded ? item.output : item.output.slice(0, 100) + (item.output.length > 100 ? '...' : ''));

          return (
            <TouchableOpacity onPress={() => toggleExpand(key)} style={styles.outputItem}>
              <View style={styles.outputHeader}>
                <View style={styles.outputHeaderLeft}>
                  <View style={[styles.agentBadge, { backgroundColor: getAgentColor(item.agentType) }]}>
                    <Text style={styles.agentBadgeText}>
                      {AGENT_LABELS[item.agentType] || item.agentType}
                    </Text>
                  </View>
                  {isGMOnlyOutput(item.agentType) && (
                    <Text style={styles.gmOnlyTag}>GM</Text>
                  )}
                </View>
                <Text style={styles.outputTime}>{formatRelativeTime(item.timestamp)}</Text>
              </View>
              <Text style={styles.outputText} numberOfLines={isExpanded ? undefined : 3}>
                {displayText}
              </Text>
              {!isExpanded && item.output.length > 100 && (
                <Text style={styles.expandHint}>点击展开</Text>
              )}
            </TouchableOpacity>
          );
        }}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  filterRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterTab: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterTabActive: {
    backgroundColor: '#3498db',
  },
  filterTabText: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  filterTabTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  outputItem: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  outputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  outputHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agentBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  agentBadgeText: {
    color: '#ecf0f1',
    fontSize: 11,
    fontWeight: 'bold',
  },
  gmOnlyTag: {
    color: '#f39c12',
    fontSize: 9,
    fontWeight: 'bold',
  },
  outputTime: {
    color: '#7f8c8d',
    fontSize: 11,
  },
  outputText: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 18,
  },
  expandHint: {
    color: '#3498db',
    fontSize: 11,
    marginTop: 4,
  },
});