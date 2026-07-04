import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface TutorialStep {
  title: string;
  content: string;
  highlight?: string;
}

interface Tutorial {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  steps: TutorialStep[];
}

const TUTORIALS: Tutorial[] = [
  {
    id: 'dice',
    title: '骰子系统',
    icon: 'dice',
    color: '#3498db',
    steps: [
      {
        title: '双骰系统 (Duality Dice)',
        content: 'Daggerheart 使用两颗 d12 骰子：希望骰（Hope Die）和恐惧骰（Fear Die）。每次检定同时投掷两颗骰子，结果决定行动的成败和叙事走向。',
      },
      {
        title: '五种结果',
        content: '希望 > 恐惧 → 成功与希望（有利下次检定）\n希望 = 恐惧 → 临界成功（纯成功）\n希望 < 恐惧 → 失败与恐惧（GM获得1恐惧点）\n双1 → 灾难性失败\n双12 → 临界成功 + 清除1压力',
        highlight: '双12是最幸运的结果！',
      },
      {
        title: '希望点与恐惧点',
        content: '成功与希望时获得1希望点，失败与恐惧时GM获得1恐惧点。希望点可以用于增益检定、使用领域卡等。恐惧点是GM的资源，用于触发额外行动、环境效果等。',
      },
      {
        title: '属性修正',
        content: '检定时加上对应属性的修正值（-1到+2）。六个属性：敏捷、力量、灵巧、本能、风度、知识。不同行动使用不同属性。',
      },
    ],
  },
  {
    id: 'character',
    title: '角色创建',
    icon: 'person-add',
    color: '#2ecc71',
    steps: [
      {
        title: '选择血统 (Ancestry)',
        content: '血统决定角色的种族特征，提供独特的被动能力和叙事特征。例如：龙裔的鳞片护甲、精灵的快速反应、矮人的坚韧等。',
      },
      {
        title: '选择社区 (Community)',
        content: '社区代表角色成长的环境，提供社交特征和特定情境下的检定优势。例如：学术社区在知识检定上有优势，边境社区在生存检定上有优势。',
      },
      {
        title: '选择职业 (Class)',
        content: '职业决定角色的核心玩法：生命值、压力值、希望值、闪避值、伤害阈值，以及职业特性和领域卡。每个职业有独特的希望特性和职业特性。',
      },
      {
        title: '分配属性',
        content: '将属性值分配到六个属性中。通常有+2、+1、+0、+0、-1的分配方式。属性直接影响检定修正和伤害阈值。',
      },
      {
        title: '选择领域卡',
        content: '根据职业的领域选择初始领域卡。领域卡消耗希望点使用，提供强大的战斗和叙事效果。随着升级可以获取更多领域卡。',
      },
    ],
  },
  {
    id: 'combat',
    title: '战斗流程',
    icon: 'flash',
    color: '#e74c3c',
    steps: [
      {
        title: '聚光灯 (Spotlight)',
        content: 'Daggerheart 使用聚光灯系统而非传统先攻。GM将聚光灯交给玩家，玩家决定行动顺序。每个角色每轮获得一次聚光灯，所有玩家行动后敌人行动。',
      },
      {
        title: '攻击与伤害',
        content: '攻击时投掷双骰+属性修正，与目标闪避值比较。超过闪避值则命中，造成武器伤害骰+属性修正的伤害。未超过则未命中。',
      },
      {
        title: '压力与伤害阈值',
        content: '角色有压力值和三个伤害阈值（轻度/重度/严重）。受到伤害时先消耗压力，压力清零后伤害与阈值比较：超过轻度→标记压力，超过重度→受到更多压力，超过严重→濒死。',
        highlight: '管理压力是生存的关键！',
      },
      {
        title: '敌人行为',
        content: '敌人有预设的行为模式（攻击者、防御者、支援者等）。GM花费恐惧点可以让敌人执行额外行动。敌人回合自动按行为模式执行。',
      },
      {
        title: '休整 (Rest)',
        content: '短休：恢复部分HP和压力，执行1-2个休整行动。长休：恢复全部HP和压力，执行3个休整行动。休整时可以制作物品、研究信息等。',
      },
      {
        title: '濒死与死亡',
        content: 'HP降为0时进入濒死状态。必须选择死亡行动：壮烈牺牲、逃避死亡（希望骰检定）、绝望赌博（双骰检定）。死亡行动决定角色的命运。',
      },
    ],
  },
];

