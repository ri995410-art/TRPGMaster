import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';

interface DiceTrayProps {
  onRoll: (hopeDie: number, fearDie: number, modifier: number, difficulty: number, options?: {
    advantageCount?: number;
    disadvantageCount?: number;
    rollType?: 'action' | 'reaction';
  }) => void;
}

function rollD12(): number {
  return Math.floor(Math.random() * 12) + 1;
}

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export function DiceTray({ onRoll }: DiceTrayProps) {
  const [lastHope, setLastHope] = useState<number | null>(null);
  const [lastFear, setLastFear] = useState<number | null>(null);
  const [lastModifier, setLastModifier] = useState(0);
  const [difficulty, setDifficulty] = useState(15);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [advantageCount, setAdvantageCount] = useState(0);
  const [disadvantageCount, setDisadvantageCount] = useState(0);
  const [rollType, setRollType] = useState<'action' | 'reaction'>('action');

  const netAdvantage = advantageCount - disadvantageCount;

  const handleDualD12 = () => {
    const hope = rollD12();
    const fear = rollD12();
    let total = hope + fear + lastModifier;

    // Apply advantage/disadvantage d6
    let d6Result: number | null = null;
    if (netAdvantage > 0) {
      d6Result = rollD6();
      total += d6Result;
    } else if (netAdvantage < 0) {
      d6Result = rollD6();
      total -= d6Result;
    }

    setLastHope(hope);
    setLastFear(fear);

    let result: string;
    if (hope === fear) {
      result = rollType === 'reaction' ? '关键成功(反应)!' : '关键成功!';
    } else if (total >= difficulty && hope > fear) {
      result = rollType === 'reaction' ? '希望成功(反应)' : '希望成功';
    } else if (total >= difficulty && fear > hope) {
      result = rollType === 'reaction' ? '恐惧成功(反应)' : '恐惧成功';
    } else if (total < difficulty && hope > fear) {
      result = rollType === 'reaction' ? '希望失败(反应)' : '希望失败';
    } else {
      result = rollType === 'reaction' ? '恐惧失败(反应)' : '恐惧失败';
    }

    // Show d6 modifier in result
    const d6Text = d6Result !== null
      ? (netAdvantage > 0 ? ` +d6(${d6Result})` : ` -d6(${d6Result})`)
      : '';

    setLastResult(`${result} (${hope}+${fear}${lastModifier !== 0 ? (lastModifier > 0 ? `+${lastModifier}` : `${lastModifier}`) : ''}${d6Text}=${total} vs ${difficulty})`);
    Vibration.vibrate(100);
    onRoll(hope, fear, lastModifier, difficulty, {
      advantageCount,
      disadvantageCount,
      rollType,
    });
  };

  const handleD20 = () => {
    const result = rollD20();
    setLastResult(`d20: ${result}`);
    Vibration.vibrate(50);
    // Report to server so other players can see the roll
    onRoll(0, 0, result, 0, { rollType: 'action' });
  };

  const handleD6 = () => {
    const result = rollD6();
    setLastResult(`d6: ${result}`);
    // Report to server so other players can see the roll
    onRoll(0, 0, result, 0, { rollType: 'action' });
  };

  const toggleAdvantage = () => {
    if (advantageCount > 0) {
      setAdvantageCount(0);
    } else {
      setAdvantageCount(1);
      if (disadvantageCount > 0) setDisadvantageCount(0); // mutually exclusive visual
    }
  };

  const toggleDisadvantage = () => {
    if (disadvantageCount > 0) {
      setDisadvantageCount(0);
    } else {
      setDisadvantageCount(1);
      if (advantageCount > 0) setAdvantageCount(0); // mutually exclusive visual
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>骰子托盘</Text>

      {/* Roll Type Toggle */}
      <View style={styles.rollTypeRow}>
        <Text style={styles.label}>类型</Text>
        <TouchableOpacity
          style={[styles.rollTypeButton, rollType === 'action' && styles.rollTypeActive]}
          onPress={() => setRollType('action')}
        >
          <Text style={[styles.rollTypeText, rollType === 'action' && styles.rollTypeTextActive]}>行动</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rollTypeButton, rollType === 'reaction' && styles.rollTypeReactionActive]}
          onPress={() => setRollType('reaction')}
        >
          <Text style={[styles.rollTypeText, rollType === 'reaction' && styles.rollTypeTextActive]}>反应</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.difficultyRow}>
        <Text style={styles.label}>难度</Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setDifficulty(d => Math.max(5, d - 5))}>
          <Text style={styles.adjustButtonText}>-5</Text>
        </TouchableOpacity>
        <Text style={styles.difficultyValue}>{difficulty}</Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setDifficulty(d => Math.min(30, d + 5))}>
          <Text style={styles.adjustButtonText}>+5</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modifierRow}>
        <Text style={styles.label}>调整值</Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setLastModifier(m => m - 1)}>
          <Text style={styles.adjustButtonText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.modifierValue}>{lastModifier >= 0 ? '+' : ''}{lastModifier}</Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setLastModifier(m => m + 1)}>
          <Text style={styles.adjustButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Advantage / Disadvantage Toggle */}
      <View style={styles.advDisRow}>
        <Text style={styles.label}>修正</Text>
        <TouchableOpacity
          style={[styles.advButton, advantageCount > 0 && styles.advButtonActive]}
          onPress={toggleAdvantage}
        >
          <Text style={[styles.advButtonText, advantageCount > 0 && styles.advButtonTextActive]}>▲ 优势</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.disButton, disadvantageCount > 0 && styles.disButtonActive]}
          onPress={toggleDisadvantage}
        >
          <Text style={[styles.disButtonText, disadvantageCount > 0 && styles.disButtonTextActive]}>▼ 劣势</Text>
        </TouchableOpacity>
        {netAdvantage !== 0 && (
          <Text style={styles.netAdvText}>
            {netAdvantage > 0 ? `+1d6` : `-1d6`}
          </Text>
        )}
      </View>

      <View style={styles.diceButtons}>
        <TouchableOpacity style={[styles.diceButton, styles.dualButton]} onPress={handleDualD12}>
          <Text style={styles.diceButtonText}>二元骰</Text>
          <Text style={styles.diceButtonSub}>2d12</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.diceButton} onPress={handleD20}>
          <Text style={styles.diceButtonText}>d20</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.diceButton, styles.d6Button]} onPress={handleD6}>
          <Text style={styles.diceButtonText}>d6</Text>
          <Text style={styles.diceButtonSub}>自由</Text>
        </TouchableOpacity>
      </View>

      {lastHope !== null && lastFear !== null && (
        <View style={styles.lastRoll}>
          <View style={styles.dieResult}>
            <Text style={styles.dieLabel}>希望</Text>
            <Text style={[styles.dieValue, { color: '#3498db' }]}>{lastHope}</Text>
          </View>
          <Text style={styles.diePlus}>+</Text>
          <View style={styles.dieResult}>
            <Text style={styles.dieLabel}>恐惧</Text>
            <Text style={[styles.dieValue, { color: '#e74c3c' }]}>{lastFear}</Text>
          </View>
        </View>
      )}

      {lastResult && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{lastResult}</Text>
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
  },
  title: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  rollTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rollTypeButton: {
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#34495e',
  },
  rollTypeActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  rollTypeReactionActive: {
    backgroundColor: '#e67e22',
    borderColor: '#e67e22',
  },
  rollTypeText: {
    color: '#bdc3c7',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rollTypeTextActive: {
    color: '#fff',
  },
  difficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  advDisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  label: {
    color: '#bdc3c7',
    fontSize: 14,
    width: 50,
  },
  adjustButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  difficultyValue: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    width: 40,
    textAlign: 'center',
  },
  modifierValue: {
    color: '#ecf0f1',
    fontSize: 18,
    fontWeight: 'bold',
    width: 40,
    textAlign: 'center',
  },
  advButton: {
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#27ae60',
  },
  advButtonActive: {
    backgroundColor: '#27ae60',
  },
  advButtonText: {
    color: '#27ae60',
    fontSize: 12,
    fontWeight: 'bold',
  },
  advButtonTextActive: {
    color: '#fff',
  },
  disButton: {
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  disButtonActive: {
    backgroundColor: '#e74c3c',
  },
  disButtonText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: 'bold',
  },
  disButtonTextActive: {
    color: '#fff',
  },
  netAdvText: {
    color: '#f39c12',
    fontSize: 12,
    fontWeight: 'bold',
  },
  diceButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  diceButton: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dualButton: {
    backgroundColor: '#8e44ad',
    flex: 2,
  },
  d6Button: {
    flex: 1,
  },
  diceButtonText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  diceButtonSub: {
    color: '#bdc3c7',
    fontSize: 11,
  },
  lastRoll: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dieResult: {
    alignItems: 'center',
  },
  dieLabel: {
    color: '#bdc3c7',
    fontSize: 11,
  },
  dieValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  diePlus: {
    color: '#bdc3c7',
    fontSize: 24,
  },
  resultBox: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  resultText: {
    color: '#f39c12',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
