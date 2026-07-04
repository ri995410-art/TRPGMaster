import React from 'react';
import type { CreationStepDef } from '@trpgmaster/shared';

// ===== Common props interface for all step renderers =====

export interface StepRendererProps {
  stepDef: CreationStepDef;
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  gameData: any; // The full game data from server (classes, ancestries, weapons, etc.)
  errors?: Record<string, string[]>;
}

// ===== Shared styles (matching CharacterCreateScreen) =====

import { StyleSheet } from 'react-native';

export const sharedStyles = StyleSheet.create({
  stepContainer: {
    marginBottom: 16,
  },
  stepDescription: {
    color: '#bdc3c7',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  // Option card
  optionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  optionCardSelected: {
    borderColor: '#3498db',
    backgroundColor: '#3498db11',
  },
  optionCardDisabled: {
    opacity: 0.5,
  },
  optionTitle: {
    color: '#ecf0f1',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  optionDesc: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  // Placeholder
  placeholderBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c3e50',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: '#7f8c8d',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  // Section label
  sectionLabel: {
    color: '#bdc3c7',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  // Inputs
  nameInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  textInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  textArea: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ecf0f1',
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
    minHeight: 120,
  },
  // Feature preview for ancestry/community
  featurePreviewList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2c3e50',
  },
  featurePreviewItem: {
    marginBottom: 8,
  },
  featurePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featurePreviewName: {
    color: '#ecf0f1',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  featurePreviewType: {
    color: '#f39c12',
    fontSize: 10,
    backgroundColor: '#f39c1222',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  featurePreviewCost: {
    color: '#e67e22',
    fontSize: 10,
  },
  featurePreviewDesc: {
    color: '#bdc3c7',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  // No data text
  noDataText: {
    color: '#7f8c8d',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
