import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StepRendererProps } from './StepRendererProps';
import { sharedStyles } from './StepRendererProps';
import type { CharacterConnection } from '../../store/characterCreateStore';

/**
 * ConnectionListStep — relationship list editor.
 *
 * For Daggerheart: connections.
 * Shows list of connections with add/remove.
 * Each connection has name, relationship type, description.
 */
export function ConnectionListStep({ stepDef, data, onChange }: StepRendererProps) {
  const connections = (data[stepDef.dataKey] as CharacterConnection[]) || [];

  // Local state for new connection form
  const [newConnName, setNewConnName] = useState('');
  const [newConnRel, setNewConnRel] = useState('');
  const [newConnDesc, setNewConnDesc] = useState('');

  const addConnection = () => {
    if (newConnName.trim()) {
      onChange(stepDef.dataKey, [
        ...connections,
        {
          name: newConnName.trim(),
          relationship: newConnRel.trim() || '未知',
          description: newConnDesc.trim(),
        },
      ]);
      setNewConnName('');
      setNewConnRel('');
      setNewConnDesc('');
    }
  };

  const removeConnection = (index: number) => {
    onChange(stepDef.dataKey, connections.filter((_: any, i: number) => i !== index));
  };

  return (
    <View style={sharedStyles.stepContainer}>
      <Text style={sharedStyles.stepDescription}>{stepDef.description}</Text>
      {connections.map((conn: CharacterConnection, i: number) => (
        <View key={i} style={styles.connectionCard}>
          <View style={styles.connectionHeader}>
            <Text style={styles.connectionName}>{conn.name}</Text>
            <TouchableOpacity onPress={() => removeConnection(i)}>
              <Ionicons name="close-circle" size={18} color="#e74c3c" />
            </TouchableOpacity>
          </View>
          <Text style={styles.connectionRel}>{conn.relationship}</Text>
          <Text style={styles.connectionDesc}>{conn.description}</Text>
        </View>
      ))}
      <View style={styles.addConnectionBox}>
        <TextInput
          style={sharedStyles.textInput}
          value={newConnName}
          onChangeText={setNewConnName}
          placeholder="人物名"
          placeholderTextColor="#7f8c8d"
        />
        <TextInput
          style={sharedStyles.textInput}
          value={newConnRel}
          onChangeText={setNewConnRel}
          placeholder="关系（如：导师、旧友、家人）"
          placeholderTextColor="#7f8c8d"
        />
        <TextInput
          style={sharedStyles.textInput}
          value={newConnDesc}
          onChangeText={setNewConnDesc}
          placeholder="描述"
          placeholderTextColor="#7f8c8d"
        />
        <TouchableOpacity
          style={styles.addConnectionButton}
          onPress={addConnection}
        >
          <Ionicons name="add-circle" size={18} color="#3498db" />
          <Text style={styles.addConnectionText}>添加关系</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  connectionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectionName: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
  connectionRel: {
    color: '#3498db',
    fontSize: 12,
    marginTop: 2,
  },
  connectionDesc: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 4,
  },
  addConnectionBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2c3e50',
    borderStyle: 'dashed',
  },
  addConnectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addConnectionText: {
    color: '#3498db',
    fontSize: 14,
  },
});
