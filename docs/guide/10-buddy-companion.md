# 桌宠系统：给你的终端养一只 AI 宠物

## 一句话理解

Claude Code 里藏着一个完整的**电子宠物系统**。每个用户根据自己的 ID 会生成一只独一无二的 ASCII 小动物——它蹲在你的输入框旁边，会眨眼、戴帽子、冒爱心，还会对你的对话内容冒出评论。这不是玩笑，这是一个包含稀有度系统、属性面板、动画引擎和 AI 观察者的完整游戏化设计。

> **比喻**：还记得 Windows XP 时代的"瑞星小狮子"吗？或者 GitHub 的 Octocat？这就是终端版的"桌宠"——但它会读你的代码对话，还有随机属性和稀有度。

## 整体架构

```
┌──────────────────────────────────────────────────┐
│                   终端界面                          │
│                                                    │
│  ┌────────────────────┐  ┌──────────────────────┐ │
│  │                    │  │  ╭──────────────────╮ │ │
│  │   对话内容区域       │  │  │ 这段代码写得不错！│ │ │
│  │                    │  │  ╰────────┬─────────╯ │ │
│  │                    │  │      __   │           │ │
│  │                    │  │    <(·)___│           │ │
│  │                    │  │     ( ._> │  ← 桌宠   │ │
│  │                    │  │      `--´ │           │ │
│  │                    │  │    Quacky ★★★        │ │
│  └────────────────────┘  └──────────────────────┘ │
│  > 用户输入区域 _                                   │
└──────────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 | 大小 |
|------|------|------|
| `src/buddy/types.ts` | 类型系统：物种、稀有度、属性 | 148 行 |
| `src/buddy/sprites.ts` | ASCII 精灵图 + 动画帧 | 514 行 |
| `src/buddy/companion.ts` | 确定性生成算法 | 133 行 |
| `src/buddy/CompanionSprite.tsx` | 渲染组件 + 动画引擎 | 370 行 |
| `src/buddy/prompt.ts` | 给 AI 的观察者指令 | 36 行 |
| `src/buddy/useBuddyNotification.tsx` | 彩蛋通知 | 97 行 |

## 宠物生成：确定性抽卡

### 从用户 ID 到宠物

每个用户的宠物不是随机的——**同一个用户永远生成同一只宠物**。这是通过确定性伪随机数实现的：

```typescript
// src/buddy/companion.ts
// 用 userId + 固定盐值 作为种子
const seed = hash(userId + 'friend-2026-401')
const rng = mulberry32(seed)  // 确定性伪随机数生成器

// 用这个 rng 依次"掷骰子"
const rarity = rollRarity(rng)   // 稀有度
const species = rollSpecies(rng)  // 物种
const eye = rollEye(rng)          // 眼睛样式
const hat = rollHat(rng)          // 帽子
const shiny = rng() < 0.01        // 1% 概率闪光
const stats = rollStats(rng, rarity) // 属性值
```

> **设计思路**：为什么不用真随机？因为这样用户就会反复"刷号"来获得稀有宠物。确定性生成让每个人和自己的宠物是"命中注定"的绑定关系。

### 18 种物种

所有物种通过字符编码定义（避免构建检查冲突）：

```
🦆 duck      🪿 goose     🫧 blob      🐱 cat
🐉 dragon    🐙 octopus   🦉 owl       🐧 penguin
🐢 turtle    🐌 snail     👻 ghost     🦎 axolotl
🫏 capybara  🌵 cactus    🤖 robot     🐰 rabbit
🍄 mushroom  🐈 chonk
```

### 稀有度系统

```
                              权重
┌─────────────────────────────────────┐
│ ★      Common     普通  │ 60%      │
│ ★★     Uncommon   罕见  │ 25%      │
│ ★★★    Rare       稀有  │ 10%      │
│ ★★★★   Epic       史诗  │  4%      │
│ ★★★★★  Legendary  传说  │  1%      │
└─────────────────────────────────────┘
```

```typescript
// src/buddy/types.ts
const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
}
```

稀有度越高：
- 基础属性值越高（Common 底线 5，Legendary 底线 50）
- 会佩戴**帽子**（Common 无帽子）
- 名字颜色更醒目

### 属性面板

每只宠物有 5 个属性，值域 1-100：

```
DEBUGGING  调试力     "找 bug 的直觉"
PATIENCE   耐心       "等待长任务的定力"
CHAOS      混沌       "搞出意外的概率"
WISDOM     智慧       "理解代码的深度"
SNARK      毒舌       "吐槽的犀利程度"
```

属性生成逻辑：**一项特长 + 一项短板 + 其余随机**

