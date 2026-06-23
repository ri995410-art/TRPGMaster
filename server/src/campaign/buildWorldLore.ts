import type { WorldLore, LocationData, Faction, NPC } from '@trpgmaster/shared';
import factionsData from './data/factions.json';
import locationsData from './data/locations.json';
import npcsData from './data/npcs.json';

const DANGER_LEVEL_MAP: Record<number, LocationData['dangerLevel']> = {
  1: 'safe',
  2: 'low',
  3: 'moderate',
  4: 'high',
  5: 'extreme',
};

export function buildWorldLore(): WorldLore {
  const locations: LocationData[] = (locationsData as Array<Record<string, unknown>>).map(loc => ({
    id: loc.id as string,
    name: loc.name as string,
    nameEn: loc.nameEn as string | undefined,
    description: loc.description as string,
    dangerLevel: DANGER_LEVEL_MAP[loc.dangerLevel as number] || 'moderate',
    features: loc.features as string[],
    connections: loc.connections as string[],
    hazeLevel: loc.hazeLevel as 'none' | 'light' | 'moderate' | 'heavy' | undefined,
    contaminationRisk: loc.contaminationRisk as number | undefined,
    deleriumPresence: loc.deleriumPresence as 'none' | 'trace' | 'moderate' | 'abundant' | undefined,
  }));

  const npcs: NPC[] = (npcsData as Array<Record<string, unknown>>).map(npc => ({
    id: npc.id as string,
    name: npc.name as string,
    nameEn: npc.nameEn as string | undefined,
    factionId: (npc.factionId as string | null) || undefined,
    role: npc.role as string,
    personality: npc.personality as string,
    motivation: npc.motivation as string,
    secrets: npc.secrets as string[],
    stressSlots: npc.stressSlots as number,
    currentStress: npc.currentStress as number,
    locationId: npc.locationId as string | undefined,
  }));

  return {
    campaignId: 'drakkenheim',
    campaignName: '德拉肯海姆',
    overview: '德拉肯海姆是坐落在灰烬荒原边缘的废墟城市，被神秘的陨石雨摧毁。幸存者在残骸中搜寻，五大派系争夺陨石碎片的秘密。迷雾蔓延，翠晶闪烁，封印等待被发现。',
    themes: ['暗黑奇幻', '生存', '派系政治', '探索'],
    tone: 'dark',
    locations,
    factions: factionsData as Faction[],
    npcs,
    customRules: [
      '污染系统：0-6级，3级和5级抽变异卡，6级=异变',
      '翠晶：有价值的魔法矿物，拾取有污染风险',
      '迷雾：探索倒计时，暴露需反应掷骰',
    ],
    timeline: [],
  };
}
