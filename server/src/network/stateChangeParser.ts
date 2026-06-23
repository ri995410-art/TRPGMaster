/**
 * State change parser — pure functions extracted from SocketServer for testability
 * Parses [STATE] markers and choice options from AI GM responses
 */

export interface StateChange {
  characterName?: string;
  changes: Record<string, number>;
}

export interface AIChoice {
  id: string;
  label: string;
  action?: string;
}

/**
 * Extract state changes from AI response [STATE] lines
 * Returns clean content (without [STATE] lines) and parsed state changes
 */
export function extractStateChanges(content: string): { cleanContent: string; stateChanges: StateChange[] } {
  const stateChanges: StateChange[] = [];
  const lines = content.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Match [STATE:CharacterName] key:value key:value or [STATE] key:value
    const namedMatch = trimmed.match(/^\[STATE:(.+?)\]\s*(.+)$/);
    const unnamedMatch = trimmed.match(/^\[STATE\]\s*(.+)$/);

    if (namedMatch) {
      const characterName = namedMatch[1].trim();
      const changes = parseStateKeyValue(namedMatch[2]);
      if (Object.keys(changes).length > 0) {
        stateChanges.push({ characterName, changes });
      }
    } else if (unnamedMatch) {
      const changes = parseStateKeyValue(unnamedMatch[1]);
      if (Object.keys(changes).length > 0) {
        stateChanges.push({ changes });
      }
    } else {
      cleanLines.push(line);
    }
  }

  return { cleanContent: cleanLines.join('\n').trim(), stateChanges };
}

/**
 * Parse "key:value key:value" pairs into a record
 */
export function parseStateKeyValue(text: string): Record<string, number> {
  const changes: Record<string, number> = {};
  const pairs = text.trim().split(/\s+/);
  for (const pair of pairs) {
    const match = pair.match(/^(\w+):([+-]?\d+)$/);
    if (match) {
      changes[match[1]] = parseInt(match[2], 10);
    }
  }
  return changes;
}

/**
 * Extract choice options from AI response text
 */
export function extractChoices(content: string): AIChoice[] | undefined {
  const choices: AIChoice[] = [];

  // Match numbered options: 1) xxx, 1. xxx, ① xxx
  const numberedMatch = content.match(/(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨])\s*.+/g);
  if (numberedMatch && numberedMatch.length >= 2) {
    for (let i = 0; i < Math.min(numberedMatch.length, 4); i++) {
      const label = numberedMatch[i].replace(/^(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨])\s*/, '').trim();
      choices.push({ id: `choice_${i + 1}`, label, action: label });
    }
    return choices;
  }

  // Match bracketed options: 【xxx】 or [xxx]
  const bracketMatch = content.match(/[【\[][^】\]]+[】\]]/g);
  if (bracketMatch && bracketMatch.length >= 2) {
    for (let i = 0; i < Math.min(bracketMatch.length, 4); i++) {
      const label = bracketMatch[i].replace(/[【\[】\]]/g, '').trim();
      choices.push({ id: `choice_${i + 1}`, label, action: label });
    }
    return choices;
  }

  return undefined;
}

/**
 * Apply parsed state changes to a StateManager
 * Handles HP/stress/hope/fearPoints with proper clamping and overflow logic
 */
export function applyStateChanges(
  stateManager: import('../core/StateManager').StateManager,
  playerId: string,
  stateChanges: StateChange[],
): void {
  for (const sc of stateChanges) {
    // Find the target character — by name if specified, else use current player
    let targetPlayerId = playerId;
    if (sc.characterName) {
      const players = stateManager.getPlayers();
      const found = players.find(p => p.character?.name === sc.characterName);
      if (found) targetPlayerId = found.id;
    }

    const char = stateManager.getPlayerCharacter(targetPlayerId);
    if (!char) continue;

    for (const [key, delta] of Object.entries(sc.changes)) {
      switch (key) {
        case 'hp':
          if (targetPlayerId === stateManager.getPlayers()[0]?.id) {
            stateManager.updateCharacterHp(delta);
          } else {
            const newHp = Math.max(0, Math.min(char.maxHp, char.hp + delta));
            stateManager.updatePlayerCharacter(targetPlayerId, { hp: newHp });
          }
          break;
        case 'stress':
          if (targetPlayerId === stateManager.getPlayers()[0]?.id) {
            stateManager.updateCharacterStress(delta);
          } else {
            const newStress = char.stress + delta;
            if (newStress > char.maxStress) {
              const overflow = newStress - char.maxStress;
              stateManager.updatePlayerCharacter(targetPlayerId, {
                stress: char.maxStress,
                hp: Math.max(0, char.hp - overflow),
              });
            } else {
              stateManager.updatePlayerCharacter(targetPlayerId, {
                stress: Math.max(0, newStress),
              });
            }
          }
          break;
        case 'hope':
          if (targetPlayerId === stateManager.getPlayers()[0]?.id) {
            stateManager.updateCharacterHope(delta);
          } else {
            const newHope = Math.max(0, Math.min(char.maxHope, char.hope + delta));
            stateManager.updatePlayerCharacter(targetPlayerId, { hope: newHope });
          }
          break;
        case 'fearPoints':
          if (delta > 0) {
            stateManager.addFearPoints(delta);
          } else if (delta < 0) {
            stateManager.spendFearPoints(Math.abs(delta));
          }
          break;
      }
    }
  }
}
