/**
 * AI 管家 — 全自动 TRPG GM 系统
 * 统一替代原有的8个Agent，处理所有GM职责：
 * 叙事管理、规则裁判、NPC扮演、战斗管理、派系政治、环境描述、战役推进
 */
import type {
  AIGMContext,
  AIGMResponse,
  WorldLore,
  AIMessage,
  AIChoice,
  Character,
  SessionState,
  SessionZeroPhase,
  SceneState,
  CampaignState,
  CampaignChapter,
  Countdown,
  Faction,
  NPC,
} from '@trpgmaster/shared';
import { AIGateway } from './AIGateway';
import type { AIConfig, AIMessage as GatewayMessage } from './AIGateway';
import type { DualityDiceResult } from '../rules/systems/DaggerHeartRules';
import type { SessionStore, HistoryEntry } from '../core/SessionStore';
import type { PromptProviderConfig } from './IPromptProvider';
import { daggerheartPromptProvider } from './prompt-providers';

// ===== AI 管家配置 =====

export interface AIGMConfig {
  gateway: AIConfig;
  narratorModel: string;
  combatModel: string;
  maxTokensPerResponse: number;
  temperature: number;
  /** Prompt provider configuration; defaults to DaggerheartPromptProvider if omitted */
  promptProvider?: PromptProviderConfig;
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
  private sessionStore: SessionStore;
  private worldLore: WorldLore | null;
  private promptProvider: PromptProviderConfig;

  constructor(config: AIGMConfig, sessionStore: SessionStore) {
    this.config = config;
    this.gateway = new AIGateway(config.gateway);
    this.sessionStore = sessionStore;
    this.worldLore = null;
    this.promptProvider = config.promptProvider ?? daggerheartPromptProvider;
  }

  // ===== 核心方法 =====

  private readonly stateReminder = "\n\n【机械结算提醒】本回合的数值结果已在 <resolved_outcome> 中预先算好。请据此叙事，不要输出 [STATE] 标记，不要擅自更改任何数字。只描述已经发生的结果，把数字讲成画面与后果。如果本回合无 <resolved_outcome>，正常叙事即可。";

