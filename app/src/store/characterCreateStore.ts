import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreationStepDef, CreationFlowDef } from '@trpgmaster/shared';

export interface CharacterConnection {
  name: string;
  relationship: string;
  description: string;
}

// ===== Legacy step types (kept for backward compatibility) =====

export type CreationStep =
  | 'class'
  | 'ancestry'
  | 'community'
  | 'attributes'
  | 'resources'
  | 'equipment'
  | 'backstory'
  | 'domainCards'
  | 'connections';

const LEGACY_STEPS: CreationStep[] = [
  'class', 'ancestry', 'community', 'attributes',
  'resources', 'equipment', 'backstory', 'domainCards', 'connections',
];

export const STEP_LABELS: Record<CreationStep, string> = {
  class: '职业',
  ancestry: '种族',
  community: '社群',
  attributes: '属性',
  resources: '资源',
  equipment: '装备',
  backstory: '背景',
  domainCards: '领域卡',
  connections: '人际关系',
};

export const STEP_DESCRIPTIONS: Record<CreationStep, string> = {
  class: '选择你的职业和子职业',
  ancestry: '选择你的种族',
  community: '选择你的成长社群',
  attributes: '分配属性值 (+2,+1,+1,0,0,-1)',
  resources: '记录基础资源（闪避值、生命点、压力点、希望恐惧点）',
  equipment: '选择武器和护甲',
  backstory: '创作你的背景故事',
  domainCards: '选择两张1级领域卡',
  connections: '创作你的人际关系',
};

// ===== Default DH creation flow (used when server is unreachable) =====

const DEFAULT_DH_FLOW: CreationStepDef[] = [
  { id: 'class', label: '职业', description: '选择你的职业和子职业', dataKey: 'classId', renderer: 'select-one', rendererConfig: { dataKey: 'classes', showSubclasses: true, showClassDetails: true } },
  { id: 'ancestry', label: '种族', description: '选择你的种族', dataKey: 'ancestryId', renderer: 'select-one', rendererConfig: { dataKey: 'ancestries', showFeatures: true } },
  { id: 'community', label: '社群', description: '选择你的成长社群', dataKey: 'communityId', renderer: 'select-one', rendererConfig: { dataKey: 'communities', showFeature: true } },
  { id: 'attributes', label: '属性', description: '分配属性值 (+2,+1,+1,0,0,-1)', dataKey: 'attributes', renderer: 'attribute-allocate', rendererConfig: { values: [2, 1, 1, 0, 0, -1], keys: ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] } },
  { id: 'resources', label: '资源', description: '记录基础资源（闪避值、生命点、压力点、希望恐惧点）', dataKey: '_resources', renderer: 'resource-preview', optional: true },
  { id: 'equipment', label: '装备', description: '选择武器和护甲', dataKey: '_equipment', renderer: 'select-one', rendererConfig: { dataKey: 'weapons+armor' } },
  { id: 'backstory', label: '背景', description: '创作你的背景故事', dataKey: '_backstory', renderer: 'text-input', rendererConfig: { fields: [{ key: 'name', label: '角色名', placeholder: '角色名', multiline: false, large: true }, { key: 'backstory', label: '背景故事', placeholder: '你的背景故事...你为何踏上冒险之旅？', multiline: true, lines: 6 }, { key: 'personalQuest', label: '个人任务', placeholder: '个人任务（你希望达成的目标）', multiline: false }] } },
  { id: 'domainCards', label: '领域卡', description: '选择两张1级领域卡', dataKey: 'domainCards', renderer: 'multi-select', rendererConfig: { min: 2, max: 2, dataKey: 'domainCards', filterByClassDomains: true } },
  { id: 'connections', label: '人际关系', description: '创作你的人际关系', dataKey: 'connections', renderer: 'connection-list', optional: true },
];

interface CharacterCreateState {
  // System identity
  systemId: string;
  coreId: string | null;           // Existing CharacterCore ID (for cross-system)

  // Flow definition (fetched from server)
  steps: CreationStepDef[];
  currentStep: number;

  // Generic data bag (replaces DH-specific fields)
  data: Record<string, unknown>;
  errors: Record<string, string[]>;

  // Loading state
  loading: boolean;

  // Actions
  setSystemId: (id: string) => void;
  setCoreId: (id: string | null) => void;
  setSteps: (steps: CreationStepDef[]) => void;
  setStepData: (key: string, value: unknown) => void;
  setLoading: (loading: boolean) => void;
  setErrors: (errors: Record<string, string[]>) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
  getCurrentStepDef: () => CreationStepDef | undefined;
  getTotalSteps: () => number;

  // Legacy compatibility helpers — expose data bag as typed accessors
  getCurrentStep: () => CreationStep;
}

const initialState = {
  systemId: 'daggerheart',
  coreId: null as string | null,
  steps: DEFAULT_DH_FLOW as CreationStepDef[],
  currentStep: 0,
  data: {} as Record<string, unknown>,
  errors: {} as Record<string, string[]>,
  loading: true,
};

export const useCharacterCreateStore = create<CharacterCreateState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSystemId: (id) => set({ systemId: id }),
      setCoreId: (id) => set({ coreId: id }),
      setSteps: (steps) => set({ steps }),
      setStepData: (key, value) => set((state) => ({
        data: { ...state.data, [key]: value },
      })),
      setLoading: (loading) => set({ loading }),
      setErrors: (errors) => set({ errors }),

      goNext: () => set((state) => ({
        currentStep: Math.min(state.currentStep + 1, state.steps.length - 1),
      })),

      goBack: () => set((state) => ({
        currentStep: Math.max(state.currentStep - 1, 0),
      })),

      goToStep: (step) => set((state) => ({
        currentStep: Math.max(0, Math.min(step, state.steps.length - 1)),
      })),

      reset: () => set(initialState),

      getCurrentStepDef: () => {
        const { steps, currentStep } = get();
        return steps[currentStep];
      },

      getTotalSteps: () => get().steps.length,

      // Legacy: map current step index to the old CreationStep union type
      getCurrentStep: () => {
        const { steps, currentStep } = get();
        const stepDef = steps[currentStep];
        if (stepDef && (LEGACY_STEPS as readonly string[]).includes(stepDef.id)) {
          return stepDef.id as CreationStep;
        }
        // Default fallback for non-legacy steps
        return 'class';
      },
    }),
    {
      name: 'character-create-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist loading state — always start false after rehydration
      partialize: (state) => ({
        systemId: state.systemId,
        coreId: state.coreId,
        steps: state.steps,
        currentStep: state.currentStep,
        data: state.data,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<CharacterCreateState>),
        loading: false, // Always override: don't persist loading=true
      }),
    },
  ),
);
