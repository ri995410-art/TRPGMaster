import { create } from 'zustand';
import type {
  SessionState,
  Character,
  GameEvent,
  PlayerState,
  SceneState,
  CombatState,
  ParsedIntent,
  Suggestion,
  RiskLevel,
  AgentType,
  ClassData,
  WeaponData,
  ArmorData,
  DomainCard,
  Ancestry,
  Community,
  SubclassData,
} from '@trpgmaster/shared';

// Game data for display (fetched from server API)
interface GameDataState {
  classes: ClassData[];
  subclasses: SubclassData[];
  weapons: WeaponData[];
  armor: ArmorData[];
  domainCards: DomainCard[];
  ancestries: Ancestry[];
  communities: Community[];
  loaded: boolean;
}

interface GameStore {
  // Session
  sessionId: string | null;
  sessionState: SessionState | null;
  isConnected: boolean;
  role: 'gm' | 'player' | null;
  playerName: string;
  serverUrl: string;

  // Characters
  characters: Character[];
  myCharacterId: string | null;

  // Game data (classes, weapons, armor, domains for display)
  gameData: GameDataState;

  // Events
  recentEvents: GameEvent[];
  chatMessages: ChatMessage[];

  // Agent suggestions (replaces agentOutputs)
  suggestions: Suggestion[];

  // Generated images
  generatedImages: GeneratedImage[];

  // Input processing
  lastParsedIntent: ParsedIntent | null;
  inputMode: 'text' | 'voice' | 'vision';

  // Agent mode
  agentMode: 'multi' | 'unified';

  // Actions
  setSession: (sessionId: string, state: SessionState) => void;
  setConnected: (connected: boolean) => void;
  setRole: (role: 'gm' | 'player') => void;
  setPlayerName: (name: string) => void;
  setServerUrl: (url: string) => void;
  setCharacters: (characters: Character[]) => void;
  setMyCharacter: (characterId: string) => void;
  addEvent: (event: GameEvent) => void;
  addChatMessage: (msg: ChatMessage) => void;
  removeChatMessage: (messageId: string) => void;
  addSuggestion: (suggestion: Suggestion) => void;
  dismissSuggestion: (id: string) => void;
  adoptSuggestion: (id: string, optionIndex: number, editContent?: string) => void;
  addGeneratedImage: (image: GeneratedImage) => void;
  setParsedIntent: (intent: ParsedIntent | null) => void;
  setInputMode: (mode: 'text' | 'voice' | 'vision') => void;
  setAgentMode: (mode: 'multi' | 'unified') => void;
  setGameData: (data: Partial<GameDataState>) => void;
  updateCharacterHp: (characterId: string, delta: number) => void;
  updateCharacterStress: (characterId: string, delta: number) => void;
  updateCharacterHope: (characterId: string, delta: number) => void;
  updateCharacterFromServer: (character: Character) => void;
  updateFearPoints: (delta: number) => void;
  reset: () => void;
}

interface GeneratedImage {
  id: string;
  url: string;
  category: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
  type: 'player' | 'gm' | 'agent' | 'system';
  typeLabel?: string; // e.g. '[场景]' / '[NPC:老祭司]' / '[战斗]' / '[规则]'
  autoSent?: boolean; // true if auto-sent by L0/L1 risk level
  suggestionId?: string; // track which suggestion generated this message
}

const initialState = {
  sessionId: null,
  sessionState: null,
  isConnected: false,
  role: null,
  playerName: '',
  serverUrl: '',
  characters: [],
  myCharacterId: null,
  gameData: { classes: [], subclasses: [], weapons: [], armor: [], domainCards: [], ancestries: [], communities: [], loaded: false },
  recentEvents: [],
  chatMessages: [],
  suggestions: [],
  generatedImages: [],
  lastParsedIntent: null,
  inputMode: 'text' as const,
  agentMode: 'multi' as const,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setSession: (sessionId, state) => set({ sessionId, sessionState: state }),
  setConnected: (connected) => set({ isConnected: connected }),
  setRole: (role) => set({ role }),
  setPlayerName: (name) => set({ playerName: name }),
  setServerUrl: (url) => set({ serverUrl: url }),
  setCharacters: (characters) => set({ characters }),
  setMyCharacter: (characterId) => set({ myCharacterId: characterId }),

  addEvent: (event) => set((state) => ({
    recentEvents: [...state.recentEvents.slice(-100), event],
  })),

  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages.slice(-500), msg], // cap at 500 to prevent unbounded growth
  })),

  removeChatMessage: (messageId) => set((state) => ({
    chatMessages: state.chatMessages.filter(m => m.id !== messageId),
  })),

  addSuggestion: (suggestion) => set((state) => ({
    suggestions: [...state.suggestions.slice(-20), suggestion],
  })),

  addGeneratedImage: (image) => set((state) => ({
    generatedImages: [...state.generatedImages.slice(-10), image],
  })),

  dismissSuggestion: (id) => set((state) => ({
    suggestions: state.suggestions.filter(s => s.id !== id),
  })),

  adoptSuggestion: (id, optionIndex, editContent) => {
    const state = get();
    const suggestion = state.suggestions.find(s => s.id === id);
    if (!suggestion || optionIndex >= suggestion.options.length) return;

    // Just remove from suggestions - the server will broadcast chat:message
    // which the useSocket handler will add to chatMessages
    set((state) => ({
      suggestions: state.suggestions.filter(s => s.id !== id),
    }));
  },

  setParsedIntent: (intent) => set({ lastParsedIntent: intent }),
  setInputMode: (mode) => set({ inputMode: mode }),
  setAgentMode: (mode) => set({ agentMode: mode }),
  setGameData: (data) => set((state) => ({
    gameData: { ...state.gameData, ...data },
  })),

  updateCharacterHp: (characterId, delta) => set((state) => ({
    characters: state.characters.map(c =>
      c.id === characterId
        ? { ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) }
        : c
    ),
  })),

  updateCharacterStress: (characterId, delta) => set((state) => ({
    characters: state.characters.map(c => {
      if (c.id !== characterId) return c;
      const newStress = c.stress + delta;
      // If stress would overflow max, mark HP instead (matching backend logic)
      if (newStress > c.maxStress) {
        const overflow = newStress - c.maxStress;
        return { ...c, stress: c.maxStress, hp: Math.max(0, c.hp - overflow) };
      }
      return { ...c, stress: Math.max(0, newStress) };
    }),
  })),

  updateCharacterHope: (characterId, delta) => set((state) => ({
    characters: state.characters.map(c =>
      c.id === characterId
        ? { ...c, hope: Math.max(0, Math.min(c.maxHope, c.hope + delta)) }
        : c
    ),
  })),

  updateCharacterFromServer: (character) => set((state) => ({
    characters: state.characters.map(c =>
      c.id === character.id ? { ...character } : c
    ),
  })),

  updateFearPoints: (delta) => set((state) => ({
    sessionState: state.sessionState
      ? { ...state.sessionState, fearPoints: state.sessionState.fearPoints + delta }
      : null,
  })),

  reset: () => set(initialState),
}));