  /**
   * 处理玩家行动 — 流式版本，逐 token 回调
   * 用于多人场景下 GM "正在落笔" 的实时体验
   */
  async processPlayerActionStream(
    context: AIGMContext,
    playerInput: string,
    onToken: (delta: string) => void,
    diceResult?: DualityDiceResult,
    signal?: AbortSignal,
    resolvedOutcome?: string,
  ): Promise<AIGMResponse> {
    const sessionId = context.sessionId;

    // Same prompt construction as non-streaming
    const systemPrompt = this.buildSystemPrompt(context);
    const stateSummary = this.buildStateSummary(context);

    const messages: GatewayMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: stateSummary },
    ];

    if (diceResult) {
      messages.push({ role: 'system', content: this.formatDiceResultSummary(diceResult) });
    }

    if (resolvedOutcome) {
      messages.push({ role: 'system', content: `<resolved_outcome>\n${resolvedOutcome}\n</resolved_outcome>` });
    } else {
      messages.push({ role: 'system', content: `<resolved_outcome>\n（本回合无机械结算）\n</resolved_outcome>` });
    }

    const playerHistoryEntry: HistoryEntry = {
      id: `msg_${Date.now()}_player`,
      role: 'player',
      content: this.formatPlayerContent(context, playerInput),
      timestamp: Date.now(),
    };
    await this.sessionStore.appendHistory(sessionId, playerHistoryEntry);

    const history = await this.sessionStore.getHistory(sessionId);
    const conversationMessages = this.buildConversationMessages(
      history,
      playerInput,
      context,
      true,
    );
    messages.push(...conversationMessages);

    // Stream the request
    const { fullText } = await this.gateway.sendStreamRequest(
      {
        model: this.config.narratorModel,
        messages,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokensPerResponse,
        agentType: 'aigm',
      },
      onToken,
      signal,
    );

    const aiMessage: HistoryEntry = {
      id: `msg_${Date.now()}`,
      role: 'narrator',
      content: fullText,
      timestamp: Date.now(),
    };

    await this.sessionStore.appendHistory(sessionId, aiMessage);

    return {
      message: aiMessage,
      events: [],
      tokenUsage: 0, // Stream mode doesn't return usage stats
    };
  }

  /**
   * 处理玩家行动 — AI管家的核心入口
   * 接收玩家输入，返回GM响应（叙事 + 事件 + 状态变化）
   */
  async processPlayerAction(
    context: AIGMContext,
    playerInput: string,
    diceResult?: DualityDiceResult,
  ): Promise<AIGMResponse> {
    const sessionId = context.sessionId;

    // 构建AI请求
    const systemPrompt = this.buildSystemPrompt(context);
    const stateSummary = this.buildStateSummary(context);

    const messages: GatewayMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: stateSummary },
    ];

    // Inject dice result as a factual system message (already resolved by backend)
    if (diceResult) {
      messages.push({ role: 'system', content: this.formatDiceResultSummary(diceResult) });
    }

    // Add player input to history BEFORE reconstruction so it appears in conversation
    const playerHistoryEntry: HistoryEntry = {
      id: `msg_${Date.now()}_player`,
      role: 'player',
      content: this.formatPlayerContent(context, playerInput),
      timestamp: Date.now(),
    };
    await this.sessionStore.appendHistory(sessionId, playerHistoryEntry);

    // Build conversation messages from history + current input
    const history = await this.sessionStore.getHistory(sessionId);
    const conversationMessages = this.buildConversationMessages(
      history,
      playerInput,
      context,
      true,
    );
    messages.push(...conversationMessages);

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

    // 更新对话历史
    await this.sessionStore.appendHistory(sessionId, {
      id: aiMessage.id,
      role: aiMessage.role,
      content: aiMessage.content,
      timestamp: aiMessage.timestamp,
    });

    return {
      message: aiMessage,
      events: [],
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

    const enemiesDesc = combat.enemies.map(e => {
      const features = e.features?.length
        ? ` 特性:${e.features.map(f => `${f.name}${f.type === 'fear' ? `[恐惧${f.cost}]` : ''}`).join(',')}`
        : '';
      return `${e.name}（HP:${e.currentHp}/${e.maxHp} 压力:${e.currentStress}/${e.maxStress}${e.isFocused ? ' [聚焦]' : ''}${features}）`;
    }).join('、');

    const prompt = `战斗进行中。
回合：${combat.round}
敌人：${enemiesDesc}
恐惧点池：${context.sessionState.fearPoints}
玩家行动："${combatAction}"

请描述战斗场景和敌人反应。如果需要掷骰判定，标明属性和难度。`;

    return this.processPlayerAction(context, prompt);
  }

  /**
   * 生成遭遇开场叙事 — 当遭遇生成器创建敌人后调用
   */
  async narrateEncounterIntro(
    context: AIGMContext,
    narrationPrompt: string,
  ): Promise<AIGMResponse> {
    const prompt = `${narrationPrompt}\n\n战斗刚刚开始！请为这场遭遇写一段开场叙事，描述敌人出场和战斗开始时的紧张气氛。`;

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
    const stepPrompt = this.promptProvider.characterCreationSteps[step] || '继续角色创建...';

    return {
      prompt: stepPrompt,
    };
  }

  // ===== 第零场（Session Zero） =====

  /**
   * 运行第零场 — 多阶段共创叙事准备
   * 阶段：safety → worldbuilding → connections → expectations → narrativePact
   */
  async runSessionZero(context: AIGMContext, playerInput?: string): Promise<AIGMResponse> {
    const phase = context.sessionState?.sessionZeroPhase || 'safety';
    const phasePrompt = this.buildSessionZeroPrompt(context, phase);

    return this.callAI(phasePrompt, context, playerInput);
  }

  /**
   * 使用自定义系统提示调用AI（供Session Zero等特殊场景使用）
   */
  private async callAI(customSystemPrompt: string, context: AIGMContext, playerInput?: string): Promise<AIGMResponse> {
    const sessionId = context.sessionId;

    const stateSummary = this.buildStateSummary(context);

    const messages: GatewayMessage[] = [
      { role: 'system', content: customSystemPrompt },
      { role: 'system', content: stateSummary },
    ];

    // Add player input to history if present
    if (playerInput) {
      const playerHistoryEntry: HistoryEntry = {
        id: `msg_${Date.now()}_player`,
        role: 'player',
        content: this.formatPlayerContent(context, playerInput),
        timestamp: Date.now(),
      };
      await this.sessionStore.appendHistory(sessionId, playerHistoryEntry);
    }

    // Build conversation messages from history + current input
    // Session Zero does NOT include stateReminder
    const history = await this.sessionStore.getHistory(sessionId);
    const conversationMessages = this.buildConversationMessages(
      history,
      playerInput,
      context,
      false,
    );
    messages.push(...conversationMessages);

    // If no player input and no history, add S0 initial prompt
    if (!playerInput && conversationMessages.length === 0) {
      const phase = context.sessionState?.sessionZeroPhase || 'safety';
      messages.push({
        role: 'user',
        content: `[Session Zero · ${phase}] 请开始与我们的对话。`,
      });
    }

    const response = await this.gateway.sendRequest({
      model: this.config.narratorModel,
      messages,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokensPerResponse,
      agentType: 'aigm',
    });

    const aiMessage: AIMessage = {
      id: `msg_${Date.now()}`,
      role: 'narrator',
      content: response.content,
      timestamp: Date.now(),
    };

    await this.sessionStore.appendHistory(sessionId, {
      id: aiMessage.id,
      role: aiMessage.role,
      content: aiMessage.content,
      timestamp: aiMessage.timestamp,
    });

    return {
      message: aiMessage,
      events: [],
      tokenUsage: response.tokenUsage.totalTokens,
    };
  }

  private buildSessionZeroPrompt(context: AIGMContext, phase: SessionZeroPhase): string {
    const characterList = context.characters!.map(c =>
      `  - ${c.name}（${c.classId} ${c.ancestryId}）`
    ).join('\n');

    const provider = this.promptProvider;

    const basePrompt = `你是${provider.sessionZeroIdentity}，正在进行 Session Zero（第零次会议）。
这是游戏正式开始前的共创环节，目的是让所有玩家共同建立这场战役的基础。

当前参与的角色：
${characterList}

## Session Zero 核心原则
- 你不是在"教"玩家规则，而是在与他们"共同创造"世界
- 每个问题都应该邀请玩家贡献自己的创意
- 认真倾听每个回答，将它们编织进世界
- 当玩家的创意与你预想的不同，跟随玩家的方向
- 这个阶段建立的一切都将成为后续冒险的正典（canon）

## 输出格式
使用模式 A（开放式提问）。每次只聚焦一个主题，提出1-2个开放式问题。
不要使用编号选项（模式 D）。玩家用自由文字回答。`;

    const phasePrompts: Record<SessionZeroPhase, string> = {
      safety: `${basePrompt}

## 阶段 1/5：安全工具与边界

目标：建立一张安全的游戏桌。

请做以下事情：
1. 简短介绍 X-Card 机制：任何人可以随时打出 X-Card 来跳过不适的内容，无需解释
2. 介绍 Lines & Veils：
   - Lines（红线）：完全不出现在游戏中的内容
   - Veils（帷幕）：可以暗示但不详细描述的内容
3. 然后询问每位玩家：有什么内容是你不想在游戏中出现的？

语气：温暖、包容。强调这是为了让所有人都能享受游戏。`,

      worldbuilding: `${basePrompt}

## 阶段 2/5：世界观共创

目标：让玩家共同塑造${provider.campaignName}的细节。

${provider.sessionZeroWorldbuilding}`,

      connections: `${basePrompt}

## 阶段 3/5：角色联系

目标：建立角色之间在冒险开始前就存在的关系。

请为每对相邻的角色提出关于他们关系的问题。例如：
- "你们两个是如何认识的？是一场酒馆斗殴，还是一次共同的逃亡？"
- "在你们一起旅行的日子里，有一件事让你们从陌生人变成了同伴——那是什么事？"
- "你们之间有一个未说出口的默契——那是什么？"

让每位玩家都有机会描述自己的角色如何与至少一名其他角色相连。
如果玩家不确定，提供几个引导性的选项，但鼓励他们自己创造。`,

      expectations: `${basePrompt}

## 阶段 4/5：战役期望

目标：了解每位玩家想要的体验。

请询问每位玩家以下问题（用轻松的方式）：
1. 你更期待什么类型的场景？（战斗/探索/社交/政治阴谋）
2. 你希望这场战役的基调是怎样的？（英雄史诗/暗黑生存/悬疑推理/轻松冒险）
3. 你希望你的角色面对什么样的挑战？（内心挣扎/外部敌人/道德抉择）

根据他们的回答，总结出这场战役的核心主题。`,

      narrativePact: `${basePrompt}

## 阶段 5/5：共创叙事契约

目标：明确建立协作叙事的框架。

请做以下事情：
1. 简要总结前四个阶段中玩家建立的所有内容（安全边界、世界细节、角色关系、战役期望）
2. 明确说出"共创叙事契约"——在这场游戏中：
   - 玩家不仅仅是选择选项，而是世界的共同创造者
   - 当你描述场景时，你会提出问题，邀请他们发明细节
   - 他们说的关于自己角色和世界的内容将成为故事的一部分
   - 你会基于他们的创意来构建后续叙事
3. 询问："你们准备好一起创造这个故事了吗？"

当所有玩家确认后，冒险正式开始。`,
    };

    return phasePrompts[phase];
  }

  // ===== 私有方法 =====

  private buildSystemPrompt(context: AIGMContext): string {
    const isMultiplayer = context.characters && context.characters.length > 1;
    const provider = this.promptProvider;

    let prompt = `你是${provider.gmIdentity}

## 你的职责
${provider.gmResponsibilities.join('\n')}

${provider.rulesDescription}

${provider.settingDescription}

${provider.narrativeStyle}

## 叙事模式与输出格式

你遵循${provider.systemName}"共创世界"的哲学——你带来问题，而非预设的故事。玩家的回答塑造世界。

每次响应使用以下模式之一（根据情境选择最合适的）：

${provider.narrativeModes.map((mode, i) => {
  const label = String.fromCharCode(65 + i); // A, B, C, D...
  const weightNote = mode.weight >= 10 ? `约${mode.weight}%时间` : `约${mode.weight}%时间`;
  return `### 模式 ${label}：${mode.name}（${weightNote}）\n${mode.description}`;
}).join('\n\n')}

