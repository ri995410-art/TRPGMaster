/**
 * Data validation tool — validates Daggerheart JSON data at startup
 *
 * Checks:
 * - Field completeness (required fields present)
 * - Reference integrity (foreign keys point to valid targets)
 * - Value range checks (numbers within expected bounds)
 *
 * On error: logs warning, returns list of issues. Never crashes.
 */

import type { ClassData, AncestryData, CommunityData, WeaponData, ArmorData, DomainCard, EnemyStatBlock } from '@trpgmaster/shared';
import type { SubclassData } from '@trpgmaster/shared';

export interface ValidationIssue {
  file: string;
  id?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

// ===== Individual validators =====

function validateRequired(obj: Record<string, unknown>, fields: string[], id: string, file: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      issues.push({ file, id, field, message: `Missing required field: ${field}`, severity: 'error' });
    }
  }
  return issues;
}

function validateNumberRange(obj: Record<string, unknown>, field: string, min: number, max: number, id: string, file: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const val = obj[field];
  if (val !== undefined && val !== null) {
    if (typeof val !== 'number' || val < min || val > max) {
      issues.push({ file, id, field, message: `${field} must be a number between ${min} and ${max}, got ${val}`, severity: 'error' });
    }
  }
  return issues;
}

function validateStringEnum(obj: Record<string, unknown>, field: string, allowed: string[], id: string, file: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const val = obj[field];
  if (val !== undefined && val !== null) {
    if (!allowed.includes(val as string)) {
      issues.push({ file, id, field, message: `${field} must be one of [${allowed.join(', ')}], got "${val}"`, severity: 'error' });
    }
  }
  return issues;
}

// ===== Collection validators =====

function validateClasses(data: ClassData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const VALID_DOMAINS = ['arcane', 'blade', 'bone', 'codex', 'elegance', 'midnight', 'sage', 'splendor', 'valor'];

  for (const cls of data) {
    const obj = cls as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn', 'baseEvasion', 'baseHp', 'baseStress'], cls.id, 'classes'));
    issues.push(...validateNumberRange(obj, 'baseEvasion', 5, 15, cls.id, 'classes'));
    issues.push(...validateNumberRange(obj, 'baseHp', 1, 15, cls.id, 'classes'));
    issues.push(...validateNumberRange(obj, 'baseStress', 1, 10, cls.id, 'classes'));

    if (cls.domains) {
      for (const domain of cls.domains) {
        if (!VALID_DOMAINS.includes(domain)) {
          issues.push({ file: 'classes', id: cls.id, field: 'domains', message: `Invalid domain: ${domain}`, severity: 'error' });
        }
      }
    }

    if (cls.subclassIds) {
      if (cls.subclassIds.length !== 2) {
        issues.push({ file: 'classes', id: cls.id, field: 'subclassIds', message: `Must have exactly 2 subclass IDs, got ${cls.subclassIds.length}`, severity: 'warning' });
      }
    }
  }

  return issues;
}

function validateAncestries(data: AncestryData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const anc of data) {
    const obj = anc as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn'], anc.id, 'ancestries'));

    if (!anc.features || anc.features.length === 0) {
      issues.push({ file: 'ancestries', id: anc.id, field: 'features', message: 'Ancestry must have at least 1 feature', severity: 'error' });
    } else {
      for (const feat of anc.features) {
        issues.push(...validateStringEnum(feat as unknown as Record<string, unknown>, 'type', ['trait', 'action', 'passive'], `${anc.id}/${feat.name}`, 'ancestries'));
      }
    }
  }

  return issues;
}

function validateCommunities(data: CommunityData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const com of data) {
    const obj = com as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn'], com.id, 'communities'));

    if (com.feature) {
      issues.push(...validateStringEnum(com.feature as unknown as Record<string, unknown>, 'type', ['passive', 'action'], `${com.id}/feature`, 'communities'));
    } else {
      issues.push({ file: 'communities', id: com.id, field: 'feature', message: 'Community must have a feature', severity: 'error' });
    }
  }

  return issues;
}

function validateWeapons(data: WeaponData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const VALID_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];
  const VALID_LOADS = ['oneHanded', 'twoHanded', 'offHand'];
  const VALID_ATTRIBUTES = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

  for (const wpn of data) {
    const obj = wpn as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn', 'damageDie'], wpn.id, 'weapons'));
    issues.push(...validateStringEnum(obj, 'damageDie', VALID_DICE, wpn.id, 'weapons'));
    issues.push(...validateStringEnum(obj, 'load', VALID_LOADS, wpn.id, 'weapons'));
    issues.push(...validateStringEnum(obj, 'attribute', VALID_ATTRIBUTES, wpn.id, 'weapons'));
    issues.push(...validateNumberRange(obj, 'weaponTier', 1, 5, wpn.id, 'weapons'));
  }

  return issues;
}