export function TutorialScreen() {
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const startTutorial = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setCurrentStep(0);
  };

  const goBack = () => {
    if (selectedTutorial) {
      if (currentStep > 0) {
        setCurrentStep(currentStep - 1);
      } else {
        setSelectedTutorial(null);
      }
    }
  };

  const goNext = () => {
    if (!selectedTutorial) return;
    if (currentStep < selectedTutorial.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setSelectedTutorial(null);
    }
  };

  const renderTutorialList = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.introText}>
        选择一个教程来了解 Daggerheart 的核心规则和玩法。
      </Text>
      {TUTORIALS.map((tutorial) => (
        <TouchableOpacity
          key={tutorial.id}
          style={styles.tutorialCard}
          onPress={() => startTutorial(tutorial)}
        >
          <View style={[styles.tutorialIcon, { backgroundColor: tutorial.color + '22' }]}>
            <Ionicons name={tutorial.icon} size={28} color={tutorial.color} />
          </View>
          <View style={styles.tutorialInfo}>
            <Text style={styles.tutorialTitle}>{tutorial.title}</Text>
            <Text style={styles.tutorialSteps}>{tutorial.steps.length} 步</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderTutorialStep = () => {
    if (!selectedTutorial) return null;
    const step = selectedTutorial.steps[currentStep];
    const totalSteps = selectedTutorial.steps.length;

    return (
      <View style={styles.stepContainer}>
        {/* Header */}
        <View style={styles.stepHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ecf0f1" />
          </TouchableOpacity>
          <Text style={styles.stepHeaderTitle}>{selectedTutorial.title}</Text>
          <Text style={styles.stepCounter}>{currentStep + 1}/{totalSteps}</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentStep + 1) / totalSteps) * 100}%`, backgroundColor: selectedTutorial.color },
              ]}
            />
          </View>
        </View>

        {/* Content */}
        <ScrollView style={styles.stepContent} contentContainerStyle={styles.stepContentInner}>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepText}>{step.content}</Text>
          {step.highlight && (
            <View style={styles.highlightBox}>
              <Ionicons name="star" size={16} color="#f39c12" />
              <Text style={styles.highlightText}>{step.highlight}</Text>
            </View>
          )}
        </ScrollView>

        {/* Navigation */}
        <View style={styles.stepNav}>
          {currentStep > 0 ? (
            <TouchableOpacity style={styles.navButton} onPress={goBack}>
              <Ionicons name="arrow-back" size={16} color="#bdc3c7" />
              <Text style={styles.navButtonText}>上一步</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity
            style={[styles.navButton, styles.navButtonPrimary, { backgroundColor: selectedTutorial.color }]}
            onPress={goNext}
          >
            <Text style={styles.navButtonTextPrimary}>
              {currentStep < totalSteps - 1 ? '下一步' : '完成'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {selectedTutorial ? renderTutorialStep() : renderTutorialList()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    padding: 16,
  },
  introText: {
    color: '#95a5a6',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  // Tutorial list
  tutorialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tutorialIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tutorialTitle: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: '600',
  },
  tutorialSteps: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 2,
  },
  // Step view
  stepContainer: {
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a3e',
  },
  backButton: {
    padding: 4,
  },
  stepHeaderTitle: {
    flex: 1,
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  stepCounter: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#2c3e50',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  stepContent: {
    flex: 1,
  },
  stepContentInner: {
    padding: 20,
  },
  stepTitle: {
    color: '#ecf0f1',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  stepText: {
    color: '#bdc3c7',
    fontSize: 15,
    lineHeight: 24,
  },
  highlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f39c1222',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#f39c1244',
  },
  highlightText: {
    color: '#f39c12',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  stepNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: '#1a1a3e',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  navButtonPrimary: {
    paddingHorizontal: 20,
  },
  navButtonText: {
    color: '#bdc3c7',
    fontSize: 14,
  },
  navButtonTextPrimary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