### 模式选择指南：
- 探索、社交和叙事 → 模式 A 或 B
- 战斗、休息和明确岔路口 → 模式 D
- 玩家提到背景、文化或过去 → 模式 C
- 玩家用创意细节回答时，将其纳入世界！他们的描述成为正典
- 永远不要连续两次使用模式 D。至少每隔一次使用模式 A 或 B

## 整合玩家创意
当玩家描述你未预见的细节时（新NPC特征、地点细节、文化习俗），将其纳入世界。
在后续叙事中基于此构建。
示例：如果玩家说"我认出这个符号——我师父教过我这个"，那么该符号现在与他们的师父有关。

## 机械结算（重要）
- 本回合的数值结果由系统预先算好，写在 <resolved_outcome> 中。
- 你必须严格按 <resolved_outcome> 叙事，绝不擅自更改、新增或省略任何数字（HP、伤害、压力、希望、恐惧）。
- 不要输出 [STATE] 标记；状态由系统负责，不归你管。
- 你只描述"已经发生的结果"，把数字讲成画面与后果。
- 如果 <resolved_outcome> 不存在，说明本回合无机械结算，正常叙事即可`;

    if (isMultiplayer) {
      prompt += `

## 多人协作叙事
- 当前会话有${context.characters!.length}名玩家，各自扮演不同角色
- 叙事时要关注所有玩家的角色状态
- 向特定角色提问："战士，当巨魔冲锋时，你站在哪里？"
- 创造需要多个角色输入的情境
- 询问角色之间关于他们共同历史的问题
- 当一名玩家描述某事时，询问另一名玩家他们的角色如何反应
- 战斗中管理所有角色的行动顺序
- 使用角色名而非"你"来避免混淆
- 当前行动的玩家是：${context.activePlayerName || '未知'}`;
    }

    // Inject safety boundaries (Lines/Veils) if present
    const safety = context.sessionState.safetyState;
    if (safety && (safety.lines.length > 0 || safety.veils.length > 0)) {
      prompt += `

