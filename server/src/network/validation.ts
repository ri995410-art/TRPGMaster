import { z } from 'zod';

// ===== Primitives =====

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const dieValue = z.number().int().min(1).max(12);
const difficultyValue = z.number().int().min(0).max(30);
const nonEmptyString = z.string().min(1).max(5000);
const playerName = z.string().min(1).max(50);
const sessionCode = z.string().length(6).regex(/^[A-Z0-9]+$/);

// ===== Socket Message Envelope =====

export function socketMessageSchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    type: z.string(),
    sessionId: z.string(),
    senderId: z.string(),
    payload: payloadSchema,
    timestamp: z.number(),
  });
}

// ===== Event Payload Schemas =====

export const sessionJoinPayload = z.object({
  role: z.enum(['gm', 'player']),
  name: playerName,
  character: z.any().optional(),
  playerId: z.string().optional(),
});

export const sessionCreatePayload = z.object({
  name: playerName,
  character: z.any().optional(),
});

export const sessionJoinByCodePayload = z.object({
  code: sessionCode,
  name: playerName,
  character: z.any().optional(),
});

export const sessionRejoinPayload = z.object({
  playerId: z.string().min(1),
  name: playerName,
  character: z.any().optional(),
});

export const sessionRejoinByIdPayload = z.object({
  sessionId: z.string().min(1),
  playerId: z.string().min(1),
  name: playerName,
  character: z.any().optional(),
});

export const diceRollPayload = z.object({
  hopeDie: dieValue,
  fearDie: dieValue,
  modifier: z.number().int().min(-20).max(20),
  difficulty: difficultyValue,
});

export const playerActionPayload = z.object({
  action: nonEmptyString,
});

export const playerChoicePayload = z.object({
  choiceId: z.string().min(1),
  choiceText: z.string().min(1),
});

export const chatMessagePayload = z.object({
  text: z.string().min(1).max(2000),
  sender: z.string().min(1),
});

export const playerRestPayload = z.object({
  restType: z.enum(['short', 'long']),
  actions: z.array(z.string()).min(1).max(5),
  projectDescription: z.string().max(500).optional(),
});

export const characterResourceUpdatePayload = z.object({
  resource: z.enum(['hp', 'stress', 'hope', 'armorSlots']),
  delta: z.number().int().min(-100).max(100),
});

export const deathMovePayload = z.object({
  moveType: z.enum(['gloriousSacrifice', 'avoidDeath', 'desperateGamble']),
  hopeDie: dieValue.optional(),
  fearDie: dieValue.optional(),
});

export const levelUpPayload = z.object({
  options: z.array(z.string()).min(1),
  attributeChoices: z.tuple([z.string(), z.string()]).optional(),
  experienceChoices: z.tuple([z.string(), z.string()]).optional(),
  domainCardChoice: z.string().optional(),
});

export const contaminationPayload = z.object({
  level: z.number().int().min(-6).max(6),
});

export const hazeEffectPayload = z.object({
  zone: z.string().min(1).max(100),
});

export const deleriumFoundPayload = z.object({
  quantity: z.number().int().min(1).max(100),
});

export const sealFoundPayload = z.object({
  sealId: z.string().min(1).max(100),
});

export const swapDomainCardPayload = z.object({
  loadoutCardId: z.string().min(1),
  vaultCardId: z.string().min(1),
});

export const combatActionPayload = z.object({
  actionId: z.string().min(1).max(100),
  targetId: z.string().optional(),
});

export const combatAddEnemyPayload = z.object({
  statBlockId: z.string().min(1).max(100),
  name: z.string().max(100).optional(),
});

export const combatSpawnEncounterPayload = z.object({
  difficulty: z.enum(['easy', 'moderate', 'hard', 'deadly']).default('moderate'),
});

export const reactionDeclarePayload = z.object({
  reactionType: z.enum(['shieldBlock', 'opportunityAttack', 'traitReaction', 'domainCardReaction', 'uncannyDodge']),
  hopeDie: z.number().int().min(1).max(12).optional(),
  fearDie: z.number().int().min(1).max(12).optional(),
  armorSlotsToSpend: z.number().int().min(0).max(5).optional(),
  sourceId: z.string().max(100).optional(),
});

export const actionUseFeaturePayload = z.object({
  featureId: z.string().min(1),
  featureType: z.string().min(1),
  action: z.string().min(1),
  targetId: z.string().optional(),
  attribute: z.string().optional(),
});

export const lootPickupPayload = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(50),
});

export const spotlightPassPayload = z.object({
  targetPlayerId: z.string().optional(),
});

export const s0SubmitPayload = z.object({
  lines: z.array(z.string()),
  veils: z.array(z.string()),
  toneFlags: z.array(z.string()),
});

export const characterUpdatePayload = z.object({
  characterId: z.string().min(1),
  updates: z.record(z.unknown()).refine(
    (obj) => {
      const forbidden = ['id', '_id'];
      return !forbidden.some(key => key in obj);
    },
    { message: 'Cannot overwrite character id fields' },
  ),
});

// ===== REST API Schemas =====

export const aiConfigUpdateSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  defaultModel: z.string().min(1),
  narratorModel: z.string().optional(),
  combatModel: z.string().optional(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(256).max(1048576),
});

// ===== Validation Helper =====

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function validatePayload<T>(schema: z.ZodType<T>, payload: unknown): ValidationResult<T> {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const error = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { success: false, error };
}
