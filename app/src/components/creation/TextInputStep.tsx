import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
} from 'react-native';
import type { StepRendererProps } from './StepRendererProps';
import { sharedStyles } from './StepRendererProps';

interface TextFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  lines?: number;
  large?: boolean;
}

/**
 * TextInputStep — generic text input step.
 *
 * For Daggerheart: name, backstory, personal quest.
 * Reads rendererConfig.fields for the list of text fields to show.
 */
export function TextInputStep({ stepDef, data, onChange }: StepRendererProps) {
  const config = stepDef.rendererConfig || {};
  const fields = (config.fields as TextFieldConfig[]) || [];

  // Fallback: if no fields defined in config, create a single field from stepDef
  if (fields.length === 0) {
    return (
      <View style={sharedStyles.stepContainer}>
        <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
        <TextInput
          style={sharedStyles.textInput}
          value={(data[stepDef.dataKey] as string) || ''}
          onChangeText={(text) => onChange(stepDef.dataKey, text)}
          placeholder={stepDef.label}
          placeholderTextColor="#7f8c8d"
        />
      </View>
    );
  }

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
      {fields.map((field) => {
        const value = (data[field.key] as string) || '';
        if (field.large) {
          return (
            <TextInput
              key={field.key}
              style={sharedStyles.nameInput}
              value={value}
              onChangeText={(text) => onChange(field.key, text)}
              placeholder={field.placeholder}
              placeholderTextColor="#7f8c8d"
            />
          );
        }
        if (field.multiline) {
          return (
            <TextInput
              key={field.key}
              style={sharedStyles.textArea}
              value={value}
              onChangeText={(text) => onChange(field.key, text)}
              placeholder={field.placeholder}
              placeholderTextColor="#7f8c8d"
              multiline
              numberOfLines={field.lines || 6}
              textAlignVertical="top"
            />
          );
        }
        return (
          <TextInput
            key={field.key}
            style={sharedStyles.textInput}
            value={value}
            onChangeText={(text) => onChange(field.key, text)}
            placeholder={field.placeholder}
            placeholderTextColor="#7f8c8d"
          />
        );
      })}
    </View>
  );
}