## 安全边界（绝对遵守，高于一切叙事需求）
- 以下内容绝不出现（Lines）：${safety.lines.join('、')}
- 以下内容只暗示、不描写（Veils）：${safety.veils.join('、')}`;
      if (safety.toneFlags.length > 0) {
        prompt += `
- 叙事基调偏好：${safety.toneFlags.join('、')}`;
      }
    }

    return prompt;
  }

  private buildStateSummary(context: AIGMContext): string {
    const char = context.character;
    const scene = context.sessionState.currentScene;
    const campaign = context.sessionState.campaignState;
    const combat = context.sessionState.activeCombat;
    const isMultiplayer = context.characters && context.characters.length > 1;

    // Build a single character's full status string
    const buildCharStatus = (c: Character, isActive: boolean) => {
      const attrs = c.attributes
        ? `敏捷:${c.attributes.agility ?? 0} 力量:${c.attributes.strength ?? 0} 灵巧:${c.attributes.finesse ?? 0} 本能:${c.attributes.instinct ?? 0} 风度:${c.attributes.presence ?? 0} 知识:${c.attributes.knowledge ?? 0}`
        : '属性未设置';

      const weaponStr = c.mainWeapon
        ? `主武器:${c.mainWeapon.name || c.mainWeapon.id}${c.offWeapon ? ` 副武器:${c.offWeapon.name || c.offWeapon.id}` : ''}`
        : '武器未装备';

      const domainCards = c.domainCardConfig?.loadout?.length
        ? c.domainCardConfig.loadout.map(dc => dc.name).join('、')
        : '无';

      const conditionsStr = c.conditions?.length
        ? c.conditions.map(cond => cond.condition).join('、')
        : '无';

      const experiencesStr = c.experiences?.length
        ? c.experiences.map(e => `${e.name}(+${e.modifier})`).join('、')
        : '无';

      const inventoryStr = c.inventory?.length
        ? c.inventory.slice(0, 10).map(i => i.name).join('、') + (c.inventory.length > 10 ? ` 等${c.inventory.length}件` : '')
        : '空';

      const scarsStr = c.scars?.length
        ? c.scars.map(s => s.name).join('、')
        : '无';

      const backstoryStr = c.backstory ? `\n背景: ${c.backstory.substring(0, 100)}` : '';
      const questStr = c.personalQuest ? `\n个人任务: ${c.personalQuest.substring(0, 80)}` : '';

      return `${isActive ? '▶ ' : '  '}${c.name}（${c.classId}${c.subclassId ? '/' + c.subclassId : ''} ${c.ancestryId} Lv.${c.level}）
  HP:${c.hp}/${c.maxHp} 压力:${c.stress}/${c.maxStress} 希望:${c.hope}/${c.maxHope} 护甲槽:${c.armorSlots}/${c.maxArmorSlots}
  闪避:${c.evasion} 阈值:轻度${c.minorThreshold}/重度${c.majorThreshold}/严重${c.severeThreshold}
  属性: ${attrs}
  状态: ${conditionsStr} | 伤痕: ${scarsStr}
  ${weaponStr} | 护甲:${c.armor?.name || c.armor?.id || '无'}
  领域卡: ${domainCards}
  经历: ${experiencesStr}
  物品: ${inventoryStr} | 金币:${c.gold ?? 0}${backstoryStr}${questStr}`;
    };

    let summary: string;

    if (isMultiplayer) {
      // Multi-player: show full party status, filter to connected players
      const connectedChars = context.characters!.filter((c, i) => {
        const player = context.sessionState.players[i];
        return !player || player.isConnected;
      });

      const partyDesc = connectedChars.map((c, i) => {
        const isActive = c.id === char.id;
        return buildCharStatus(c, isActive);
      }).join('\n\n');

      const activeChar = context.activePlayerName
        ? `当前行动：${context.activePlayerName}（${char.name}）`
        : `当前行动：${char.name}`;

      summary = `## 队伍状态（${connectedChars.length}人）
