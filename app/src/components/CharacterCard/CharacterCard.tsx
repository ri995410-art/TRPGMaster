import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Character } from '@trpgmaster/shared';
import { ATTRIBUTE_LABELS } from '@trpgmaster/shared';

interface CharacterCardProps {
  character: Character;
  isMyCharacter?: boolean;
  onStatChange?: (characterId: string, stat: 'hp' | 'stress' | 'hope' | 'armorSlots', delta: number) => void;
}

export function CharacterCard({ character, isMyCharacter, onStatChange }: CharacterCardProps) {
  const renderResourceBar = (
    label: string,
    current: number,
    max: number,
    color: string,
    stat: 'hp' | 'stress' | 'hope' | 'armorSlots',
  ) => (
    <View style={styles.resourceRow}>
      <Text style={styles.resourceLabel}>{label}</Text>
      <View style={styles.resourceBarContainer}>
        <View style={[styles.resourceBarFill, { width: `${(current / max) * 100}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.resourceButtons}>
        <TouchableOpacity
          style={styles.resourceButton}
          onPress={() => onStatChange?.(character.id, stat, -1)}
        >
          <Text style={styles.resourceButtonText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.resourceValue}>{current}/{max}</Text>
        <TouchableOpacity
          style={styles.resourceButton}
          onPress={() => onStatChange?.(character.id, stat, 1)}
        >
          <Text style={styles.resourceButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, isMyCharacter && styles.myCharacter]}>
      <View style={styles.header}>
        <Text style={styles.name}>{character.name}</Text>
        <Text style={styles.level}>Lv.{character.level}</Text>
      </View>

      {renderResourceBar('生命', character.hp, character.maxHp, '#e74c3c', 'hp')}
      {renderResourceBar('压力', character.stress, character.maxStress, '#e67e22', 'stress')}
      {renderResourceBar('希望', character.hope, character.maxHope, '#3498db', 'hope')}
      {renderResourceBar('护甲', character.armorSlots, character.maxArmorSlots, '#95a5a6', 'armorSlots')}

      <View style={styles.attributes}>
        {(Object.entries(character.attributes) as [keyof typeof ATTRIBUTE_LABELS, number][]).map(([attr, value]) => (
          <View key={attr} style={styles.attributeChip}>
            <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr]}</Text>
            <Text style={[styles.attributeValue, value > 0 && styles.positive, value < 0 && styles.negative]}>
              {value > 0 ? '+' : ''}{value}
            </Text>
          </View>
        ))}
      </View>

      {character.conditions.length > 0 && (
        <View style={styles.conditions}>
          {character.conditions.map((cond) => (
            <View key={cond} style={styles.conditionBadge}>
              <Text style={styles.conditionText}>{cond}</Text>
            </View>
          ))}
        </View>
      )}

      {character.corruption > 0 && (
        <View style={styles.corruptionRow}>
          <Text style={styles.corruptionLabel}>污染等级</Text>
          <View style={styles.corruptionDots}>
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                style={[styles.corruptionDot, i < character.corruption && styles.corruptionDotActive]}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#16213e',
  },
  myCharacter: {
    borderColor: '#3498db',
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
  },
  level: {
    color: '#bdc3c7',
    fontSize: 14,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  resourceLabel: {
    color: '#bdc3c7',
    fontSize: 12,
    width: 36,
  },
  resourceBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#2c3e50',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  resourceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  resourceButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resourceButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resourceButtonText: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resourceValue: {
    color: '#ecf0f1',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
  attributes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  attributeChip: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 4,
  },
  attributeName: {
    color: '#bdc3c7',
    fontSize: 11,
  },
  attributeValue: {
    color: '#ecf0f1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  conditions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  conditionBadge: {
    backgroundColor: '#e74c3c33',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  conditionText: {
    color: '#e74c3c',
    fontSize: 11,
  },
  corruptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  corruptionLabel: {
    color: '#9b59b6',
    fontSize: 12,
  },
  corruptionDots: {
    flexDirection: 'row',
    gap: 4,
  },
  corruptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2c3e50',
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  corruptionDotActive: {
    backgroundColor: '#9b59b6',
  },
});
