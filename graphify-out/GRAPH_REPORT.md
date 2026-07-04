# Graph Report - .  (2026-07-05)

## Corpus Check
- 291 files · ~246,641 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1601 nodes · 2776 edges · 169 communities (155 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI Gateway & Effects|AI Gateway & Effects]]
- [[_COMMUNITY_DaggerHeart Rules Engine|DaggerHeart Rules Engine]]
- [[_COMMUNITY_Socket Server|Socket Server]]
- [[_COMMUNITY_State Manager|State Manager]]
- [[_COMMUNITY_Rules Helpers|Rules Helpers]]
- [[_COMMUNITY_Character Creation UI|Character Creation UI]]
- [[_COMMUNITY_Shared Type Definitions|Shared Type Definitions]]
- [[_COMMUNITY_Socket Validation|Socket Validation]]
- [[_COMMUNITY_Shared Type Functions|Shared Type Functions]]
- [[_COMMUNITY_AI Config Service|AI Config Service]]
- [[_COMMUNITY_Dice Tray & Spotlight|Dice Tray & Spotlight]]
- [[_COMMUNITY_Data Provider|Data Provider]]
- [[_COMMUNITY_App Dependencies|App Dependencies]]
- [[_COMMUNITY_Navigation & Socket Hooks|Navigation & Socket Hooks]]
- [[_COMMUNITY_File Session Store|File Session Store]]
- [[_COMMUNITY_Server Dependencies|Server Dependencies]]
- [[_COMMUNITY_Enemy Behavior|Enemy Behavior]]
- [[_COMMUNITY_Root Package Config|Root Package Config]]
- [[_COMMUNITY_Encounter Builder|Encounter Builder]]
- [[_COMMUNITY_Character Domain Types|Character Domain Types]]
- [[_COMMUNITY_Drakkenheim Campaign|Drakkenheim Campaign]]
- [[_COMMUNITY_Combat Resolution|Combat Resolution]]
- [[_COMMUNITY_AI Game Master Core|AI Game Master Core]]
- [[_COMMUNITY_Loot & Scene Search|Loot & Scene Search]]
- [[_COMMUNITY_Reaction System|Reaction System]]
- [[_COMMUNITY_App Expo Config|App Expo Config]]
- [[_COMMUNITY_Feature Tray & Narrative|Feature Tray & Narrative]]
- [[_COMMUNITY_Home & Session Screens|Home & Session Screens]]
- [[_COMMUNITY_Rules Engine Interface|Rules Engine Interface]]
- [[_COMMUNITY_Playtest Runner|Playtest Runner]]
- [[_COMMUNITY_Session Persistence|Session Persistence]]
- [[_COMMUNITY_AI Module Exports|AI Module Exports]]
- [[_COMMUNITY_Character Creator|Character Creator]]
- [[_COMMUNITY_Combat Resolver Core|Combat Resolver Core]]
- [[_COMMUNITY_Agent & Campaign Types|Agent & Campaign Types]]
- [[_COMMUNITY_App TSConfig|App TSConfig]]
- [[_COMMUNITY_Session Registry|Session Registry]]
- [[_COMMUNITY_Card Effects|Card Effects]]
- [[_COMMUNITY_Event Subscriptions|Event Subscriptions]]
- [[_COMMUNITY_Event Bus|Event Bus]]
- [[_COMMUNITY_Eval Test Runner|Eval Test Runner]]
- [[_COMMUNITY_Server TSConfig|Server TSConfig]]
- [[_COMMUNITY_Shared TSConfig|Shared TSConfig]]
- [[_COMMUNITY_Game Screens|Game Screens]]
- [[_COMMUNITY_Shared Package Config|Shared Package Config]]
- [[_COMMUNITY_Combat Socket Actions|Combat Socket Actions]]
- [[_COMMUNITY_AI Game Master Pool|AI Game Master Pool]]
- [[_COMMUNITY_Build & Trait Effects|Build & Trait Effects]]
- [[_COMMUNITY_Character Level Up|Character Level Up]]
- [[_COMMUNITY_Character Creator Flow|Character Creator Flow]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 72|Community 72]]

## God Nodes (most connected - your core abstractions)
1. `StateManager` - 88 edges
2. `DaggerHeartRules` - 73 edges
3. `SocketServer` - 61 edges
4. `AIGameMaster` - 37 edges
5. `useGameStore` - 35 edges
6. `AIGateway` - 31 edges
7. `SessionRegistry` - 26 edges
8. `IRulesEngine` - 25 edges
9. `DrakkenheimCampaign` - 23 edges
10. `CharacterCreator` - 19 edges

## Surprising Connections (you probably didn't know these)
- `runSimulation()` --calls--> `extractJournalEntries()`  [INFERRED]
  server/src/__tests__/integration/AdventureSimulation.test.ts → app/src/hooks/useSocket.ts