${partyDesc}

${activeChar}

场景：${scene.name} - ${scene.description.substring(0, 200)}
在场NPC: ${scene.npcPresent.join(', ') || '无'}
恐惧点池: ${context.sessionState.fearPoints}（GM资源，见核心规则中恐惧点经济）`;
    } else {
      // Single-player: full status
      summary = `## 当前状态
${buildCharStatus(char, true)}

场景：${scene.name} - ${scene.description.substring(0, 200)}
在场NPC: ${scene.npcPresent.join(', ') || '无'}
恐惧点池: ${context.sessionState.fearPoints}（GM资源，见核心规则中恐惧点经济）`;
    }

    summary += `

战役进度：
当前章节: ${campaign.currentChapter}
当前位置: ${campaign.currentLocation}
已访问地点: ${campaign.visitedLocations.length > 0 ? campaign.visitedLocations.join('、') : '无'}
污染等级: ${campaign.contaminationLevel}/6
翠晶收集: ${campaign.deleriumCollected}
迷雾扩展: ${campaign.hazeExpansion}
封印已发现: ${campaign.sealsFound.length > 0 ? campaign.sealsFound.join('、') : '无'}`;

    // 叙事标记
    const activeFlags = Object.entries(campaign.narrativeFlags)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (activeFlags.length > 0) {
      summary += `\n叙事标记: ${activeFlags.join('、')}`;
    }

    // 个人任务进度
    const personalQuests = Object.values(campaign.personalQuestProgress)
      .filter(q => q.status !== 'notStarted');
    if (personalQuests.length > 0) {
      const questDesc = personalQuests.map(q => {
        const statusLabel: Record<string, string> = { inProgress: '进行中', completed: '已完成', failed: '失败' };
        let desc = `${q.questId} [${statusLabel[q.status] || q.status}]`;
        if (q.currentObjective) desc += ` 当前: ${q.currentObjective}`;
        return desc;
      }).join('；');
      summary += `\n个人任务: ${questDesc}`;
    }

    // 派系任务进度
    const factionQuests = Object.values(campaign.factionQuestProgress)
      .filter(q => q.status !== 'notStarted');
    if (factionQuests.length > 0) {
      const questDesc = factionQuests.map(q => {
        const statusLabel: Record<string, string> = { inProgress: '进行中', completed: '已完成', failed: '失败' };
        let desc = `${q.questId} [${statusLabel[q.status] || q.status}]`;
        if (q.currentObjective) desc += ` 当前: ${q.currentObjective}`;
        return desc;
      }).join('；');
      summary += `\n派系任务: ${questDesc}`;
    }

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

    // 世界观数据
    if (this.worldLore) {
      const factionSummary = this.worldLore.factions
        .map(f => `${f.name}(${f.nameEn}): ${f.ideology.substring(0, 40)}`)
        .join('；');
      if (factionSummary) {
        summary += `\n派系详情: ${factionSummary}`;
      }

      const sceneNpcs = this.worldLore.npcs
        .filter(n => n.locationId === campaign.currentLocation)
        .map(n => `${n.name}(${n.role}, ${n.personality.substring(0, 30)})`)
        .join('；');
      if (sceneNpcs) {
        summary += `\n本地NPC: ${sceneNpcs}`;
      }
    }

    return summary;
  }

  private formatPlayerContent(context: AIGMContext, playerInput: string): string {
    if (context.activePlayerName && context.characters && context.characters.length > 1) {
      return `[${context.activePlayerName}/${context.character.name}]: ${playerInput}`;
    }
    return playerInput;
  }

  private formatDiceResultSummary(result: DualityDiceResult): string {
    const outcomeLabels: Record<string, string> = {
      criticalSuccess: '暴击成功',
      hopeSuccess: '希望成功',
      fearSuccess: '恐惧成功',
      hopeFailure: '希望失败',
      fearFailure: '恐惧失败',
    };
    const label = outcomeLabels[result.outcome] || result.outcome;
    let summary = `【骰子判定结果（已结算）】${label}：希望骰${result.hopeDie} 恐惧骰${result.fearDie} 总计${result.total} vs 难度${result.difficulty}`;
    if (result.hopeGain > 0) summary += `，角色希望+${result.hopeGain}`;
    if (result.fearGain > 0) summary += `，GM恐惧+${result.fearGain}`;
    if (result.stressCleared > 0) summary += `，角色压力-${result.stressCleared}`;
    if (result.isCritical) summary += '（暴击：双骰相同，自动成功，角色可执行免费行动）';
    summary += '。请基于此既定结果进行叙事。';
    return summary;
  }

  private buildConversationMessages(
    history: HistoryEntry[],
    currentPlayerInput: string | undefined,
    context: AIGMContext,
    includeStateReminder: boolean,
    maxHistoryTokens: number = 100000,
  ): GatewayMessage[] {
    const MAX_ENTRIES = 50;
    let recentHistory = history.slice(-MAX_ENTRIES);

    // Token budget safety: trim from the front if estimated tokens exceed limit
    let estimatedTokens = this.estimateHistoryTokens(recentHistory);
    while (estimatedTokens > maxHistoryTokens && recentHistory.length > 2) {
      recentHistory = recentHistory.slice(2);
      estimatedTokens = this.estimateHistoryTokens(recentHistory);
    }

    const messages: GatewayMessage[] = [];

    for (const msg of recentHistory) {
      if (msg.role === 'player') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'narrator' || msg.role === 'system' || msg.role === 'combat') {
        messages.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'npc') {
        messages.push({ role: 'assistant', content: `[${msg.npcName || 'NPC'}] ${msg.content}` });
      }
    }

    // Append current player input as the final user message
    if (currentPlayerInput) {
      let userContent = this.formatPlayerContent(context, currentPlayerInput);
      if (includeStateReminder) {
        userContent += this.stateReminder;
      }
      messages.push({ role: 'user', content: userContent });
    }

    return messages;
  }

  private estimateHistoryTokens(history: HistoryEntry[]): number {
    return history.reduce((total, msg) => {
      const content = msg.content;
      const chineseChars = (content.match(/[一-鿿㐀-䶿]/g) || []).length;
      const otherChars = content.length - chineseChars;
      return total + chineseChars * 2 + Math.ceil(otherChars / 4);
    }, 0);
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

  getWorldLore(): WorldLore | undefined {
    return this.worldLore ?? undefined;
  }

  getGateway(): AIGateway {
    return this.gateway;
  }

  getConfig(): AIGMConfig {
    return { ...this.config };
  }

  /**
   * Generate an adventure summary in third-person novel style
   */
  async generateAdventureSummary(
    context: AIGMContext,
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ summary: string; milestones: string[] }> {
    const prompt = `你是一位小说家。请为以下这场Daggerheart RPG冒险撰写一段第三人称小说式总结（300-500字）。
同时提取3-5个关键里程碑事件。

输出JSON格式：
{
  "summary": "小说式总结...",
  "milestones": ["里程碑1", "里程碑2", ...]
}

冒险对话记录：
${messages.slice(-50).map(m => `[${m.role}]: ${m.content}`).join('\n')}

角色：${context.character.name}（${context.character.classId}）
当前状态：HP ${context.character.hp}/${context.character.maxHp}，压力 ${context.character.stress}/${context.character.maxStress}`;

    try {
      const response = await this.gateway.sendRequest({
        model: this.config.narratorModel || this.config.gateway.defaultModel,
        messages: [
          { role: 'system', content: '你是小说家，擅长将RPG冒险总结为引人入胜的短篇叙事。只输出JSON。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 1024,
        agentType: 'summary',
      });

      const json = response.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(json);
      return {
        summary: parsed.summary || '冒险结束。',
        milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [],
      };
    } catch (err) {
      console.error('Adventure summary generation failed:', err);
      return {
        summary: '冒险结束了。英雄们的故事将被铭记。',
        milestones: [],
      };
    }
  }
}
