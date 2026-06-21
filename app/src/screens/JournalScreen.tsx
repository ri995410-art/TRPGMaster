import React from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useGameStore, type JournalEntry } from '../store/gameStore';

export function JournalScreen() {
  const journalEntries = useGameStore((s) => s.journalEntries);
  const recentEvents = useGameStore((s) => s.recentEvents);

  const questEntries = journalEntries.filter((e) => e.type === 'quest');
  const eventEntries = journalEntries.filter((e) => e.type === 'event');
  const discoveryEntries = journalEntries.filter((e) => e.type === 'discovery');
  const factionEntries = journalEntries.filter((e) => e.type === 'faction');
  const npcEntries = journalEntries.filter((e) => e.type === 'npc');

  const sections = [
    { title: '任务', data: questEntries, icon: 'book' as const, color: '#f39c12' },
    { title: '事件', data: eventEntries, icon: 'flash' as const, color: '#e74c3c' },
    { title: '发现', data: discoveryEntries, icon: 'search' as const, color: '#2ecc71' },
    { title: '派系', data: factionEntries, icon: 'people' as const, color: '#9b59b6' },
    { title: 'NPC', data: npcEntries, icon: 'person' as const, color: '#3498db' },
  ].filter((s) => s.data.length > 0);

  const getIconForType = (type: JournalEntry['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'quest': return 'book';
      case 'event': return 'flash';
      case 'discovery': return 'search';
      case 'faction': return 'people';
      case 'npc': return 'person';
    }
  };

  const getColorForType = (type: JournalEntry['type']): string => {
    switch (type) {
      case 'quest': return '#f39c12';
      case 'event': return '#e74c3c';
      case 'discovery': return '#2ecc71';
      case 'faction': return '#9b59b6';
      case 'npc': return '#3498db';
    }
  };

  const renderEntry = ({ item }: { item: JournalEntry }) => (
    <View style={[styles.entryCard, { borderLeftColor: getColorForType(item.type) }]}>
      <View style={styles.entryHeader}>
        <Ionicons name={getIconForType(item.type)} size={14} color={getColorForType(item.type)} />
        <Text style={styles.entryTitle}>{item.title}</Text>
        {item.completed && (
          <Ionicons name="checkmark-circle" size={14} color="#2ecc71" />
        )}
      </View>
      <Text style={styles.entryContent}>{item.content}</Text>
      <Text style={styles.entryTime}>
        {new Date(item.timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={48} color="#34495e" />
          <Text style={styles.emptyTitle}>冒险日志为空</Text>
          <Text style={styles.emptySubtitle}>
            在冒险中发现的任务、事件和秘密将记录在这里
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon} size={16} color={section.color} />
              <Text style={[styles.sectionTitle, { color: section.color }]}>
                {section.title}
              </Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#7f8c8d',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#7f8c8d',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#0f0f23',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionCount: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  // Entry card
  entryCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  entryTitle: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  entryContent: {
    color: '#bdc3c7',
    fontSize: 13,
    lineHeight: 18,
  },
  entryTime: {
    color: '#7f8c8d',
    fontSize: 10,
    marginTop: 6,
  },
});
