import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGameStore } from '../store/gameStore';
import type { DomainCard } from '@trpgmaster/shared';
import { theme } from '../theme/theme';

export interface FeatureItem {
  id: string;
  name: string;
  type: 'domainCard' | 'classFeature' | 'ancestryFeature' | 'communityFeature';
  cost?: string;
  usesLeft?: number;
}

interface FeatureTrayProps {
  selectedFeature: FeatureItem | null;
  onSelectFeature: (feature: FeatureItem | null) => void;
}

export function FeatureTray({ selectedFeature, onSelectFeature }: FeatureTrayProps) {
  const character = useGameStore((s) => s.character);
  const aiProcessing = useGameStore((s) => s.aiProcessing);

  if (!character) return null;

  // Build feature list from character data
  const features: FeatureItem[] = [];

  // Domain cards from loadout
  const loadout: DomainCard[] = character.domainCardConfig?.loadout ?? [];
  for (const card of loadout) {
    const usesLeft = character.featureUses?.[card.id];
    const costParts: string[] = [];
    if (card.hopeCost) costParts.push(`${card.hopeCost}希望`);
    if (card.stressCost) costParts.push(`${card.stressCost}压力`);
    features.push({
      id: card.id,
      name: card.name,
      type: 'domainCard',
      cost: costParts.length > 0 ? costParts.join('+') : undefined,
      usesLeft,
    });
  }

  // Class feature placeholder (actual data comes from game data store)
  if (character.classId) {
    features.push({
      id: `class-${character.classId}`,
      name: '职业特性',
      type: 'classFeature',
      cost: '3希望',
    });
  }

  // Ancestry feature placeholder
  if (character.ancestryId) {
    features.push({
      id: `ancestry-${character.ancestryId}`,
      name: '种族特性',
      type: 'ancestryFeature',
    });
  }

  // Community feature placeholder
  if (character.communityId) {
    features.push({
      id: `community-${character.communityId}`,
      name: '社群特性',
      type: 'communityFeature',
    });
  }

  if (features.length === 0) return null;

  const handleFeaturePress = (feature: FeatureItem) => {
    if (aiProcessing) return;
    if (selectedFeature?.id === feature.id) {
      onSelectFeature(null);
      return;
    }
    onSelectFeature(feature);
  };

  const getTypeIcon = (type: FeatureItem['type']): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (type) {
      case 'domainCard': return 'layers-outline';
      case 'classFeature': return 'star-outline';
      case 'ancestryFeature': return 'body-outline';
      case 'communityFeature': return 'people-outline';
    }
  };

  const getTypeColor = (type: FeatureItem['type']): string => {
    switch (type) {
      case 'domainCard': return theme.color.accent;
      case 'classFeature': return theme.color.emerald;
      case 'ancestryFeature': return theme.color.warning;
      case 'communityFeature': return theme.color.fog;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {features.map((feature) => {
          const isSelected = selectedFeature?.id === feature.id;
          const color = getTypeColor(feature.type);
          return (
            <TouchableOpacity
              key={feature.id}
              style={[styles.chip, isSelected && { borderColor: color, backgroundColor: color + '22' }]}
              onPress={() => handleFeaturePress(feature)}
              disabled={aiProcessing}
            >
              <Ionicons name={getTypeIcon(feature.type)} size={12} color={isSelected ? color : theme.color.textDim} />
              <Text style={[styles.chipText, isSelected && { color }]} numberOfLines={1}>
                {feature.name}
              </Text>
              {feature.cost && (
                <Text style={[styles.chipCost, isSelected && { color }]}>{feature.cost}</Text>
              )}
              {feature.usesLeft !== undefined && (
                <Text style={styles.chipUses}>×{feature.usesLeft}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.color.bgInput,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.color.fog,
  },
  chipText: {
    color: theme.color.parchment,
    fontSize: 11,
    fontFamily: theme.font.body,
  },
  chipCost: {
    color: theme.color.textDim,
    fontSize: 9,
  },
  chipUses: {
    color: theme.color.warning,
    fontSize: 9,
    fontWeight: 'bold',
  },
});