function validateArmor(data: ArmorData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const arm of data) {
    const obj = arm as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn', 'baseThreshold', 'baseThresholdSevere', 'armorSlots'], arm.id, 'armor'));
    issues.push(...validateNumberRange(obj, 'baseThreshold', 1, 20, arm.id, 'armor'));
    issues.push(...validateNumberRange(obj, 'baseThresholdSevere', 2, 30, arm.id, 'armor'));
    issues.push(...validateNumberRange(obj, 'armorSlots', 1, 6, arm.id, 'armor'));
    issues.push(...validateNumberRange(obj, 'evasionPenalty', -3, 0, arm.id, 'armor'));

    if (arm.baseThresholdSevere <= arm.baseThreshold) {
      issues.push({ file: 'armor', id: arm.id, field: 'baseThresholdSevere', message: `Severe threshold (${arm.baseThresholdSevere}) must be greater than minor threshold (${arm.baseThreshold})`, severity: 'error' });
    }
  }

  return issues;
}

function validateDomainCards(data: DomainCard[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const VALID_DOMAINS = ['arcane', 'blade', 'bone', 'codex', 'elegance', 'midnight', 'sage', 'splendor', 'valor'];
  const VALID_TYPES = ['ability', 'spell', 'grimoire'];

  for (const card of data) {
    const obj = card as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn', 'domain', 'level', 'type'], card.id, 'domains'));
    issues.push(...validateStringEnum(obj, 'domain', VALID_DOMAINS, card.id, 'domains'));
    issues.push(...validateStringEnum(obj, 'type', VALID_TYPES, card.id, 'domains'));
    issues.push(...validateNumberRange(obj, 'level', 1, 10, card.id, 'domains'));
    issues.push(...validateNumberRange(obj, 'recallCost', 0, 10, card.id, 'domains'));
  }

  return issues;
}

function validateEnemies(data: EnemyStatBlock[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const VALID_BEHAVIORS = ['bruiser', 'leader', 'support', 'solo', 'ambusher', 'caster'];
  const VALID_TYPES = ['minion', 'horde', 'elite', 'solo', 'boss'];
  const VALID_ATTRIBUTES = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

  for (const enemy of data) {
    const obj = enemy as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn', 'type', 'behavior', 'difficulty', 'evasion', 'hp', 'maxHp'], enemy.id, 'enemies'));
    issues.push(...validateStringEnum(obj, 'type', VALID_TYPES, enemy.id, 'enemies'));
    issues.push(...validateStringEnum(obj, 'behavior', VALID_BEHAVIORS, enemy.id, 'enemies'));
    issues.push(...validateNumberRange(obj, 'difficulty', 5, 30, enemy.id, 'enemies'));
    issues.push(...validateNumberRange(obj, 'evasion', 5, 20, enemy.id, 'enemies'));

    if (enemy.hp > enemy.maxHp) {
      issues.push({ file: 'enemies', id: enemy.id, field: 'hp', message: `hp (${enemy.hp}) exceeds maxHp (${enemy.maxHp})`, severity: 'error' });
    }

    if (enemy.attacks) {
      for (let i = 0; i < enemy.attacks.length; i++) {
        const atk = enemy.attacks[i] as unknown as Record<string, unknown>;
        issues.push(...validateStringEnum(atk, 'attribute', VALID_ATTRIBUTES, `${enemy.id}/attacks[${i}]`, 'enemies'));

        if (enemy.attacks[i].damage) {
          const dmg = enemy.attacks[i].damage;
          if (!dmg.dice || !Array.isArray(dmg.dice) || dmg.dice.length === 0) {
            issues.push({ file: 'enemies', id: `${enemy.id}/attacks[${i}]`, field: 'damage.dice', message: 'Attack must have at least one damage die', severity: 'error' });
          }
        }
      }
    } else {
      issues.push({ file: 'enemies', id: enemy.id, field: 'attacks', message: 'Enemy must have at least one attack', severity: 'error' });
    }

    // 验证阈值字段
    if (enemy.type === 'minion') {
      // 杂兵：不应有阈值字段，应有minionDefeatThreshold
      if (enemy.majorThreshold != null) {
        issues.push({ file: 'enemies', id: enemy.id, field: 'majorThreshold', message: 'Minion should not have majorThreshold', severity: 'warning' });
      }
      if (enemy.severeThreshold != null) {
        issues.push({ file: 'enemies', id: enemy.id, field: 'severeThreshold', message: 'Minion should not have severeThreshold', severity: 'warning' });
      }
    } else {
      // 非杂兵：应有阈值字段
      if (enemy.majorThreshold == null) {
        issues.push({ file: 'enemies', id: enemy.id, field: 'majorThreshold', message: 'Non-minion enemy should have majorThreshold', severity: 'warning' });
      }
      if (enemy.severeThreshold == null) {
        issues.push({ file: 'enemies', id: enemy.id, field: 'severeThreshold', message: 'Non-minion enemy should have severeThreshold', severity: 'warning' });
      }
      if (enemy.majorThreshold != null && enemy.severeThreshold != null && enemy.severeThreshold <= enemy.majorThreshold) {
        issues.push({ file: 'enemies', id: enemy.id, field: 'severeThreshold', message: `severeThreshold (${enemy.severeThreshold}) must be greater than majorThreshold (${enemy.majorThreshold})`, severity: 'error' });
      }
    }
  }

  return issues;
}

function validateSubclasses(data: SubclassData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const sub of data) {
    const obj = sub as unknown as Record<string, unknown>;
    issues.push(...validateRequired(obj, ['id', 'name', 'nameEn', 'classId', 'description'], sub.id, 'subclasses'));

    if (sub.features) {
      issues.push(...validateRequired(sub.features as unknown as Record<string, unknown>, ['base', 'advanced', 'mastery'], `${sub.id}/features`, 'subclasses'));
    }
  }

  return issues;
}

// ===== Cross-reference validators =====

function validateCrossReferences(allData: {
  classes: ClassData[];
  ancestries: AncestryData[];
  communities: CommunityData[];
  weapons: WeaponData[];
  armor: ArmorData[];
  domains: DomainCard[];
  enemies: EnemyStatBlock[];
  subclasses: SubclassData[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const classIds = new Set(allData.classes.map(c => c.id));
  const subclassIds = new Set(allData.subclasses.map(s => s.id));
  const domainIds = new Set(allData.domains.map(d => d.id));

  // Check class → subclass references
  for (const cls of allData.classes) {
    if (cls.subclassIds) {
      for (const subId of cls.subclassIds) {
        if (!subclassIds.has(subId)) {
          issues.push({ file: 'classes', id: cls.id, field: 'subclassIds', message: `References non-existent subclass: ${subId}`, severity: 'error' });
        }
      }
    }
  }

  // Check subclass → class references
  for (const sub of allData.subclasses) {
    if (!classIds.has(sub.classId)) {
      issues.push({ file: 'subclasses', id: sub.id, field: 'classId', message: `References non-existent class: ${sub.classId}`, severity: 'error' });
    }
  }

  // Check domain card domain values
  for (const card of allData.domains) {
    const validDomains = new Set(['arcane', 'blade', 'bone', 'codex', 'elegance', 'midnight', 'sage', 'splendor', 'valor']);
    if (!validDomains.has(card.domain)) {
      issues.push({ file: 'domains', id: card.id, field: 'domain', message: `Invalid domain: ${card.domain}`, severity: 'error' });
    }
  }

  return issues;
}

// ===== Main validation entry point =====

export interface DataValidationResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export function validateAllData(allData: {
  classes: ClassData[];
  ancestries: AncestryData[];
  communities: CommunityData[];
  weapons: WeaponData[];
  armor: ArmorData[];
  domains: DomainCard[];
  enemies: EnemyStatBlock[];
  subclasses: SubclassData[];
}): DataValidationResult {
  const issues: ValidationIssue[] = [];

  try { issues.push(...validateClasses(allData.classes)); } catch (e) { issues.push({ file: 'classes', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateAncestries(allData.ancestries)); } catch (e) { issues.push({ file: 'ancestries', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateCommunities(allData.communities)); } catch (e) { issues.push({ file: 'communities', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateWeapons(allData.weapons)); } catch (e) { issues.push({ file: 'weapons', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateArmor(allData.armor)); } catch (e) { issues.push({ file: 'armor', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateDomainCards(allData.domains)); } catch (e) { issues.push({ file: 'domains', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateEnemies(allData.enemies)); } catch (e) { issues.push({ file: 'enemies', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateSubclasses(allData.subclasses)); } catch (e) { issues.push({ file: 'subclasses', message: `Validation failed: ${e}`, severity: 'error' }); }
  try { issues.push(...validateCrossReferences(allData)); } catch (e) { issues.push({ file: 'crossref', message: `Cross-reference validation failed: ${e}`, severity: 'error' }); }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
  };
}

/**
 * Log validation results to console
 */
export function logValidationResults(result: DataValidationResult): void {
  if (result.issues.length === 0) {
    console.log('[DataValidator] All data files valid ✓');
    return;
  }

  for (const issue of result.issues) {
    const prefix = issue.severity === 'error' ? '✕' : '⚠';
    const id = issue.id ? ` [${issue.id}]` : '';
    const field = issue.field ? ` .${issue.field}` : '';
    console.warn(`[DataValidator] ${prefix} ${issue.file}${id}${field}: ${issue.message}`);
  }

  console.log(`[DataValidator] ${result.errorCount} errors, ${result.warningCount} warnings — ${result.valid ? 'OK' : 'DATA ISSUES FOUND'}`);
}
