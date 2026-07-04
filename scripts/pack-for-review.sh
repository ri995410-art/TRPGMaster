#!/bin/bash
# 将项目代码按模块打包为文本文件，方便粘贴到GLM对话框
# 用法: bash scripts/pack-for-review.sh

OUT_DIR="review-packs"
mkdir -p "$OUT_DIR"

pack() {
    local name=$1
    shift
    local files=("$@")
    local outfile="$OUT_DIR/${name}.txt"

    echo "=== 项目: TRPGMaster - Daggerheart TRPG ===" > "$outfile"
    echo "=== 模块: $name ===" >> "$outfile"
    echo "=== 生成时间: $(date) ===" >> "$outfile"
    echo "" >> "$outfile"

    for f in "${files[@]}"; do
        if [ -f "$f" ]; then
            echo "######## FILE: $f ########" >> "$outfile"
            cat "$f" >> "$outfile"
            echo -e "\n\n" >> "$outfile"
        fi
    done

    local chars=$(wc -m < "$outfile")
    echo "  $name: $(basename $outfile) ($chars 字符)"
}

echo "正在生成审查包..."

# 批次1: 类型定义和共享层
pack "01-types-shared" \
    shared/index.ts \
    shared/types/character.ts \
    shared/types/combat.ts \
    shared/types/events.ts \
    shared/types/rules.ts

# 批次2: AI GM
pack "02-ai-gm" \
    server/src/ai/AIGameMaster.ts \
    server/src/ai/extractGmEffects.ts \
    server/src/ai/index.ts

# 批次3: 核心逻辑
pack "03-core" \
    server/src/core/CharacterCreator.ts \
    server/src/core/CharacterLevelUp.ts \
    server/src/core/StateManager.ts \
    server/src/core/SessionPersistence.ts \
    server/src/core/FileSessionStore.ts

# 批次4: 网络层
pack "04-network" \
    server/src/network/SocketServer.ts \
    server/src/network/combatApply.ts

# 批次5: 路由
pack "05-routes" \
    server/src/routes/ai.ts \
    server/src/routes/character.ts \
    server/src/routes/data.ts

# 批次6: 规则引擎
pack "06-rules" \
    server/src/rules/combatResolver.ts \
    server/src/rules/lootResolver.ts \
    server/src/rules/systems/DaggerHeartRules.ts

# 批次7a: 前端页面 - 游戏核心流程 (Adventure ~6.5万字符)
pack "07a-screens-game" \
    app/src/screens/AdventureScreen.tsx \
    app/src/screens/CombatScreen.tsx \
    app/src/screens/HomeScreen.tsx

# 批次7b: 前端页面 - 角色与创建 (~5万字符)
pack "07b-screens-character" \
    app/src/screens/CharacterCreateScreen.tsx \
    app/src/screens/CharacterScreen.tsx \
    app/src/screens/LevelUpScreen.tsx

# 批次7c: 前端页面 - 会话与设置 (~7.2万字符)
pack "07c-screens-session-settings" \
    app/src/screens/SessionJoinScreen.tsx \
    app/src/screens/SessionLobbyScreen.tsx \
    app/src/screens/SettingsScreen.tsx \
    app/src/screens/GMPanelScreen.tsx

# 批次8: 前端状态和组件
pack "08-frontend-state" \
    app/src/store/characterCreateStore.ts \
    app/src/store/gameStore.ts \
    app/src/hooks/useSocket.ts \
    app/src/navigation/AppNavigator.tsx \
    app/src/components/SpotlightIndicator.tsx \
    app/src/components/ErrorBoundary.tsx

# 批次9: 服务器入口和配置
pack "09-server-entry" \
    server/src/index.ts \
    server/package.json

echo ""
echo "完成! 文件在 $OUT_DIR/ 目录下"
echo "每个文件可以直接粘贴到GLM对话框"
echo ""
echo "建议审查提示词:"
echo '  请审查以下代码，关注: 1) 类型安全 2) 错误处理 3) 状态一致性 4) 性能问题 5) 安全漏洞'
