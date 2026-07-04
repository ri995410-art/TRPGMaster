/**
 * Enemy data validator and exporter
 * Reads enemies.json, validates each entry against the EnemyStatBlock schema,
 * converts to CombatEnemy format, and outputs a complete validated JSON.
 *
 * Run: npx ts-node src/rules/systems/exportEnemyData.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { statBlockToCombatEnemy } from './encounterSpawner';
import type { EnemyStatBlock, CombatEnemy } from '@trpgmaster/shared';

interface ExportResult {
  version: string;
  generatedAt: string;
  totalEnemies: number;
  byTier: Record<number, number>;
  byType: Record<string, number>;
  enemies: CombatEnemy[];
  statBlocks: EnemyStatBlock[];
  validationErrors: string[];
}

function main(): void {
  const enemiesPath = path.resolve(__dirname, '../data/daggerheart/enemies.json');
  const outputPath = path.resolve(__dirname, '../../../../shared/data/enemies_validated.json');

  console.log('Reading enemies.json...');
  const raw = fs.readFileSync(enemiesPath, 'utf-8');
  const statBlocks: EnemyStatBlock[] = JSON.parse(raw);

  const errors: string[] = [];
  const combatEnemies: CombatEnemy[] = [];
  const byTier: Record<number, number> = {};
  const byType: Record<string, number> = {};

  for (const sb of statBlocks) {
    // Validate required fields
    if (!sb.id) errors.push(`Missing id on entry: ${JSON.stringify(sb).substring(0, 80)}`);
    if (!sb.name) errors.push(`Missing name on ${sb.id}`);
    if (!sb.type) errors.push(`Missing type on ${sb.id}`);
    if (!sb.behavior) errors.push(`Missing behavior on ${sb.id}`);
    if (!sb.tier || sb.tier < 1 || sb.tier > 4) errors.push(`Invalid tier on ${sb.id}: ${sb.tier}`);
    if (sb.hp <= 0) errors.push(`Invalid hp on ${sb.id}: ${sb.hp}`);
    if (sb.difficulty < 8 || sb.difficulty > 25) errors.push(`Unusual difficulty on ${sb.id}: ${sb.difficulty}`);
    if (!sb.attacks?.length) errors.push(`No attacks on ${sb.id}`);

    // Validate thresholds for non-minions
    if (sb.type !== 'minion') {
      if (!sb.majorThreshold) errors.push(`Missing majorThreshold on non-minion ${sb.id}`);
      if (!sb.severeThreshold) errors.push(`Missing severeThreshold on non-minion ${sb.id}`);
    }

    // Validate minion-specific fields
    if (sb.type === 'minion') {
      if (sb.hp !== 1) errors.push(`Minion ${sb.id} should have 1 HP, got ${sb.hp}`);
      if (sb.stress !== 1) errors.push(`Minion ${sb.id} should have 1 stress, got ${sb.stress}`);
    }

    // Count
    byTier[sb.tier] = (byTier[sb.tier] || 0) + 1;
    byType[sb.type] = (byType[sb.type] || 0) + 1;

    // Convert to CombatEnemy
    const combatEnemy = statBlockToCombatEnemy(sb, statBlocks.indexOf(sb));
    combatEnemies.push(combatEnemy);
  }

  const result: ExportResult = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalEnemies: statBlocks.length,
    byTier,
    byType,
    enemies: combatEnemies,
    statBlocks,
    validationErrors: errors,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\nValidation complete:`);
  console.log(`  Total enemies: ${statBlocks.length}`);
  console.log(`  By tier: ${JSON.stringify(byTier)}`);
  console.log(`  By type: ${JSON.stringify(byType)}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    errors.forEach(e => console.log(`    - ${e}`));
  } else {
    console.log('  No validation errors!');
  }
  console.log(`\nOutput written to: ${outputPath}`);
}

main();