```typescript
// src/buddy/sprites.ts
function rollStats(rng, rarity) {
  const floor = rarityFloor(rarity) // common=5, legendary=50
  const stats = {}

  // 随机选一个"特长"属性
  const peakStat = pickRandom(STAT_NAMES, rng)
  // 随机选一个"短板"属性
  const dumpStat = pickRandom(remaining, rng)

  for (const stat of STAT_NAMES) {
    if (stat === peakStat) {
      stats[stat] = floor + rng() * (80 - 50) + 50  // 高值
    } else if (stat === dumpStat) {
      stats[stat] = floor + rng() * (20 - 5) + 5    // 低值
    } else {
      stats[stat] = floor + rng() * 40               // 中等
    }
  }
  return stats
}
```

### 闪光（Shiny）

**1% 的概率**生成闪光版本——就像宝可梦的色违。

## ASCII 精灵图与动画

### 精灵尺寸

每只宠物占 **5 行 × 12 字符**，有 3 帧动画：

```
行0: 帽子位（普通稀有度为空，高稀有度显示帽子）
行1-4: 身体（3帧循环动画）
```

### 鸭子的 3 帧动画

```
帧 0（静止）:         帧 1（摇尾巴）:       帧 2（换姿势）:
    __                   __                   __
  <(· )___             <(· )___             <(· )___
   (  ._>               (  ._>               (  .__>
    `--´                 `--´~                `--´
