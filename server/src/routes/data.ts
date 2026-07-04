import { Router } from 'express';
import { getDataProvider } from '../rules/DataProviderRegistry';
import { getRulesEngine, listRulesSystems } from '../rules/RulesEngineFactory';
import factions from '../campaign/data/factions.json';
import locations from '../campaign/data/locations.json';
import npcs from '../campaign/data/npcs.json';

export function createDataRouter(): Router {
  const router = Router();
  const data = getDataProvider('daggerheart').loadData();

  router.get('/api/data/classes', (_req, res) => res.json(data.classes));
  router.get('/api/data/ancestries', (_req, res) => res.json(data.ancestries));
  router.get('/api/data/communities', (_req, res) => res.json(data.communities));
  router.get('/api/data/weapons', (_req, res) => res.json(data.weapons));
  router.get('/api/data/armor', (_req, res) => res.json(data.armor));
  router.get('/api/data/domains', (_req, res) => res.json(data.domains));
  router.get('/api/data/enemies', (_req, res) => res.json(data.enemies));
  router.get('/api/data/subclasses', (_req, res) => res.json(data.subclasses));
  router.get('/api/data/factions', (_req, res) => res.json(factions));
  router.get('/api/data/locations', (_req, res) => res.json(locations));
  router.get('/api/data/npcs', (_req, res) => res.json(npcs));
  router.get('/api/data/loot', (_req, res) => res.json(data.loot));
  router.get('/api/data/consumables', (_req, res) => res.json(data.consumables));

  // Multi-rule system endpoints
  router.get('/api/data/creation-flow', (req, res) => {
    const systemId = (req.query.systemId as string) || 'daggerheart';
    try {
      const engine = getRulesEngine(systemId);
      res.json(engine.getCreationFlow());
    } catch {
      res.status(404).json({ error: `Unknown rules system: ${systemId}` });
    }
  });

  router.get('/api/data/systems', (_req, res) => {
    res.json(listRulesSystems());
  });

  return router;
}