- `runSimulation()` --calls--> `getDamageSeverity()`  [INFERRED]
  server/src/__tests__/integration/AdventureSimulation.test.ts → shared/types/character.ts
- `LevelUpScreen()` --calls--> `getTier()`  [INFERRED]
  app/src/screens/LevelUpScreen.tsx → shared/types/rules.ts
- `getEnemyIdList()` --calls--> `getDataProvider()`  [INFERRED]
  server/src/ai/extractGmEffects.ts → server/src/rules/DataProviderRegistry.ts
- `SessionEntry` --references--> `StateManager`  [EXTRACTED]
  server/src/core/SessionRegistry.ts → server/src/core/StateManager.ts

## Import Cycles
- 1-file cycle: `app/metro.config.js -> app/metro.config.js`
- 3-file cycle: `shared/types/base.ts -> shared/types/character.ts -> shared/types/rules.ts -> shared/types/base.ts`

## Communities (169 total, 14 thin omitted)

### Community 0 - "AI Gateway & Effects"
Cohesion: 0.06
Nodes (25): AIGateway, buildSystemPrompt(), extractGmEffects(), extractJsonFromContent(), getEnemyIdList(), IMMEDIATE_COMBAT_PATTERNS, narrationHasCombatSignals(), NON_COMBAT_CONTEXTS (+17 more)

### Community 4 - "Rules Helpers"
Cohesion: 0.08
Nodes (43): addCondition(), applyStressOverflow(), attributeToModifier(), avoidDeath(), calculateEvasion(), calculateThresholds(), canShortRest(), changeFactionRelation() (+35 more)

### Community 5 - "Character Creation UI"
Cohesion: 0.08
Nodes (31): AttributeAllocateStep(), DEFAULT_ATTRIBUTE_KEYS, DEFAULT_ATTRIBUTE_VALUES, styles, ConnectionListStep(), styles, DOMAIN_LABELS, MultiSelectStep() (+23 more)

### Community 6 - "Shared Type Definitions"
Cohesion: 0.07
Nodes (42): AIGMContext, AIGMResponse, GameCampaignState, Character, EnemyAttack, EnemyBehaviorType, EnemyExperienceData, EnemyFeature (+34 more)

### Community 7 - "Socket Validation"
Cohesion: 0.08
Nodes (38): ConnectedClient, SocketMessage, actionUseFeaturePayload, characterResourceUpdatePayload, characterUpdatePayload, chatMessagePayload, combatActionPayload, combatAddEnemyPayload (+30 more)

### Community 8 - "Shared Type Functions"
Cohesion: 0.06
Nodes (39): calculateThresholds(), getDamageSeverity(), getHpLossFromSeverity(), AdvantageState, AncestryFeature, ARMOR_TRAIT_LABELS, ArmorTrait, ATTRIBUTE_LABELS (+31 more)

### Community 9 - "AI Config Service"
Cohesion: 0.12
Nodes (32): deletePersistedConfig(), getAIConfig(), loadPersistedConfig(), maskApiKey(), PersistedAIConfig, resolveApiKey(), savePersistedConfig(), main() (+24 more)

### Community 10 - "Dice Tray & Spotlight"
Cohesion: 0.07
Nodes (26): DiceTray(), DiceTrayProps, styles, Props, SpotlightIndicator(), styles, activateXCard(), cancelNarration() (+18 more)

### Community 11 - "Data Provider"
Cohesion: 0.06
Nodes (5): DaggerheartDataProvider, daggerheartProvider, providers, GameDataCollection, IDataProvider

### Community 12 - "App Dependencies"
Cohesion: 0.05
Nodes (37): dependencies, expo, expo-font, @expo-google-fonts/cinzel, @expo-google-fonts/eb-garamond, @expo/metro-runtime, expo-status-bar, react (+29 more)

### Community 13 - "Navigation & Socket Hooks"
Cohesion: 0.07
Nodes (28): getSocket(), sendCharacterResourceUpdate(), sendCharacterSetValues(), sendLevelUp(), MainTabParamList, RootStackParamList, Stack, Tab (+20 more)

### Community 14 - "File Session Store"
Cohesion: 0.10
Nodes (6): FileSessionStore, TurnLockState, WaitingLock, HistoryEntry, SessionStore, InMemorySessionStore

### Community 15 - "Server Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, dotenv, express, socket.io, @trpgmaster/shared, uuid, zod, devDependencies (+20 more)

### Community 16 - "Enemy Behavior"
Cohesion: 0.15
Nodes (25): AttackStrategy, averageAttackDamage(), BehaviorContext, buildActionFeatureAction(), buildAttackAction(), buildFearAction(), canActAfterFocus(), canFocusEnemy() (+17 more)

