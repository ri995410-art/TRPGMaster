/**
 * 德拉肯海姆战役主控制器
 * 管理战役状态、章节推进、地点切换、派系交互
 */
import type {
  CampaignState,
  CampaignChapter,
  DrakkenheimLocation,
  Faction,
  NPC,
  PersonalQuest,
  QuestProgress,
  Countdown,
  Character,
  SessionState,
} from '@trpgmaster/shared';
import {
  getFactionRelationLevel,
  DRAKKENHEIM_FACTION_LABELS,
} from '@trpgmaster/shared';
import type { DrakkenheimFactionId } from '@trpgmaster/shared';

// ===== 战役数据 =====

export interface DrakkenheimCampaignData {
  factions: Faction[];
  locations: DrakkenheimLocation[];
  npcs: NPC[];
  personalQuests: PersonalQuest[];
  monsters: unknown[];
  contaminationEffects: unknown[];
  deleriumData: unknown[];
  magicItems: unknown[];
}

// ===== 战役控制器 =====

export class DrakkenheimCampaign {
  private data: DrakkenheimCampaignData;

  constructor(data: DrakkenheimCampaignData) {
    this.data = data;
  }

  // ===== 战役初始化 =====

  /**
   * 创建初始战役状态
   */
  createInitialState(character: Character): CampaignState {
    // 根据角色的个人任务确定起始位置
    const startingLocation = 'ember-village'; // 余烬村

    return {
      campaignId: 'drakkenheim',
      currentLocation: startingLocation,
      visitedLocations: [startingLocation],
      factionRelations: {
        hoodedLanterns: 5,   // 中立
        queensMen: 5,        // 中立
        silverOrder: 5,      // 中立
        fallingFire: 5,      // 中立
        amethystAcademy: 5,  // 中立
      },
      personalQuestProgress: {},
      factionQuestProgress: {},
      contaminationLevel: 0,
      deleriumCollected: 0,
      sealsFound: [],
      currentChapter: 'arrival',
      hazeExpansion: 0,
      narrativeFlags: {},
    };
  }

  // ===== 地点管理 =====

  /**
   * 获取当前地点
   */
  getCurrentLocation(state: CampaignState): DrakkenheimLocation | undefined {
    return this.data.locations.find(l => l.id === state.currentLocation);
  }

  /**
   * 获取可前往的地点
   */
  getAccessibleLocations(state: CampaignState): DrakkenheimLocation[] {
    const current = this.getCurrentLocation(state);
    if (!current) return [];

    // 返回已连接的地点
    return current.connections
      .map(id => this.data.locations.find(l => l.id === id))
      .filter((l): l is DrakkenheimLocation => l !== undefined);
  }

  /**
   * 移动到新地点
   */
  moveToLocation(state: CampaignState, locationId: string): CampaignState {
    const location = this.data.locations.find(l => l.id === locationId);
    if (!location) return state;

    const visitedLocations = state.visitedLocations.includes(locationId)
      ? state.visitedLocations
      : [...state.visitedLocations, locationId];

    // 根据新地点更新章节
    const currentChapter = this.determineChapter(state, location);

    return {
      ...state,
      currentLocation: locationId,
      visitedLocations,
      currentChapter,
    };
  }

  /**
   * 根据地点和进度确定当前章节
   */
  private determineChapter(state: CampaignState, location?: DrakkenheimLocation): CampaignChapter {
    // 如果已经到了更高章节，不会倒退
    const chapterOrder: CampaignChapter[] = [
      'arrival', 'outerCity', 'firstFactions', 'innerCity',
      'factionConflict', 'strongholds', 'finalExpedition', 'fate',
    ];

    const currentIdx = chapterOrder.indexOf(state.currentChapter);

    // 根据访问过的地点和完成的事件判断是否进入下一章节
    if (state.visitedLocations.some(l => l.includes('inner'))) {
      const idx = chapterOrder.indexOf('innerCity');
      if (idx > currentIdx) return 'innerCity';
    }

    if (state.visitedLocations.some(l => l.includes('stronghold'))) {
      const idx = chapterOrder.indexOf('strongholds');
      if (idx > currentIdx) return 'strongholds';
    }

    // 检查是否接触过派系
    if (currentIdx < chapterOrder.indexOf('firstFactions')) {
      const hasFactionContact = Object.values(state.factionRelations).some(r => r !== 5);
      if (hasFactionContact) return 'firstFactions';
    }

    return state.currentChapter;
  }

  // ===== 派系管理 =====

  /**
   * 获取派系数据
   */
  getFaction(factionId: string): Faction | undefined {
    return this.data.factions.find(f => f.id === factionId);
  }

  /**
   * 获取所有派系
   */
  getAllFactions(): Faction[] {
    return this.data.factions;
  }

  /**
   * 改变派系关系
   */
  changeFactionRelation(
    state: CampaignState,
    factionId: DrakkenheimFactionId,
    change: number,
    reason: string,
  ): CampaignState {
    const currentRelation = state.factionRelations[factionId] ?? 5;
    const newRelation = Math.max(1, Math.min(10, currentRelation + change));

    return {
      ...state,
      factionRelations: {
        ...state.factionRelations,
        [factionId]: newRelation,
      },
    };
  }

  /**
   * 获取派系关系等级描述
   */
  getFactionRelationDescription(state: CampaignState, factionId: string): string {
    const relation = state.factionRelations[factionId] ?? 5;
    const level = getFactionRelationLevel(relation);
    const factionName = DRAKKENHEIM_FACTION_LABELS[factionId as DrakkenheimFactionId] ?? factionId;
    return `${factionName}: ${relation}/10 (${level})`;
  }

