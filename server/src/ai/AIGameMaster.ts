/**
 * AI 管家 — 全自动 TRPG GM 系统
 * 统一替代原有的8个Agent，处理所有GM职责：
 * 叙事管理、规则裁判、NPC扮演、战斗管理、派系政治、环境描述、战役推进
 */
import type {
  AIGMContext,
  AIGMResponse,
  AIGMGeneratedEvent,
  WorldLore,
  AIMessage,
  AIChoice,
  Character,
  SessionState,
  SceneState,
  CampaignState,
  CampaignChapter,
  Countdown,
  Faction,
  NPC,
} from '@trpgmaster/shared';
import { AIGateway } from './AIGateway';
import type { AIConfig, AIMessage as GatewayMessage } from './AIGateway';

// ===== AI 管家配置 =====

export interface AIGMConfig {
  gateway: AIConfig;
  narratorModel: string;
  combatModel: string;
  maxTokensPerResponse: number;
  temperature: number;
}

// ===== 场景分析结果 =====

export interface SceneAnalysis {
  type: 'exploration' | 'dialogue' | 'combat' | 'rest' | 'transition' | 'levelUp' | 'deathMove';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  npcsInvolved: string[];
  locationId: string;
  possibleActions: AIChoice[];
  suggestedDifficulty?: number;
  suggestedAttribute?: string;
}

// ===== AI 管家主类 =====

export class AIGameMaster {
  private gateway: AIGateway;
  private config: AIGMConfig;
  private conversationHistory: Map<string, AIMessage[]>; // sessionId → history
  private narrativeMemory: Map<string, string[]>; // sessionId → key events
  private worldLore: WorldLore | null;

  constructor(config: AIGMConfig) {
    this.config = config;
    this.gateway = new AIGateway(config.gateway);
    this.conversationHistory = new Map();
    this.narrativeMemory = new Map();
    this.worldLore = null;
  }

  // ===== 核心方法 =====

