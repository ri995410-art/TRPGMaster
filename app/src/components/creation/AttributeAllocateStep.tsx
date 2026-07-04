import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { StepRendererProps } from './StepRendererProps';
import { sharedStyles } from './StepRendererProps';
import { ATTRIBUTE_LABELS } from '@trpgmaster/shared';
import type { Attribute } from '@trpgmaster/shared';

const DEFAULT_ATTRIBUTE_VALUES = [2, 1, 1, 0, 0, -1];
const DEFAULT_ATTRIBUTE_KEYS: Attribute[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

/**
 * AttributeAllocateStep — generic attribute allocation step.
 *
 * For Daggerheart: +2/+1/+1/0/0/-1 distribution.
 * Reads rendererConfig.values (the pool of values) and rendererConfig.keys (the attribute names)
 * Shows attributes with tap-to-assign values
 */
export function AttributeAllocateStep({ stepDef, data, onChange }: StepRendererProps) {
  const config = stepDef.rendererConfig || {};
  const values = (config.values as number[]) || DEFAULT_ATTRIBUTE_VALUES;
  const keys = (config.keys as Attribute[]) || DEFAULT_ATTRIBUTE_KEYS;

  // Local state for attribute allocation
  const [attrAllocation, setAttrAllocation] = useState<Record<string, number | null>>(
    Object.fromEntries(keys.map((k) => [k, null])) as Record<string, number | null>,
  );
  const [usedValues, setUsedValues] = useState<boolean[]>(values.map(() => false));

  // Restore from data if already set
  useEffect(() => {
    const existing = data[stepDef.dataKey] as Record<Attribute, number> | undefined;
    if (existing) {
      const newAllocation: Record<string, number | null> = {};
      const newUsed = values.map(() => false);
      for (const key of keys) {
        if (existing[key] !== undefined) {
          newAllocation[key] = existing[key];
          // Mark the value as used
          for (let i = 0; i < values.length; i++) {
            if (values[i] === existing[key] && !newUsed[i]) {
              newUsed[i] = true;
              break;
            }
          }
        } else {
          newAllocation[key] = null;
        }
      }
      setAttrAllocation(newAllocation);
      setUsedValues(newUsed);
    }
  }, []); // Only on mount

  const assignAttribute = (attr: string, valueIndex: number) => {
    const newAllocation = { ...attrAllocation };
    const newUsed = [...usedValues];

    // If this attribute already has a value, un-use it
    if (newAllocation[attr] !== null) {
      // Find the used slot with the same value for this attribute
      for (let i = 0; i < values.length; i++) {
        if (values[i] === newAllocation[attr] && newUsed[i]) {
          newUsed[i] = false;
          break;
        }
      }
    }

    // Assign new value
    if (newUsed[valueIndex]) return; // already used
    newAllocation[attr] = values[valueIndex];
    newUsed[valueIndex] = true;

    setAttrAllocation(newAllocation);
    setUsedValues(newUsed);

    // Check if all attributes are assigned
    const allAssigned = keys.every((k) => newAllocation[k] !== null);
    if (allAssigned) {
      const attrs = Object.fromEntries(
        keys.map((k) => [k, newAllocation[k]!]),
      ) as Record<Attribute, number>;
      onChange(stepDef.dataKey, attrs);
    }
  };

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
      <Text style={styles.attributeHint}>
        将 {values.map((v) => (v > 0 ? '+' : '') + v).join(', ')} 分配给{keys.length === 6 ? '六大' : ''}属性
      </Text>
      {keys.map((attr) => (
        <View key={attr} style={styles.attributeRow}>
          <Text style={styles.attributeName}>{ATTRIBUTE_LABELS[attr as Attribute] || attr}</Text>
          <View style={styles.attributeValues}>
            {values.map((val, idx) => {
              const isSelected = attrAllocation[attr] === val && usedValues[idx];
              const isUsed = usedValues[idx] && attrAllocation[attr] !== val;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.attributeValueChip,
                    isSelected && styles.attributeValueChipSelected,
                    isUsed && styles.attributeValueChipUsed,
                  ]}
                  onPress={() => assignAttribute(attr, idx)}
                  disabled={isUsed}
                >
                  <Text
                    style={[
                      styles.attributeValueText,
                      isSelected && styles.attributeValueTextSelected,
                      isUsed && styles.attributeValueTextUsed,
                    ]}
                  >
                    {val > 0 ? '+' : ''}{val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  attributeHint: {
    color: '#f39c12',
    fontSize: 12,
    marginBottom: 12,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  attributeName: {
    color: '#ecf0f1',
    fontSize: 14,
    width: 50,
  },
  attributeValues: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  attributeValueChip: {
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attributeValueChipSelected: {
    backgroundColor: '#3498db',
  },
  attributeValueChipUsed: {
    backgroundColor: '#1a1a2e',
    opacity: 0.4,
  },
  attributeValueText: {
    color: '#bdc3c7',
    fontSize: 13,
  },
  attributeValueTextSelected: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  attributeValueTextUsed: {
    color: '#7f8c8d',
  },
});