  /**
   * 获取派系可用的恩惠
   */
  getAvailableBoons(state: CampaignState, factionId: string): unknown[] {
    const faction = this.getFaction(factionId);
    if (!faction) return [];

    const relation = state.factionRelations[factionId] ?? 5;
    return faction.boons.filter(b => relation >= b.minRelation);
  }

  // ===== NPC管理 =====

  /**
   * 获取当前地点的NPC
   */
  getLocationNPCs(state: CampaignState): NPC[] {
    const location = this.getCurrentLocation(state);
    if (!location) return [];

    return location.npcs
      .map(id => this.data.npcs.find(n => n.id === id))
      .filter((n): n is NPC => n !== undefined);
  }

  /**
   * 获取NPC数据
   */
  getNPC(npcId: string): NPC | undefined {
    return this.data.npcs.find(n => n.id === npcId);
  }

  // ===== 任务管理 =====

  /**
   * 获取个人任务
   */
  getPersonalQuests(): PersonalQuest[] {
    return this.data.personalQuests;
  }

  /**
   * 更新任务进度
   */
  updateQuestProgress(
    state: CampaignState,
    questId: string,
    milestone: string,
  ): CampaignState {
    const current = state.personalQuestProgress[questId];
    const milestones = current?.milestones ?? [];

    if (!milestones.includes(milestone)) {
      milestones.push(milestone);
    }

    // 检查是否完成所有里程碑
    const quest = this.data.personalQuests.find(q => q.id === questId);
    const isCompleted = quest
      ? quest.milestones.every(m => milestones.includes(m))
      : false;

    const progress: QuestProgress = {
      questId,
      status: isCompleted ? 'completed' : 'inProgress',
      milestones,
      currentObjective: milestone,
    };

    return {
      ...state,
      personalQuestProgress: {
        ...state.personalQuestProgress,
        [questId]: progress,
      },
    };
  }

  // ===== 污染系统 =====

  /**
   * 增加污染等级
   */
  increaseContamination(state: CampaignState, amount: number = 1): CampaignState {
    const newLevel = Math.min(6, state.contaminationLevel + amount);
    return {
      ...state,
      contaminationLevel: newLevel,
    };
  }

  /**
   * 检查是否应该触发变异卡
   */
  shouldDrawMutationCard(state: CampaignState, newLevel: number): boolean {
    const oldLevel = state.contaminationLevel;
    // 在3级和5级时各抽一次
    if (oldLevel < 3 && newLevel >= 3) return true;
    if (oldLevel < 5 && newLevel >= 5) return true;
    return false;
  }

  // ===== 探索倒计时 =====

  /**
   * 创建地点探索倒计时
   */
  createExplorationCountdown(locationId: string): Countdown | null {
    const location = this.data.locations.find(l => l.id === locationId);
    if (!location) return null;

    // 根据区域类型确定倒计时
    let maxValue = 4; // 默认外城
    if (location.type === 'village') return null; // 安全区无倒计时
    if (location.type === 'innerCity') maxValue = 3;
    if (location.hazeLevel === 'heavy') maxValue = 2;

    return {
      id: `explore_${locationId}`,
      name: `${location.name}探索倒计时`,
      description: `在${location.name}中停留的安全时限`,
      currentValue: maxValue,
      maxValue,
      decrementOn: 'playerAction',
      triggerAt: 0,
      triggered: false,
      triggerEffect: `迷雾在${location.name}中加剧，必须进行污染反应掷骰！`,
    };
  }

  // ===== 章节推进 =====

  /**
   * 检查章节推进条件
   */
  checkChapterAdvancement(state: CampaignState): CampaignChapter | null {
    switch (state.currentChapter) {
      case 'arrival':
        // 访问过外城地点后进入外城探索
        if (state.visitedLocations.some(l => l.includes('outer'))) {
          return 'outerCity';
        }
        break;

      case 'outerCity':
        // 与任一派系关系变化后进入首次接触
        if (Object.values(state.factionRelations).some(r => r !== 5)) {
          return 'firstFactions';
        }
        break;

      case 'firstFactions':
        // 访问内城地点后进入内城探索
        if (state.visitedLocations.some(l => l.includes('inner'))) {
          return 'innerCity';
        }
        break;

      case 'innerCity':
        // 完成至少2个派系任务后进入派系冲突
        const completedFactionQuests = Object.values(state.factionQuestProgress)
          .filter(q => q.status === 'completed').length;
        if (completedFactionQuests >= 2) {
          return 'factionConflict';
        }
        break;

      case 'factionConflict':
        // 攻克据点后进入最终远征
        if (state.narrativeFlags['stronghold_captured']) {
          return 'strongholds';
        }
        break;

      case 'strongholds':
        // 发现至少3个封印后进入最终远征
        if (state.sealsFound.length >= 3) {
          return 'finalExpedition';
        }
        break;

      case 'finalExpedition':
        // 完成最终远征后进入命运
        if (state.narrativeFlags['final_expedition_complete']) {
          return 'fate';
        }
        break;
    }

    return null;
  }

  // ===== 数据访问 =====

  getData(): DrakkenheimCampaignData {
    return this.data;
  }

  getLocations(): DrakkenheimLocation[] {
    return this.data.locations;
  }

  getMonsters(): unknown[] {
    return this.data.monsters;
  }
}