  /**
   * 处理玩家行动 — AI管家的核心入口
   * 接收玩家输入，返回GM响应（叙事 + 事件 + 状态变化）
   */
  async processPlayerAction(
    context: AIGMContext,
    playerInput: string,
  ): Promise<AIGMResponse> {
    const sessionId = context.sessionId;
    const history = this.getHistory(sessionId);

    // 构建AI请求
    const systemPrompt = this.buildSystemPrompt(context);
    const stateSummary = this.buildStateSummary(context);
    const memorySummary = this.buildMemorySummary(sessionId);

    const messages: GatewayMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: stateSummary },
    ];

    if (memorySummary) {
      messages.push({ role: 'system', content: memorySummary });
    }

    // 添加对话历史（最近20条）
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      if (msg.role === 'narrator' || msg.role === 'system') {
        messages.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'npc') {
        messages.push({ role: 'assistant', content: `[${msg.npcName || 'NPC'}] ${msg.content}` });
      }
    }

    // 添加玩家当前输入
    if (context.activePlayerName && context.characters && context.characters.length > 1) {
      // Multi-player: prefix with player/character name
      messages.push({ role: 'user', content: `[${context.activePlayerName}/${context.character.name}]: ${playerInput}` });
    } else {
      messages.push({ role: 'user', content: playerInput });
    }

    // 调用AI
    const response = await this.gateway.sendRequest({
      model: this.config.narratorModel,
      messages,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokensPerResponse,
      agentType: 'aigm',
    });

    // 解析AI响应
    const aiMessage: AIMessage = {
      id: `msg_${Date.now()}`,
      role: 'narrator',
      content: response.content,
      timestamp: Date.now(),
    };

    // 生成事件
    const events = this.generateEventsFromResponse(response.content, context);

    // 更新记忆
    this.addMemoryEntry(sessionId, playerInput, response.content);

    // 更新对话历史
    this.addHistoryEntry(sessionId, aiMessage);

    return {
      message: aiMessage,
      events,
      tokenUsage: response.tokenUsage.totalTokens,
    };
  }

  /**
   * 生成场景描述
   */
  async narrateScene(context: AIGMContext): Promise<AIGMResponse> {
    const scene = context.sessionState.currentScene;
    const character = context.character;
    const campaign = context.sessionState.campaignState;

    const prompt = `描述当前场景。
地点：${scene.name}
环境：${scene.description}
角色：${character.name}（${character.level}级）
当前状态：HP ${character.hp}/${character.maxHp}, 压力 ${character.stress}/${character.maxStress}, 希望 ${character.hope}/${character.maxHope}
当前地区：${campaign.currentLocation}
迷雾等级：${scene.countdowns.find((c: Countdown) => c.name.includes('迷雾'))?.currentValue ?? '未知'}

请用沉浸式的叙事风格描述当前场景，包括环境细节、氛围和可能的行动方向。给出2-3个玩家可选择的行动选项。`;

    return this.processPlayerAction(context, prompt);
  }

  /**
   * 处理NPC对话
   */
  async generateNPCDialogue(
    context: AIGMContext,
    npc: NPC,
    playerDialogue: string,
  ): Promise<AIGMResponse> {
    const prompt = `与${npc.name}对话。
${npc.name}的性格：${npc.personality}
${npc.name}的动机：${npc.motivation}
${npc.name}的秘密：${npc.secrets.join('；')}
${npc.name}当前压力：${npc.currentStress}/${npc.stressSlots}

玩家说："${playerDialogue}"

请以${npc.name}的视角回应，保持角色一致性。如果玩家触及敏感话题，NPC可能会表现出压力或回避。`;

    const response = await this.processPlayerAction(context, prompt);

    // 修改消息角色为NPC
    if (response.message) {
      response.message.role = 'npc';
      response.message.npcName = npc.name;
      response.message.npcId = npc.id;
    }

    return response;
  }

  /**
   * 管理战斗
   */
  async manageCombat(
    context: AIGMContext,
    combatAction: string,
  ): Promise<AIGMResponse> {
    const combat = context.sessionState.activeCombat;
    if (!combat) {
      return this.processPlayerAction(context, combatAction);
    }

    const enemiesDesc = combat.enemies.map(e =>
      `${e.name}（HP:${e.currentHp}/${e.maxHp} 压力:${e.currentStress}/${e.maxStress}${e.isFocused ? ' [聚焦]' : ''}）`
    ).join('、');

    const prompt = `战斗进行中。
回合：${combat.round}
敌人：${enemiesDesc}
恐惧点池：${context.sessionState.fearPoints}
玩家行动："${combatAction}"

请描述战斗场景和敌人反应。如果需要掷骰判定，标明属性和难度。`;

    return this.processPlayerAction(context, prompt);
  }

  /**
   * 处理场景转换
   */
  async handleSceneTransition(
    context: AIGMContext,
    targetLocationId: string,
  ): Promise<AIGMResponse> {
    const prompt = `角色从当前地点移动到${targetLocationId}。请描述旅途和到达新地点的场景。注意根据目的地的危险等级和迷雾浓度调整氛围。`;

    return this.processPlayerAction(context, prompt);
  }

  /**
   * 处理派系交互
   */
  async manageFactionInteraction(
    context: AIGMContext,
    factionId: string,
    action: string,
  ): Promise<AIGMResponse> {
    const faction = this.worldLore?.factions.find(f => f.id === factionId);
    const relation = context.sessionState.campaignState.factionRelations[factionId] ?? 5;

    const prompt = `与派系"${faction?.name ?? factionId}"交互。
当前关系：${relation}/10（${this.getRelationLabel(relation)}）
派系理念：${faction?.ideology ?? '未知'}
玩家行动："${action}"

请描述派系的反应，注意考虑当前关系等级。关系越高，派系越愿意提供帮助。`;

    return this.processPlayerAction(context, prompt);
  }

  // ===== 角色创建引导 =====

  /**
   * 引导角色创建的下一步
   */
  async guideCharacterCreation(
    step: number,
    previousChoices: Record<string, unknown>,
  ): Promise<{ prompt: string; choices?: AIChoice[] }> {
    const stepPrompts: Record<number, string> = {
      1: '欢迎来到匕首之心！首先，选择你的职业。你将成为什么样的冒险者？',
      2: '很好！接下来选择你的种族。你的血脉来自何方？',
      3: '你来自哪个社群？你的成长环境塑造了你。',
      4: '分配你的属性值。将+2,+1,+1,0,0,-1分配给六大属性（敏捷、力量、灵巧、本能、风度、知识）。',
      5: '记录你的基础资源：闪避值、生命点、压力点、希望恐惧点。',
      6: '选择你的装备：主武器、副武器（可选）和护甲。',
      7: '创作你的背景故事。你为何踏上冒险之旅？',
      8: '选择两张1级领域卡作为你的初始能力。',
      9: '创作你的人际关系。与谁有羁绊？',
    };

    return {
      prompt: stepPrompts[step] || '继续角色创建...',
    };
  }

  // ===== 第零场（Session Zero） =====

  /**
   * 运行第零场 — 安全工具和世界设定讨论
   */
  async runSessionZero(context: AIGMContext): Promise<AIGMResponse> {
    const prompt = `这是第零场（Session Zero）。

角色：${context.character.name}
职业：${context.character.classId}
种族：${context.character.ancestryId}

请与玩家讨论以下内容：
1. 安全工具：确认游戏中的舒适度边界（暴力、恐怖、社交等）
2. 世界观概述：简要介绍德拉肯海姆的背景
3. 角色动机：为什么你的角色会来到余烬村？
4. 游戏期望：你希望什么样的游戏体验？

保持友好和开放的态度，确保玩家感到舒适。`;

    return this.processPlayerAction(context, prompt);
  }

  // ===== 私有方法 =====

  private buildSystemPrompt(context: AIGMContext): string {
    const isMultiplayer = context.characters && context.characters.length > 1;

    let prompt = `你是TRPGMaster的AI管家（GM），负责运行一场基于匕首之心（Daggerheart）规则的德拉肯海姆（Drakkenheim）战役。

## 你的职责
- **叙事管理**：描述场景、推进剧情、营造氛围
- **规则裁判**：判定行动、设定难度、计算结果
- **NPC扮演**：扮演所有NPC，保持性格一致
- **战斗管理**：控制敌人行动、消耗恐惧点、管理聚焦系统
- **派系政治**：追踪5个派系的关系变化
- **环境描述**：描述德拉肯海姆的迷雾、污染、翠晶
- **战役推进**：推进个人任务、派系任务、主线剧情

## 核心规则
- 二元骰系统：2d12（希望骰+恐惧骰），5种结果类型
- 伤害阈值：轻度/重度/严重，护甲槽可降低伤害等级
- 希望点/恐惧点：资源经济系统
- 压力点：压力满时自动变为脆弱状态，溢出标记生命点
- 短休（选2项）/长休（选2项）
- 死亡行动：光荣就义/回避死亡/孤注一掷

## 德拉肯海姆设定
- 5派系：提灯团、女王之仆、白银骑士团、陨火信徒、紫晶学院
- 污染系统：0-6级，3级和5级抽变异卡，6级=异变
- 迷雾：探索倒计时，暴露需反应掷骰
- 翠晶：有价值的魔法矿物，但拾取有污染风险
- 封印：德拉肯海姆封印是重要剧情物品

## 叙事风格
- 沉浸式描述，注重感官细节
- 保持德拉肯海姆的暗黑奇幻氛围
- 给玩家有意义的选择
- 失败也是有趣的故事
- 不要过度解释规则，让叙事驱动

## 输出格式
- 每次响应结尾必须列出2-4个玩家可选择的行动，用编号格式：1) xxx  2) xxx  3) xxx
- 不要用括号【】或圆圈①②③，只用 数字) 的格式
- 选项应简洁明确，如：1) 检查井里的声音  2) 取走铜牌  3) 呼叫同伴`;

    if (isMultiplayer) {
      prompt += `

## 多人模式规则
- 当前会话有${context.characters!.length}名玩家，各自扮演不同角色
- 叙事时要关注所有玩家的角色状态
- 当某个玩家行动时，其他角色的状态也要考虑
- 战斗中管理所有角色的行动顺序
- 使用角色名而非"你"来避免混淆
- 鼓励玩家之间的互动和合作
- 当前行动的玩家是：${context.activePlayerName || '未知'}`;
    }

    return prompt;
  }

  private buildStateSummary(context: AIGMContext): string {
    const char = context.character;
    const scene = context.sessionState.currentScene;
    const campaign = context.sessionState.campaignState;
    const combat = context.sessionState.activeCombat;
    const isMultiplayer = context.characters && context.characters.length > 1;

    let summary: string;

    if (isMultiplayer) {
      // Multi-player: show full party status
      const partyDesc = context.characters!.map((c, i) => {
        return `${i + 1}. ${c.name}（${c.classId} Lv.${c.level}）HP:${c.hp}/${c.maxHp} 压力:${c.stress}/${c.maxStress} 希望:${c.hope}/${c.maxHope} 护甲:${c.armorSlots}/${c.maxArmorSlots}`;
      }).join('\n');

      const activeChar = context.activePlayerName
        ? `当前行动：${context.activePlayerName}（${char.name}）`
        : `当前行动：${char.name}`;

      summary = `## 队伍状态（${context.characters!.length}人）
${partyDesc}

${activeChar}

场景：${scene.name} - ${scene.description.substring(0, 100)}
在场NPC: ${scene.npcPresent.join(', ') || '无'}
恐惧点池: ${context.sessionState.fearPoints}`;
    } else {
      // Single-player: original format
      summary = `## 当前状态
角色：${char.name}（${char.level}级）
HP: ${char.hp}/${char.maxHp} | 压力: ${char.stress}/${char.maxStress} | 希望: ${char.hope}/${char.maxHope}
护甲槽: ${char.armorSlots}/${char.maxArmorSlots} | 闪避值: ${char.evasion}
伤害阈值: 轻度${char.minorThreshold}/重度${char.majorThreshold}/严重${char.severeThreshold}
状态: ${char.conditions.map(c => c.condition).join(', ') || '无'}

场景：${scene.name} - ${scene.description.substring(0, 100)}
在场NPC: ${scene.npcPresent.join(', ') || '无'}
恐惧点池: ${context.sessionState.fearPoints}`;
    }

    summary += `

战役进度：
当前章节: ${campaign.currentChapter}
当前位置: ${campaign.currentLocation}
已访问地点: ${campaign.visitedLocations.length}处
污染等级: ${campaign.contaminationLevel}/6
翠晶收集: ${campaign.deleriumCollected}
封印已发现: ${campaign.sealsFound.length}个`;

    // 派系关系
    const factionRelations = Object.entries(campaign.factionRelations)
      .map(([id, rel]) => `${id}:${rel}/10`)
      .join(' ');
    if (factionRelations) {
      summary += `\n派系关系: ${factionRelations}`;
    }

    // 战斗状态
    if (combat) {
      const enemies = combat.enemies.map(e =>
        `${e.name}(HP:${e.currentHp}/${e.maxHp})`
      ).join(', ');
      summary += `\n战斗中 - 回合${combat.round}: ${enemies}`;
    }

    // 倒计时
    if (scene.countdowns.length > 0) {
      const countdowns = scene.countdowns
        .filter((c: Countdown) => !c.triggered)
        .map((c: Countdown) => `${c.name}:${c.currentValue}/${c.maxValue}`)
        .join(', ');
      if (countdowns) {
        summary += `\n倒计时: ${countdowns}`;
      }
    }

    return summary;
  }

  private buildMemorySummary(sessionId: string): string {
    const memories = this.narrativeMemory.get(sessionId);
    if (!memories || memories.length === 0) return '';

    const recent = memories.slice(-10);
    return `## 关键事件记忆\n${recent.join('\n')}`;
  }

  private generateEventsFromResponse(
    responseContent: string,
    context: AIGMContext,
  ): AIGMGeneratedEvent[] {
    const events: AIGMGeneratedEvent[] = [];

    // 简单的关键词检测来生成事件
    // 在生产环境中，应该使用结构化输出或更复杂的NLP
    const content = responseContent.toLowerCase();

    if (content.includes('污染') || content.includes('翠晶')) {
      events.push({
        type: 'drakkenheim:contamination',
        payload: { description: '角色接触了污染源' },
        priority: 'high',
      });
    }

    if (content.includes('迷雾') && content.includes('反应')) {
      events.push({
        type: 'drakkenheim:hazeEffect',
        payload: { description: '迷雾暴露反应' },
        priority: 'normal',
      });
    }

    if (content.includes('翠晶') && content.includes('发现')) {
      events.push({
        type: 'drakkenheim:deleriumFound',
        payload: { description: '发现翠晶' },
        priority: 'normal',
      });
    }

    if (content.includes('封印') && content.includes('发现')) {
      events.push({
        type: 'drakkenheim:sealFound',
        payload: { description: '发现德拉肯海姆封印' },
        priority: 'critical',
      });
    }

    if (content.includes('战斗') || content.includes('攻击') || content.includes('敌人')) {
      events.push({
        type: 'combat:start',
        payload: { description: '进入战斗' },
        priority: 'high',
      });
    }

    if (content.includes('派系') && (content.includes('关系') || content.includes('声望'))) {
      events.push({
        type: 'faction:relationChange',
        payload: { description: '派系关系变化' },
        priority: 'normal',
      });
    }

    return events;
  }

  private getHistory(sessionId: string): AIMessage[] {
    return this.conversationHistory.get(sessionId) || [];
  }

  private addHistoryEntry(sessionId: string, message: AIMessage): void {
    const history = this.getHistory(sessionId);
    history.push(message);
    // Keep last 100 messages
    if (history.length > 100) {
      this.conversationHistory.set(sessionId, history.slice(-100));
    } else {
      this.conversationHistory.set(sessionId, history);
    }
  }

  private addMemoryEntry(sessionId: string, playerInput: string, aiResponse: string): void {
    const memories = this.narrativeMemory.get(sessionId) || [];
    const summary = `玩家: ${playerInput.substring(0, 50)} → GM: ${aiResponse.substring(0, 100)}`;
    memories.push(summary);
    // Keep last 50 memories
    if (memories.length > 50) {
      this.narrativeMemory.set(sessionId, memories.slice(-50));
    } else {
      this.narrativeMemory.set(sessionId, memories);
    }
  }

  private getRelationLabel(relation: number): string {
    if (relation <= 2) return '敌对';
    if (relation <= 4) return '不友好';
    if (relation <= 6) return '中立';
    if (relation <= 8) return '友好';
    return '同盟';
  }

  // ===== 配置 =====

  setWorldLore(lore: WorldLore): void {
    this.worldLore = lore;
  }

  getConfig(): AIGMConfig {
    return { ...this.config };
  }
}
