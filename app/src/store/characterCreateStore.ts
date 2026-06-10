import { create } from 'zustand';
import type { Attribute, Experience, DomainCard } from '@trpgmaster/shared';

export type CreationStep =
  | 'class'
  | 'subclass'
  | 'ancestry'
  | 'community'
  | 'attributes'
  | 'experiences'
  | 'weapons'
  | 'armor'
  | 'domainCards'
  | 'backstory';

const STEPS: CreationStep[] = [
  'class', 'subclass', 'ancestry', 'community', 'attributes',
  'experiences', 'weapons', 'armor', 'domainCards', 'backstory',
];

export const STEP_LABELS: Record<CreationStep, string> = {
  class: '职业',
  subclass: '子职业',
  ancestry: '血统',
  community: '社区',
  attributes: '属性',
  experiences: '经历',
  weapons: '武器',
  armor: '护甲',
  domainCards: '领域卡',
  backstory: '背景',
};

interface CharacterCreateState {
  currentStep: number;
  classId: string | null;
  subclassId: string | null;
  ancestryId: string | null;
  secondAncestryId: string | null;
  mixedAncestryFeature1: string | null; // Feature picked from first ancestry (index 0 or 1)
  mixedAncestryFeature2: string | null; // Feature picked from second ancestry (index 0 or 1)
  communityId: string | null;
  attributes: Record<Attribute, number> | null;
  experiences: Experience[];
  mainWeaponId: string | null;
  offWeaponId: string | null;
  armorId: string | null;
  domainCards: DomainCard[];
  name: string;
  backstory: string;
  personalQuest: string;
  errors: Record<string, string[]>;

  setClassId: (id: string) => void;
  setSubclassId: (id: string) => void;
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
  setErrors: (errors: Record<string, string[]>) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
  getCurrentStep: () => CreationStep;
  getTotalSteps: () => number;
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
  name: '',
  backstory: '',
  personalQuest: '',
  errors: {} as Record<string, string[]>,
};

export const useCharacterCreateStore = create<CharacterCreateState>((set, get) => ({
  ...initialState,

  setClassId: (id) => set({ classId: id }),
  setSubclassId: (id) => set({ subclassId: id }),
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