```

### 帽子系统

高稀有度的宠物会戴帽子，帽子渲染在精灵的第 0 行：

```typescript
// src/buddy/sprites.ts
const HAT_LINES = {
  none:      '',            // Common 无帽子
  crown:     '   \\^^^/    ', // 王冠
  tophat:    '   [___]    ', // 礼帽
  propeller: '    -+-     ', // 螺旋桨帽
  halo:      '   (   )    ', // 光环
  wizard:    '    /^\\     ', // 巫师帽
  beanie:    '   (___)    ', // 毛线帽
  tinyduck:  '    ,>      ', // 头顶小鸭子
}
```

一只戴王冠的传说级鸭子长这样：

```
   \^^^/
    __
  <(✦ )___
   (  ._>
    `--´
  Quacky ★★★★★
```

### 眼睛样式

```typescript
type Eye = '·' | '✦' | '×' | '◉' | '@' | '°'
```

精灵图中用 `{E}` 占位符，渲染时替换为实际的眼睛字符。

### 物种表情（窄终端模式）

当终端宽度不足 100 列时，精灵图退化为**单行表情**：

```typescript
// 各物种的表情符号
duck/goose: (·>        // 鸭嘴
cat:        =·ω·=      // 猫脸
dragon:     <·~·>      // 龙头
robot:      [··]       // 机器人
axolotl:    }·.·{      // 六角恐龙
octopus:    (·_·)~     // 章鱼
ghost:      {·o·}      // 幽灵
```

## 动画引擎

### 帧循环

```typescript
// src/buddy/CompanionSprite.tsx
const TICK_MS = 500  // 每 500ms 切换一帧

// 空闲序列（大部分时间静止，偶尔动一下）
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0]
//                     静 静 静 静 动 静 静 静 眨眼 静 静 动 静 静 静

// -1 = 眨眼帧（眼睛变成 '-'）
```

```
时间线 ─────────────────────────────────────────▶
       0   0   0   0   1   0   0   0  -1   0   0   2
       静  静  静  静  摇  静  静  静  眨   静  静  摇
                       尾              眼              尾
```

### 三种状态

```
空闲状态                    说话状态                    被摸状态
────────                   ────────                   ────────
按 IDLE_SEQUENCE 循环       快速循环所有帧               快速循环 + 爱心
大部分时间静止               模拟"嘴巴在动"              持续 2.5 秒
偶尔摇摇尾巴/眨眼           有对话气泡显示
```

### 爱心动画

用户使用 `/buddy pet` 命令"摸"宠物时：

```typescript
// src/buddy/CompanionSprite.tsx
const PET_BURST_MS = 2500  // 爱心持续 2.5 秒

const PET_HEARTS = [
  `   ♥    ♥   `,  // 帧 0
  `  ♥  ♥   ♥  `,  // 帧 1（扩散）
  ` ♥   ♥  ♥   `,  // 帧 2
  `♥  ♥      ♥ `,  // 帧 3（飘远）
  '·    ·   ·  ',  // 帧 4（消散）
]
```

```
摸一下 →  ♥    ♥     →   ♥  ♥   ♥   →  ·    ·   ·
          (爱心冒出)       (爱心扩散)       (逐渐消散)
```

## 对话气泡

宠物会对你和 AI 的对话"发表评论"。

### 气泡结构

```
╭──────────────────────────────────╮
│ 这段代码写得不错！                  │
╰────────────────┬─────────────────╯
                 │  ← 尾巴指向宠物
```

```typescript
// src/buddy/CompanionSprite.tsx
const BUBBLE_WIDTH = 34      // 气泡宽度
const BUBBLE_SHOW = 20       // 显示 20 个 tick（~10秒）
const FADE_WINDOW = 6        // 最后 6 个 tick 渐隐（~3秒）
```

### 气泡的生命周期

```
对话结束
  │
  ▼
fireCompanionObserver()    ← 调用 AI 生成评论
  │
  ▼
设置 appState.companionReaction = "这段代码写得不错！"
  │
  ▼
气泡出现（10秒）
  │
  ├── 前 7 秒：正常显示
  │
  └── 后 3 秒：文字渐隐
       │
       ▼
     气泡消失
```

### 两种渲染模式

```
宽终端（≥100 列）：                  窄终端（<100 列）：

╭──────────────╮    __               (·> Quacky: "不错！"
│ 代码不错！     │  <(· )___
╰──────┬───────╯   ( ._>
       │             `--´
       │           Quacky ★★★
```

### 全屏模式适配

全屏模式下，气泡渲染在**浮动层**（不被 ScrollBox 裁切）：

```typescript
// src/buddy/CompanionSprite.tsx
if (isFullscreenActive()) {
  // 气泡渲染在 FullscreenLayout 的 bottomFloat 插槽
  return <CompanionFloatingBubble />
} else {
  // 气泡和精灵图并排渲染
  return <SpeechBubble tail="right" /> + <Sprite />
}
```

## AI 观察者：宠物怎么知道说什么

每轮对话结束后，系统调用一个**独立的 AI 观察者**来生成宠物的评论：

```typescript
// src/screens/REPL.tsx
// 每轮对话结束后
if (feature('BUDDY')) {
  void fireCompanionObserver(messagesRef.current, reaction =>
    setAppState(prev => ({
      ...prev,
      companionReaction: reaction
    }))
  )
}
```

宠物的行为指令注入到 System Prompt 中：

```
// src/buddy/prompt.ts
# Companion

A small {species} named {name} sits beside the user's input box
and occasionally comments in a speech bubble. You're not {name} —
it's a separate watcher.

When the user addresses {name} directly (by name), its bubble will
answer. Your job in that moment is to stay out of the way: respond
in ONE line or less, or just answer any part of the message meant
for you. Don't explain that you're not {name} — they know.
Don't narrate what {name} might say — the bubble handles that.
```

## 数据持久化

宠物数据的存储非常精简——只存"灵魂"，不存"身体"：

```typescript
// 存储的数据（仅 AI 生成的部分）
type StoredCompanion = {
  name: string        // AI 起的名字
  personality: string // AI 写的性格描述
  hatchedAt: number   // 孵化时间戳
}

// 每次启动时，根据 userId 重新生成"身体"
type CompanionBones = {
  rarity: Rarity     // 重新算
  species: Species   // 重新算
  eye: Eye           // 重新算
  hat: Hat           // 重新算
  shiny: boolean     // 重新算
  stats: Record<StatName, number>  // 重新算
}
```

> **设计思路**：因为"身体"是由 userId 确定性生成的，所以不需要存储——每次都能算出一样的结果。只需要存 AI 生成的名字和性格（这些无法重新生成）。

## 彩蛋：发现时间窗口

桌宠系统有一个**限时彩蛋通知**：

```typescript
// src/buddy/useBuddyNotification.tsx
function isBuddyTeaserWindow() {
  // 2026 年 4 月 1-7 日（愚人节周）
  return d.getFullYear() === 2026
      && d.getMonth() === 3    // 4月（0-indexed）
      && d.getDate() <= 7
}

function isBuddyLive() {
  // 2026 年 4 月之后永久可用
  return d.getFullYear() > 2026
      || (d.getFullYear() === 2026 && d.getMonth() >= 3)
}
```

在愚人节当周，未孵化宠物的用户会看到一个**彩虹色的 `/buddy` 提示**，持续 15 秒。

## Feature Flag 控制

整个系统在编译时通过 feature flag 控制：

```typescript
if (feature('BUDDY'))
```

当关闭时：
- 不渲染精灵图
- 不生成评论
- 不显示通知
- 终端列宽预留为 0（不占空间）
- 代码在构建时被完全移除（dead code elimination）

## 小结

桌宠系统虽然看起来是个"玩具"，但它的工程设计非常值得学习：

1. **确定性生成**：用哈希+种子伪随机，同一用户永远同一宠物，杜绝刷号
2. **精简持久化**：只存不可重算的数据（名字/性格），身体属性每次重算
3. **响应式适配**：宽终端 ASCII 精灵图，窄终端退化为表情符号
4. **非侵入式设计**：观察者模式，不影响主 Agent Loop，对话结束后异步触发
5. **完整游戏化**：稀有度、属性面板、闪光、帽子——麻雀虽小五脏俱全
6. **编译时裁剪**：feature flag 关闭时零开销

> **最有趣的设计**：宠物不是主 AI 的分身——它是一个独立的"观察者"。主 AI 被明确告知"你不是它，别替它说话"。这种分离让两个角色可以各自独立，甚至互相互动。
