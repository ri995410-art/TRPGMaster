import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  SessionState,
  Character,
  GameEvent,
  ClassData,
  WeaponData,
  ArmorData,
  DomainCard,
  AncestryData,
  CommunityData,
  SubclassData,
} from '@trpgmaster/shared';
import { mmkvStorage } from './mmkvStorage';

// ===== Game data for display (fetched from server API) =====

interface GameDataState {
  classes: ClassData[];
  subclasses: SubclassData[];
  weapons: WeaponData[];
  armor: ArmorData[];
  domainCards: DomainCard[];
  ancestries: AncestryData[];
  communities: CommunityData[];
  loaded: boolean;
}

// ===== Chat message for the adventure screen =====

export interface AdventureMessage {
  id: string;
  role: 'player' | 'narrator' | 'npc' | 'system';
  content: string;
  timestamp: number;
  npcName?: string;
  npcId?: string;
  choices?: AdventureChoice[];
}

export interface AdventureChoice {
  id: string;
  text: string;
  action?: string;
}

// ===== Journal entry =====

export interface JournalEntry {
  id: string;
  type: 'quest' | 'event' | 'discovery' | 'faction' | 'npc';
  title: string;
  content: string;
  timestamp: number;
  relatedId?: string; // quest id, faction id, npc id, etc.
  completed?: boolean;
}

// ===== Main store =====

interface GameStore {
  // Campaign & Session
  campaignId: string | null;
  sessionState: SessionState | null;
  isConnected: boolean;
  serverUrl: string | null;
  playerId: string;                 // Stable player ID (uuid), persisted across reconnects

  // Character (single player — active character)
  character: Character | null;

  // Multi-character support
  characters: Character[];           // All local characters
  activeCharacterId: string | null;  // Currently active character ID

  // Game data (classes, weapons, armor, domains for display)
  gameData: GameDataState;

  // Adventure messages (chat with AI GM)
  adventureMessages: AdventureMessage[];

  // AI is processing
  aiProcessing: boolean;

  // Journal entries
  journalEntries: JournalEntry[];

  // Events
  recentEvents: GameEvent[];

  // Current scene info
  currentLocationName: string;
  currentLocationDanger: number;
  currentHazeLevel: string;
  fearPoints: number;

  // Multi-player session info
  sessionCode: string | null;         // Room code for current session
  isHost: boolean;                    // Whether this client is the host
  players: Array<{                    // Players in current session
    id: string;
    name: string;
    characterName?: string;
    isConnected: boolean;
  }>;

  // Session Zero info
  sessionZeroPhase: string | null;    // Current S0 phase (safety/worldbuilding/connections/expectations/narrativePact)

  // AI config (fetched from server)
  aiConfig: {
    apiKey: string;           // 脱敏显示（如 ••••a1b2）
    baseUrl: string;
    defaultModel: string;
    narratorModel: string;
    temperature: number;
    maxTokens: number;
    aiConnected: boolean;     // AI API 是否连通
  } | null;

  // Actions
  setCampaign: (campaignId: string, state: SessionState) => void;
  setConnected: (connected: boolean) => void;
  setServerUrl: (url: string | null) => void;
  setCharacter: (character: Character) => void;
  updateCharacter: (partial: Partial<Character>) => void;
  setGameData: (data: Partial<GameDataState>) => void;
  addAdventureMessage: (msg: AdventureMessage) => void;
  setAdventureMessages: (msgs: AdventureMessage[]) => void;
  clearAdventureMessages: () => void;
  setAiProcessing: (processing: boolean) => void;
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
  addEvent: (event: GameEvent) => void;
  updateSceneInfo: (locationName: string, danger: number, hazeLevel: string) => void;
  updateFearPoints: (delta: number) => void;
  updateCharacterHp: (delta: number) => void;
  updateCharacterStress: (delta: number) => void;
  updateCharacterHope: (delta: number) => void;
  updateCharacterArmorSlots: (delta: number) => void;
  updateCharacterFromServer: (character: Character) => void;
  // Multi-character actions
  addCharacter: (character: Character) => void;
  removeCharacter: (characterId: string) => void;
  setActiveCharacter: (characterId: string) => void;
  updateCharacterById: (characterId: string, updates: Partial<Character>) => void;
  // Multi-player session actions
  setSessionCode: (code: string | null) => void;
  setIsHost: (isHost: boolean) => void;
  setPlayers: (players: Array<{ id: string; name: string; characterName?: string; isConnected: boolean }>) => void;
  // Session Zero actions
  setSessionZeroPhase: (phase: string | null) => void;
  // AI config actions
  setAiConfig: (config: GameStore['aiConfig']) => void;
  setAiConnected: (connected: boolean) => void;
  initPlayerId: () => void;           // Generate playerId if not set
  reset: () => void;
}

