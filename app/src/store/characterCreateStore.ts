import { create } from 'zustand';
import type { Attribute, Experience, DomainCard } from '@trpgmaster/shared';

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

const STEPS: CreationStep[] = [
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

interface CharacterCreateState {
  currentStep: number;
  classId: string | null;
  subclassId: string | null;
  ancestryId: string | null;
  secondAncestryId: string | null;
  mixedAncestryFeature1: string | null;
  mixedAncestryFeature2: string | null;
  communityId: string | null;
  attributes: Record<Attribute, number> | null;
  experiences: Experience[];
  mainWeaponId: string | null;
  offWeaponId: string | null;
  armorId: string | null;
  classBackgroundAnswers: string[];
  classRelationshipAnswers: string[];
  domainCards: DomainCard[];
  name: string;
  backstory: string;
  personalQuest: string;
  connections: CharacterConnection[];
  errors: Record<string, string[]>;

  setClassId: (id: string) => void;
  setSubclassId: (id: string) => void;
  setClassBackgroundAnswer: (index: number, answer: string) => void;
  setClassRelationshipAnswer: (index: number, answer: string) => void;
  setAncestryId: (id: string) => void;
  setSecondAncestryId: (id: string | null) => void;
  setMixedAncestryFeature1: (feature: string | null) => void;
  setMixedAncestryFeature2: (feature: string | null) => void;
  setCommunityId: (id: string) => void;
  setAttributes: (attrs: Record<Attribute, number>) => void;
  setExperiences: (exps: Experience[]) => void;
  setMainWeaponId: (id: string) => void;
  setOffWeaponId: (id: string | null) => void;
  setArmorId: (id: string) => void;
  setDomainCards: (cards: DomainCard[]) => void;
  setName: (name: string) => void;
  setBackstory: (text: string) => void;
  setPersonalQuest: (quest: string) => void;
  setConnections: (connections: CharacterConnection[]) => void;
  addConnection: (connection: CharacterConnection) => void;
  removeConnection: (index: number) => void;
  setErrors: (errors: Record<string, string[]>) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
  getCurrentStep: () => CreationStep;
  getTotalSteps: () => number;
}

export interface CharacterConnection {
  name: string;
  relationship: string; // e.g. "导师", "旧友", "家人"
  description: string;
}

const initialState = {
  currentStep: 0,
  classId: null as string | null,
  subclassId: null as string | null,
  ancestryId: null as string | null,
  secondAncestryId: null as string | null,
  mixedAncestryFeature1: null as string | null,
  mixedAncestryFeature2: null as string | null,
  communityId: null as string | null,
  attributes: null as Record<Attribute, number> | null,
  experiences: [] as Experience[],
  mainWeaponId: null as string | null,
  offWeaponId: null as string | null,
  armorId: null as string | null,
  domainCards: [] as DomainCard[],
  classBackgroundAnswers: [] as string[],
  classRelationshipAnswers: [] as string[],
  name: '',
  backstory: '',
  personalQuest: '',
  connections: [] as CharacterConnection[],
  errors: {} as Record<string, string[]>,
};

export const useCharacterCreateStore = create<CharacterCreateState>((set, get) => ({
  ...initialState,

  setClassId: (id) => set({ classId: id, subclassId: null, classBackgroundAnswers: [], classRelationshipAnswers: [] }),
  setSubclassId: (id) => set({ subclassId: id, classBackgroundAnswers: [], classRelationshipAnswers: [] }),
  setClassBackgroundAnswer: (index, answer) => set((state) => {
    const answers = [...state.classBackgroundAnswers];
    answers[index] = answer;
    return { classBackgroundAnswers: answers };
  }),
  setClassRelationshipAnswer: (index, answer) => set((state) => {
    const answers = [...state.classRelationshipAnswers];
    answers[index] = answer;
    return { classRelationshipAnswers: answers };
  }),
  setAncestryId: (id) => set({ ancestryId: id }),
  setSecondAncestryId: (id) => set({ secondAncestryId: id }),
  setMixedAncestryFeature1: (feature) => set({ mixedAncestryFeature1: feature }),
  setMixedAncestryFeature2: (feature) => set({ mixedAncestryFeature2: feature }),
  setCommunityId: (id) => set({ communityId: id }),
  setAttributes: (attrs) => set({ attributes: attrs }),
  setExperiences: (exps) => set({ experiences: exps }),
  setMainWeaponId: (id) => set({ mainWeaponId: id }),
  setOffWeaponId: (id) => set({ offWeaponId: id }),
  setArmorId: (id) => set({ armorId: id }),
  setDomainCards: (cards) => set({ domainCards: cards }),
  setName: (name) => set({ name }),
  setBackstory: (text) => set({ backstory: text }),
  setPersonalQuest: (quest) => set({ personalQuest: quest }),
  setConnections: (connections) => set({ connections }),
  addConnection: (connection) => set((state) => ({
    connections: [...state.connections, connection],
  })),
  removeConnection: (index) => set((state) => ({
    connections: state.connections.filter((_, i) => i !== index),
  })),
  setErrors: (errors) => set({ errors }),

  goNext: () => set((state) => ({
    currentStep: Math.min(state.currentStep + 1, STEPS.length - 1),
  })),

  goBack: () => set((state) => ({
    currentStep: Math.max(state.currentStep - 1, 0),
  })),

  goToStep: (step) => set({ currentStep: Math.max(0, Math.min(step, STEPS.length - 1)) }),

  reset: () => set(initialState),

  getCurrentStep: () => STEPS[get().currentStep],
  getTotalSteps: () => STEPS.length,
}));
