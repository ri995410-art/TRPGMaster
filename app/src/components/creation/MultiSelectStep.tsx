import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { StepRendererProps } from './StepRendererProps';
import { sharedStyles } from './StepRendererProps';
import type { DomainCard, ClassData, DomainType } from '@trpgmaster/shared';

const DOMAIN_LABELS: Record<string, string> = {
  arcane: '奥术', blade: '利刃', bone: '骸骨', codex: '典籍',
  elegance: '优雅', midnight: '午夜', sage: '贤者', splendor: '辉耀', valor: '勇气',
};

/**
 * MultiSelectStep — generic multi-select step.
 *
 * For Daggerheart: domain cards selection.
 * Reads rendererConfig.min, rendererConfig.max, rendererConfig.dataKey
 * Shows selectable cards with selection count
 */
export function MultiSelectStep({ stepDef, data, onChange, gameData }: StepRendererProps) {
  const config = stepDef.rendererConfig || {};
  const min = (config.min as number) || 1;
  const max = (config.max as number) || 2;
  const filterByClassDomains = config.filterByClassDomains as boolean || false;

  const selectedItems = (data[stepDef.dataKey] as DomainCard[]) || [];

  // For DH domain cards: filter by class domains
  const classId = data.classId as string | null || null;
  const selectedClass: ClassData | undefined = gameData.classes.find((c: ClassData) => c.id === classId);
  const classDomains = selectedClass?.domains || [];
  const availableCards = filterByClassDomains
    ? gameData.domainCards.filter((c: DomainCard) => c.level === 1 && (classDomains as string[]).includes(c.domain))
    : gameData.domainCards || [];

  const handleToggle = (item: DomainCard) => {
    const isSelected = selectedItems.some((c: DomainCard) => c.id === item.id);
    if (isSelected) {
      onChange(stepDef.dataKey, selectedItems.filter((c: DomainCard) => c.id !== item.id));
    } else if (selectedItems.length < max) {
      onChange(stepDef.dataKey, [...selectedItems, item]);
    }
  };

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
      <Text style={styles.domainHint}>
        选择{max}张1级领域卡作为初始能力 (已选: {selectedItems.length}/{max})
      </Text>
      {filterByClassDomains && classDomains.length > 0 && (
        <Text style={styles.domainFilterHint}>
          可选领域：{classDomains.map((d: string) => DOMAIN_LABELS[d] || d).join('、')}
        </Text>
      )}
      {availableCards.length > 0 ? (
        availableCards.map((item: DomainCard) => {
          const isSelected = selectedItems.some((c: DomainCard) => c.id === item.id);
          const isFull = selectedItems.length >= max && !isSelected;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                sharedStyles.optionCard,
                isSelected && sharedStyles.optionCardSelected,
                isFull && sharedStyles.optionCardDisabled,
              ]}
              onPress={() => handleToggle(item)}
              disabled={isFull}
            >
              <Text style={sharedStyles.optionTitle}>{item.name}</Text>
              <Text style={sharedStyles.optionDesc}>
                {item.domain} · {item.type} · {(item.hopeCost ?? 0) > 0 ? `${item.hopeCost}希望` : '被动'}
              </Text>
              {/* Show details when selected */}
              {isSelected && (
                <View style={styles.domainCardDetail}>
                  {item.effect && (
                    <Text style={styles.domainCardEffect}>{item.effect}</Text>
                  )}
                  {item.description && (
                    <Text style={styles.domainCardDesc}>{item.description}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={sharedStyles.placeholderBox}>
          <Text style={sharedStyles.placeholderText}>
            {gameData.domainCards.length > 0
              ? '请先选择职业以查看可选领域卡'
              : '领域卡数据将在连接服务器后加载'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  domainHint: {
    color: '#9b59b6',
    fontSize: 12,
    marginBottom: 4,
  },
  domainFilterHint: {
    color: '#3498db',
    fontSize: 12,
    marginBottom: 12,
  },
  domainCardDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2c3e50',
  },
  domainCardEffect: {
    color: '#f39c12',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 18,
    marginBottom: 4,
  },
  domainCardDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
  },
});