### Community 17 - "Root Package Config"
Cohesion: 0.07
Nodes (26): author, dependencies, react-native, description, devDependencies, eslint, @eslint/js, typescript-eslint (+18 more)

### Community 18 - "Encounter Builder"
Cohesion: 0.12
Nodes (21): calculateBaseCombatPoints(), calculateEncounterBudget(), EncounterAdjustment, EncounterAdjustmentType, EncounterBudget, getEnemyCombatPointCost(), buildEncounter(), buildNarrationPrompt() (+13 more)

### Community 19 - "Character Domain Types"
Cohesion: 0.16
Nodes (25): CharacterCreationStep, DaggerheartCharacter, DamageDiceComponent, DamageFormula, DomainCard, DomainCardConfig, DomainCardType, Experience (+17 more)

### Community 20 - "Drakkenheim Campaign"
Cohesion: 0.09
Nodes (3): DrakkenheimCampaign, DrakkenheimCampaignData, getFactionRelationLevel()

### Community 21 - "Combat Resolution"
Cohesion: 0.13
Nodes (25): ActionDeclaration, AttackResolution, DamageResolution, EnemyAttackResolution, GmEffect, PlayerIntent, PlayerIntentType, RollDeclaration (+17 more)

### Community 23 - "Loot & Scene Search"
Cohesion: 0.13
Nodes (19): playerInputSuggestsCombat(), ConsumableEntry, LootTableEntry, rollD(), rollLootTable(), rollSceneSearchLoot(), typedConsumablesData, typedLootData (+11 more)

### Community 24 - "Reaction System"
Cohesion: 0.17
Nodes (18): applyArmorSlot(), getHpLossFromSeverity(), resolveReactionRoll(), findAvailableReactions(), findTraitReactions(), ReactionContext, ReactionDeclaration, ReactionOption (+10 more)

### Community 25 - "App Expo Config"
Cohesion: 0.09
Nodes (21): backgroundColor, adaptiveIcon, usesCleartextTraffic, expo, android, ios, name, orientation (+13 more)

### Community 26 - "Feature Tray & Narrative"
Cohesion: 0.12
Nodes (14): FeatureItem, FeatureTray(), FeatureTrayProps, styles, NarrativeCard(), Props, styles, GaugeProps (+6 more)

### Community 27 - "Home & Session Screens"
Cohesion: 0.10
Nodes (18): connectToServer(), createSession(), disconnect(), joinDefaultSession(), joinSessionByCode(), rejoinSessionById(), HomeScreen(), HomeScreenNavigationProp (+10 more)

### Community 29 - "Playtest Runner"
Cohesion: 0.16
Nodes (20): addResult(), allMessages, connect(), delay(), fs, generateReport(), http, httpGet() (+12 more)

### Community 30 - "Session Persistence"
Cohesion: 0.17
Nodes (9): loadSessionData(), migrateData(), PersistedAdventureMessage, PersistedSession, PersistedSessionData, safeReplaceFile(), saveSessionData(), tryParseFile() (+1 more)

### Community 31 - "AI Module Exports"
Cohesion: 0.23
Nodes (12): AIGMConfig, SceneAnalysis, AIAgentContext, AIConfig, AIMessage, AIRequest, AIResponse, HttpPostOptions (+4 more)

### Community 32 - "Character Creator"
Cohesion: 0.12
Nodes (14): ALL_ATTRIBUTES, CharacterCreationData, CharacterCreationState, CharacterCreationStep, CREATION_STEPS, VALID_ATTRIBUTE_DISTRIBUTION, daggerheartData, DOMAIN_CARD_1 (+6 more)

### Community 33 - "Combat Resolver Core"
Cohesion: 0.23
Nodes (14): autoArmorPolicy(), resolveAbilityCheck(), resolveDamageToCharacter(), resolveEnemyAttack(), resolvePlayerAttack(), traitModifier(), zhOutcome(), zhSeverity() (+6 more)

### Community 34 - "Agent & Campaign Types"
Cohesion: 0.14
Nodes (18): AIGMGeneratedEvent, CampaignTimelineEntry, ContaminationEffect, ContaminationLevel, DeleriumData, LocationData, RandomTable, RandomTableEntry (+10 more)

### Community 35 - "App TSConfig"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+9 more)

### Community 37 - "Card Effects"
Cohesion: 0.21
Nodes (11): CardEffectResult, cardRequiresRoll(), getCardTotalHopeCost(), resolveCardEffect(), averageDamageFormula(), createDamageFormula(), DamageRollResult, describeDamageFormula() (+3 more)

### Community 38 - "Event Subscriptions"
Cohesion: 0.15
Nodes (14): AIGM_EVENT_SUBSCRIPTIONS, GAME_EVENTS, RULE_ENGINE_SUBSCRIPTIONS, BaseRollOutcome, CharacterCore, CreationFlowDef, CreationStepDef, CreationStepRenderer (+6 more)

