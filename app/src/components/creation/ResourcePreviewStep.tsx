import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import type { StepRendererProps } from './StepRendererProps';
import { sharedStyles } from './StepRendererProps';

/**
 * ResourcePreviewStep — read-only resource preview.
 *
 * For Daggerheart: displays calculated hp, stress, hope, evasion, thresholds
 * based on class/armor/attributes selected.
 * Calls no onChange (informational only).
 */
export function ResourcePreviewStep({ stepDef, data, gameData }: StepRendererProps) {
  // Compute preview values from current data
  const classId = data.classId as string | null;
  const armorId = data.armorId as string | null;
  const attributes = data.attributes as Record<string, number> | undefined;

  const classData = classId ? gameData.classes.find((c: any) => c.id === classId) : null;
  const armorData = armorId ? gameData.armor.find((a: any) => a.id === armorId) : null;

  const baseHp = classData?.baseHp ?? 6;
  const baseEvasion = classData?.baseEvasion ?? 10;
  const baseStress = classData?.baseStress ?? 6;
  const agilityMod = attributes?.agility ?? 0;

  const computedHp = baseHp + 1; // baseHp + level
  const computedEvasion = baseEvasion + agilityMod;
  const computedMaxStress = baseStress;
  const computedMaxHope = 6;
  const computedArmorSlots = armorData?.armorSlots ?? 3;
  const computedMajorThreshold = armorData?.baseThreshold ?? 6;
  const computedMinorThreshold = computedMajorThreshold - 5;
  const computedSevereThreshold = armorData?.baseThresholdSevere ?? 13;

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
      <View style={styles.resourceInfoBox}>
        <Text style={styles.resourceInfoTitle}>基础资源（由职业和属性决定）</Text>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>闪避值</Text>
          <Text style={styles.resourceInfoValue}>10 + 敏捷调整值 = {computedEvasion}</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>生命点</Text>
          <Text style={styles.resourceInfoValue}>职业基础 + 等级 = {computedHp}</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>压力点</Text>
          <Text style={styles.resourceInfoValue}>{computedMaxStress} (固定)</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>希望点</Text>
          <Text style={styles.resourceInfoValue}>{computedMaxHope} (固定)</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>护甲槽</Text>
          <Text style={styles.resourceInfoValue}>{computedArmorSlots} (护甲提供)</Text>
        </View>
        <View style={styles.resourceInfoRow}>
          <Text style={styles.resourceInfoLabel}>伤害阈值</Text>
          <Text style={styles.resourceInfoValue}>{computedMinorThreshold}/{computedMajorThreshold}/{computedSevereThreshold}</Text>
        </View>
      </View>
      <Text style={styles.resourceNote}>
        这些数值将在完成角色创建后自动计算
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resourceInfoBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  resourceInfoTitle: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resourceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  resourceInfoLabel: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  resourceInfoValue: {
    color: '#ecf0f1',
    fontSize: 13,
  },
  resourceNote: {
    color: '#7f8c8d',
    fontSize: 12,
    textAlign: 'center',
  },
});