const initialState = {
  campaignId: null,
  sessionState: null,
  isConnected: false,
  serverUrl: null,
  playerId: '',
  character: null,
  characters: [],
  activeCharacterId: null,
  gameData: { classes: [], subclasses: [], weapons: [], armor: [], domainCards: [], ancestries: [], communities: [], loaded: false },
  adventureMessages: [],
  aiProcessing: false,
  journalEntries: [],
  recentEvents: [],
  currentLocationName: '',
  currentLocationDanger: 0,
  currentHazeLevel: 'none',
  fearPoints: 0,
  sessionCode: null,
  isHost: false,
  players: [],
  sessionZeroPhase: null,
  aiConfig: null,
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCampaign: (campaignId, state) => set({
        campaignId,
        sessionState: state,
        fearPoints: state.fearPoints,
      }),

      setConnected: (connected) => set({ isConnected: connected }),

      setServerUrl: (url) => set({ serverUrl: url }),

      setCharacter: (character) => set({ character }),

      updateCharacter: (partial) => set((state) => ({
        character: state.character ? { ...state.character, ...partial } : null,
      })),

      setGameData: (data) => set((state) => ({
        gameData: { ...state.gameData, ...data },
      })),

      addAdventureMessage: (msg) => set((state) => ({
        adventureMessages: [...state.adventureMessages.slice(-500), msg],
      })),

      setAdventureMessages: (msgs) => set({ adventureMessages: msgs }),

      clearAdventureMessages: () => set({ adventureMessages: [] }),

      setAiProcessing: (processing) => set({ aiProcessing: processing }),

      addJournalEntry: (entry) => set((state) => ({
        journalEntries: [...state.journalEntries, entry],
      })),

      updateJournalEntry: (id, updates) => set((state) => ({
        journalEntries: state.journalEntries.map(e =>
          e.id === id ? { ...e, ...updates } : e
        ),
      })),

      addEvent: (event) => set((state) => ({
        recentEvents: [...state.recentEvents.slice(-100), event],
      })),

      updateSceneInfo: (locationName, danger, hazeLevel) => set({
        currentLocationName: locationName,
        currentLocationDanger: danger,
        currentHazeLevel: hazeLevel,
      }),

      updateFearPoints: (delta) => set((state) => ({
        fearPoints: Math.max(0, state.fearPoints + delta),
      })),

      updateCharacterHp: (delta) => set((state) => {
        if (!state.character) return {};
        const newHp = Math.max(0, Math.min(state.character.maxHp, state.character.hp + delta));
        return { character: { ...state.character, hp: newHp } };
      }),

      updateCharacterStress: (delta) => set((state) => {
        if (!state.character) return {};
        const char = state.character;
        let newStress = char.stress + delta;
        let newHp = char.hp;
        // If stress overflows max, mark HP
        if (newStress > char.maxStress) {
          const overflow = newStress - char.maxStress;
          newStress = char.maxStress;
          newHp = Math.max(0, char.hp - overflow);
        }
        return { character: { ...char, stress: Math.max(0, newStress), hp: newHp } };
      }),

      updateCharacterHope: (delta) => set((state) => {
        if (!state.character) return {};
        return { character: { ...state.character, hope: Math.max(0, Math.min(state.character.maxHope, state.character.hope + delta)) } };
      }),

      updateCharacterArmorSlots: (delta) => set((state) => {
        if (!state.character) return {};
        return { character: { ...state.character, armorSlots: Math.max(0, Math.min(state.character.maxArmorSlots, state.character.armorSlots + delta)) } };
      }),

      updateCharacterFromServer: (character) => set({ character }),

      // Multi-character actions
      addCharacter: (character) => set((state) => {
        const existing = state.characters.find(c => c.id === character.id);
        let newCharacters: Character[];
        if (existing) {
          // Update existing character
          newCharacters = state.characters.map(c => c.id === character.id ? character : c);
        } else {
          newCharacters = [...state.characters, character];
        }
        // If this is the first character or matches activeCharacterId, set as active
        const newActiveId = state.activeCharacterId || character.id;
        const activeChar = newCharacters.find(c => c.id === newActiveId) || newCharacters[0] || null;
        return {
          characters: newCharacters,
          activeCharacterId: newActiveId,
          character: activeChar,
        };
      }),

      removeCharacter: (characterId) => set((state) => {
        const newCharacters = state.characters.filter(c => c.id !== characterId);
        const newActiveId = state.activeCharacterId === characterId
          ? (newCharacters[0]?.id || null)
          : state.activeCharacterId;
        const activeChar = newCharacters.find(c => c.id === newActiveId) || null;
        return {
          characters: newCharacters,
          activeCharacterId: newActiveId,
          character: activeChar,
        };
      }),

      setActiveCharacter: (characterId) => set((state) => {
        const char = state.characters.find(c => c.id === characterId);
        if (!char) return {};
        return {
          activeCharacterId: characterId,
          character: char,
        };
      }),

      updateCharacterById: (characterId, updates) => set((state) => {
        const newCharacters = state.characters.map(c =>
          c.id === characterId ? { ...c, ...updates } : c
        );
        // If this is the active character, update the main character ref too
        const isActive = state.activeCharacterId === characterId;
        return {
          characters: newCharacters,
          character: isActive
            ? { ...state.character!, ...updates }
            : state.character,
        };
      }),

      // Multi-player session actions
      setSessionCode: (code) => set({ sessionCode: code }),
      setIsHost: (isHost) => set({ isHost }),
      setPlayers: (players) => set({ players }),

      // Session Zero actions
      setSessionZeroPhase: (phase) => set({ sessionZeroPhase: phase }),

      // AI config actions
      setAiConfig: (config) => set({ aiConfig: config }),
      setAiConnected: (connected) => set((state) => {
        if (!state.aiConfig) return {};
        return { aiConfig: { ...state.aiConfig, aiConnected: connected } };
      }),

      initPlayerId: () => set((state) => {
        if (state.playerId) return {};
        return { playerId: uuidv4() };
      }),

      reset: () => set(initialState),
    }),
    {
      name: 'trpgmaster-game-storage',
      storage: createJSONStorage(() => mmkvStorage),
      // Only persist these fields — transient data like isConnected/aiProcessing is not saved
      partialize: (state) => ({
        playerId: state.playerId,
        campaignId: state.campaignId,
        character: state.character,
        characters: state.characters,
        activeCharacterId: state.activeCharacterId,
        adventureMessages: state.adventureMessages.slice(-100), // Keep last 100 messages
        journalEntries: state.journalEntries,
        currentLocationName: state.currentLocationName,
        fearPoints: state.fearPoints,
        serverUrl: state.serverUrl,
        sessionCode: state.sessionCode,
        aiConfig: state.aiConfig ? {
          ...state.aiConfig,
          apiKey: '',  // Don't persist API key for security
        } : null,
      }),
    },
  ),
);
