import { Router } from 'express';
import classes from '../rules/data/daggerheart/classes.json';
import ancestries from '../rules/data/daggerheart/ancestries.json';
import communities from '../rules/data/daggerheart/communities.json';
import weapons from '../rules/data/daggerheart/weapons.json';
import armor from '../rules/data/daggerheart/armor.json';
import domains from '../rules/data/daggerheart/domains.json';
import enemies from '../rules/data/daggerheart/enemies.json';
import subclasses from '../rules/data/daggerheart/subclasses.json';
import loot from '../rules/data/daggerheart/loot.json';
import consumables from '../rules/data/daggerheart/consumables.json';
import factions from '../campaign/data/factions.json';
import locations from '../campaign/data/locations.json';
import npcs from '../campaign/data/npcs.json';

export function createDataRouter(): Router {
  const router = Router();

  router.get('/api/data/classes', (_req, res) => res.json(classes));
  router.get('/api/data/ancestries', (_req, res) => res.json(ancestries));
  router.get('/api/data/communities', (_req, res) => res.json(communities));
  router.get('/api/data/weapons', (_req, res) => res.json(weapons));
  router.get('/api/data/armor', (_req, res) => res.json(armor));
  router.get('/api/data/domains', (_req, res) => res.json(domains));
  router.get('/api/data/enemies', (_req, res) => res.json(enemies));
  router.get('/api/data/subclasses', (_req, res) => res.json(subclasses));
  router.get('/api/data/factions', (_req, res) => res.json(factions));
  router.get('/api/data/locations', (_req, res) => res.json(locations));
  router.get('/api/data/npcs', (_req, res) => res.json(npcs));
  router.get('/api/data/loot', (_req, res) => res.json(loot));
  router.get('/api/data/consumables', (_req, res) => res.json(consumables));

  return router;
}
