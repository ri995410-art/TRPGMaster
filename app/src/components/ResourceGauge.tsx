import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

interface GaugeProps {
  label: string;
  current: number;
  max: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

export function ResourceGauge({ label, current, max, icon, color }: GaugeProps) {
  return (
    <View style={styles.gauge}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.value, { color }]}>{current}/{max}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gauge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  value: {
    fontSize: 12,
    fontFamily: theme.font.display,
    fontWeight: 'bold',
  },
  label: {
    color: theme.color.textDim,
    fontSize: 10,
    fontFamily: theme.font.body,
  },
});