### Community 39 - "Event Bus"
Cohesion: 0.13
Nodes (3): EventBus, EventHandler, Subscription

### Community 40 - "Eval Test Runner"
Cohesion: 0.21
Nodes (14): addResult(), allMessages, connect(), delay(), fs, generateReport(), { io }, log() (+6 more)

### Community 41 - "Server TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 42 - "Shared TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+7 more)

### Community 43 - "Game Screens"
Cohesion: 0.18
Nodes (12): App(), useGameData(), sendRestRequest(), AppNavigator(), AdventureScreen(), LONG_REST_OPTIONS, NavigationProp, RestScreen() (+4 more)

### Community 44 - "Shared Package Config"
Cohesion: 0.13
Nodes (14): devDependencies, jest, ts-jest, @types/jest, typescript, main, name, private (+6 more)

### Community 45 - "Combat Socket Actions"
Cohesion: 0.16
Nodes (12): sendAttackAction(), sendCombatAddEnemy(), sendCombatEnd(), sendCombatEnemyTurn(), sendPlayerAction(), CombatScreen(), EnemyCatalogEntry, NavigationProp (+4 more)

### Community 46 - "AI Game Master Pool"
Cohesion: 0.20
Nodes (4): AIGameMasterPool, buildWorldLore(), DANGER_LEVEL_MAP, getPromptProvider()

### Community 47 - "Build & Trait Effects"
Cohesion: 0.22
Nodes (11): CharacterTraitSource, collectTraitEffects(), emptyResult(), getPermanentResourceBonuses(), getTraitAdvantageSources(), resolveSingleEffect(), resolveTraitEffects(), shouldIgnoreDisadvantage() (+3 more)

### Community 48 - "Character Level Up"
Cohesion: 0.22
Nodes (8): ALL_ATTRIBUTES, CharacterLevelUp, LevelUpOption, LevelUpOptionType, LevelUpRequest, LevelUpResult, makeCard(), makeCharacter()

### Community 50 - "Community 50"
Cohesion: 0.20
Nodes (9): JournalScreen(), styles, AdventureChoice, DiceResult, GameDataState, GameStore, initialState, JournalEntry (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.21
Nodes (11): allLogs, generateReport(), jsonLogFile, log(), LOG_DIR, LogEntry, logFile, runTest() (+3 more)

### Community 52 - "Community 52"
Cohesion: 0.26
Nodes (8): AIChoice, applyStateChanges(), extractChoices(), extractStateChanges(), parseStateKeyValue(), StateChange, makeCharacter(), setupStateManagerWithCharacter()

### Community 53 - "Community 53"
Cohesion: 0.20
Nodes (3): SafetyManager, defaultPlay, defaultS0

### Community 56 - "Community 56"
Cohesion: 0.33
Nodes (6): makeCharacter(), makeContext(), makeContextWithWorldLore(), makeRichContext(), makeSessionState(), mockSendRequest

### Community 57 - "Community 57"
Cohesion: 0.22
Nodes (4): ErrorBoundary, Props, State, styles

### Community 58 - "Community 58"
Cohesion: 0.22
Nodes (6): AttackResult, CharacterValidationResult, DamageResult, LevelUpOption, LevelUpResult, validateCharacterSheet()

### Community 59 - "Community 59"
Cohesion: 0.33
Nodes (5): FearAction, FearActionResult, FearActionType, getAvailableFearActions(), resolveFearAction()

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (3): LevelUpScreen(), getDataProvider(), getTier()

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (6): COMBAT_ACTIONS, log(), LOG_DIR, logFile, runTest(), TEST_CHARACTER

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (3): engines, listRulesSystems(), promptProviders

### Community 63 - "Community 63"
Cohesion: 0.33
Nodes (5): sendCampaignReset(), AI_PRESETS, SettingsScreen(), styles, TEMPERATURE_PRESETS

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

## Knowledge Gaps
- **423 isolated node(s):** `name`, `slug`, `version`, `orientation`, `userInterfaceStyle` (+418 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getTier()` connect `Community 60` to `Character Level Up`, `Shared Type Functions`, `Build & Trait Effects`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Why does `runSimulation()` connect `Loot & Scene Search` to `Shared Type Functions`, `Combat Resolver Core`, `Dice Tray & Spotlight`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `extractJournalEntries()` connect `Dice Tray & Spotlight` to `Loot & Scene Search`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _423 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Gateway & Effects` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `DaggerHeart Rules Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.0392156862745098 - nodes in this community are weakly interconnected._
- **Should `Socket Server` be split into smaller, more focused modules?**
  _Cohesion score 0.08503401360544217 - nodes in this community are weakly interconnected._