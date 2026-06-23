import { Router } from 'express';
import type { StateManager } from '../core/StateManager';
import type { SocketServer } from '../network/SocketServer';
import { CharacterCreator } from '../core/CharacterCreator';
import { CharacterLevelUp } from '../core/CharacterLevelUp';
import type { LevelUpRequest } from '../core/CharacterLevelUp';
import type { Character } from '@trpgmaster/shared';

export function createCharacterRouter(
  stateManager: StateManager,
  socketServer: SocketServer,
): Router {
  const router = Router();

  router.get('/api/character', (_req, res) => {
    const char = stateManager.getCharacter();
    if (char) {
      res.json(char);
    } else {
      res.json(null);
    }
  });

  router.put('/api/character', (req, res) => {
    const character = req.body;
    if (!character || !character.id || !character.name) {
      res.status(400).json({ errors: ['无效的角色数据'] });
      return;
    }
    stateManager.setCharacter(character);
    socketServer.broadcastState(stateManager.getState());
    console.log(`Character set: ${character.name} (${character.classId})`);
    res.json({ character: stateManager.getCharacter() });
  });

  router.post('/api/character/validate', (req, res) => {
    const { step, data } = req.body as { step: number; data: Record<string, unknown> };
    const creator = new CharacterCreator();
    creator.setStepData(data);
    creator.goToStep(step);
    const errors = creator.validateCurrentStep();
    res.json({ valid: Object.keys(errors).length === 0, errors });
  });

  router.post('/api/character/create', (req, res) => {
    const { data } = req.body as { data: Record<string, unknown> };
    const creator = new CharacterCreator();
    creator.setStepData(data);
    const { character, errors } = creator.buildCharacter();
    if (errors.length > 0) {
      res.status(400).json({ errors });
    } else {
      stateManager.setCharacter(character);
      socketServer.broadcastState(stateManager.getState());
      res.json({ character });
    }
  });

  router.post('/api/character/levelup', (req, res) => {
    const { newLevel, options, attributeChoices, experienceChoices, domainCardChoice, domainCardSwap } =
      req.body as {
        newLevel: number;
        options: string[];
        attributeChoices?: [string, string];
        experienceChoices?: [string, string];
        domainCardChoice?: string;
        domainCardSwap?: { add: string; remove: string };
      };

    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const request: LevelUpRequest = {
      characterId: character.id,
      newLevel,
      options: options as any[],
      attributeChoices: attributeChoices as any,
      experienceChoices,
      domainCardChoice,
      domainCardSwap,
    };

    const result = CharacterLevelUp.levelUp(character, request);
    if (!result.success || !result.character) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    stateManager.setCharacter(result.character);
    socketServer.broadcastState(stateManager.getState());

    res.json({
      character: result.character,
      tierChanged: result.tierChanged,
      oldTier: result.oldTier,
      newTier: result.newTier,
    });
  });

  router.get('/api/character/levelup-options', (_req, res) => {
    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }
    const options = CharacterLevelUp.getAvailableOptions(character);
    const bonuses = CharacterLevelUp.getTierAdvancementBonuses(character.level + 1);
    res.json({ options, nextLevel: character.level + 1, bonuses });
  });

  router.post('/api/character/inventory/add', (req, res) => {
    const { itemId, name, quantity, description } = req.body as {
      itemId?: string;
      name?: string;
      quantity?: number;
      description?: string;
    };

    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const item = {
      id: itemId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name || '未命名物品',
      quantity: quantity || 1,
      description: description || '',
      equipped: false,
    };

    const existing = character.inventory.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      character.inventory.push(item);
    }

    stateManager.setCharacter(character);
    socketServer.broadcastState(stateManager.getState());

    res.json({ character, itemAdded: item });
  });

  router.post('/api/character/inventory/remove', (req, res) => {
    const { itemId, quantity } = req.body as { itemId: string; quantity?: number };

    const character = stateManager.getCharacter();
    if (!character) {
      res.status(404).json({ errors: ['角色不存在'] });
      return;
    }

    const itemIndex = character.inventory.findIndex(i => i.id === itemId);
    if (itemIndex < 0) {
      res.status(404).json({ errors: ['物品不存在'] });
      return;
    }

    const removeQty = quantity || character.inventory[itemIndex].quantity;
    if (removeQty >= character.inventory[itemIndex].quantity) {
      character.inventory.splice(itemIndex, 1);
    } else {
      character.inventory[itemIndex].quantity -= removeQty;
    }

    stateManager.setCharacter(character);
    socketServer.broadcastState(stateManager.getState());

    res.json({ character });
  });

  return router;
}
