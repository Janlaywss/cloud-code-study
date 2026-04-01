# Team/Swarm 系统：多 Agent 组队协作

## 一句话理解

前面讲的"子 Agent"是临时的——干完活就没了。而 Team（团队）是一种**持久的多 Agent 协作模式**：一个 Leader（领导）可以创建一个团队，招募多个 Teammate（队友），它们各自独立运行，通过**邮箱系统**通信，遇到需要审批的操作还会**向 Leader 请示**。

> **比喻**：子 Agent 像是你临时叫来帮忙的朋友，帮完就走。Team 像是你组建了一个项目组——有组长、有组员、有通讯群、有审批流程，项目没结束就一直运转。

## 整体架构

```
┌──────────────────────────────────────────────────────┐
│                   Leader (组长)                         │
│                                                        │
│   ┌──────────────────────────────────────────┐        │
│   │           邮箱轮询 (useInboxPoller)         │        │
│   │                                           │        │
│   │   ┌─── 权限请求 ──── ToolUseConfirmQueue  │        │
│   │   ├─── 计划审批 ──── 审批队列              │        │
│   │   ├─── 普通消息 ──── 收件箱显示            │        │
│   │   └─── 沙箱请求 ──── 网络权限队列          │        │
│   └──────────────────────────────────────────┘        │
│                         ▲                              │
│                         │ 邮箱消息                      │
│          ┌──────────────┼──────────────┐               │
│          │              │              │               │
│    ┌─────┴────┐  ┌─────┴────┐  ┌─────┴────┐         │
│    │Teammate A│  │Teammate B│  │Teammate C│         │
│    │researcher│  │  coder   │  │ tester   │         │
│    │          │  │          │  │          │         │
│    │独立运行   │  │独立运行   │  │独立运行   │         │
│    │独立上下文 │  │独立上下文 │  │独立上下文 │         │
│    └──────────┘  └──────────┘  └──────────┘         │
└──────────────────────────────────────────────────────┘
```

## 团队的生命周期

```
Leader: TeamCreate("research-team")
    │
    ▼
创建团队配置文件
~/.claude/teams/research-team/config.json
    │
    ▼
Leader: Agent({ name: "researcher", team_name: "research-team", ... })
    │
    ▼
spawnInProcessTeammate()
  → agentId = "researcher@research-team"
  → 注册 InProcessTeammateTask
  → Teammate 开始独立运行
    │
    ▼
Teammate 工作中...
  ← 需要权限 → 发送权限请求给 Leader
  ← 需要审批 → 发送计划审批请求给 Leader
  ← 完成任务 → 发送 shutdown_request
    │
    ▼
Leader: TeamDelete()
  → 检查所有 Teammate 已停止
  → 清理团队目录和任务目录
  → 清除 AppState
```

## 团队配置文件

每个团队有一个 JSON 配置文件，记录团队的所有信息：

```typescript
// src/utils/swarm/teamHelpers.ts (lines 64-90)
type TeamFile = {
  name: string                    // "research-team"
  description?: string
  createdAt: number
  leadAgentId: string             // "team-lead@research-team"
  leadSessionId?: string          // Leader 的会话 ID
  members: Array<{
    agentId: string               // "researcher@research-team"
    name: string                  // "researcher"
    prompt?: string               // 初始任务
    color?: string                // UI 颜色
    planModeRequired?: boolean    // 是否需要计划审批
    joinedAt: number
    cwd: string                   // 工作目录
    worktreePath?: string         // Git worktree 路径
    sessionId?: string
    isActive?: boolean            // false = 空闲
    mode?: PermissionMode
    backendType?: 'tmux' | 'iterm2' | 'in-process'
  }>
}
```

存储路径：
```
~/.claude/teams/{team-name}/config.json     ← 团队配置
~/.claude/tasks/{team-name}/                ← 团队任务列表
~/.claude/teams/{team-name}/inboxes/        ← 成员邮箱
~/.claude/teams/{team-name}/permissions/    ← 权限请求记录
```

## Agent ID 命名规则

团队中每个成员都有唯一的 ID，格式为 `名字@团队名`：

```
team-lead@research-team    ← Leader 固定名字
researcher@research-team   ← Teammate
coder@research-team        ← Teammate
tester@research-team       ← Teammate
```

## Teammate 的创建

```typescript
// src/utils/swarm/spawnInProcess.ts (lines 104-216)
async function spawnInProcessTeammate(config) {
  // 1. 生成 Agent ID
  const agentId = formatAgentId(config.name, config.teamName)
  // → "researcher@research-team"

  // 2. 创建独立的 AbortController
  //    Leader 中断不会影响 Teammate
  const abortController = new AbortController()

  // 3. 创建身份标识
  const identity: TeammateIdentity = {
    agentId,
    agentName: config.name,
    teamName: config.teamName,
    planModeRequired: config.planModeRequired,
    parentSessionId: currentSessionId,
  }

  // 4. 注册任务状态
  const taskState: InProcessTeammateTaskState = {
    type: 'in_process_teammate',
    status: 'running',
    identity,
    prompt: config.prompt,
    abortController,
    awaitingPlanApproval: false,
    isIdle: false,
    messages: [],                    // UI 只保留最近 50 条
    pendingUserMessages: [],         // 待处理消息队列
  }

  registerTask(agentId, taskState)
}
```

## 邮箱系统：团队的通信中枢

### 进程内邮箱

对于 in-process 类型的 Teammate，使用内存中的 `Mailbox` 类：

```typescript
// src/utils/mailbox.ts (lines 19-73)
class Mailbox {
  private queue: Message[] = []       // 消息队列
  private waiters: Waiter[] = []      // 等待中的接收者

  // 发送消息：如果有人在等，直接投递；否则入队
  send(msg: Message) {
    const waiter = this.waiters.find(w => w.predicate(msg))
    if (waiter) {
      waiter.resolve(msg)     // 直接投递，不经过队列
    } else {
      this.queue.push(msg)    // 没人等，存起来
    }
  }

  // 接收消息：如果队列有匹配的，立即返回；否则等待
  receive(predicate?): Promise<Message> {
    const existing = this.queue.find(m => predicate?.(m) ?? true)
    if (existing) {
      this.queue.remove(existing)
      return Promise.resolve(existing)
    }
    return new Promise(resolve => {
      this.waiters.push({ predicate, resolve })
    })
  }
}
```

```
Teammate A 发送消息              Leader 收到消息
     │                              │
     ▼                              ▼
writeToMailbox("team-lead", msg)  useInboxPoller 每秒轮询
     │                              │
     ├── in-process?                ├── 权限请求? → 弹窗审批
     │   → Mailbox.send()           ├── 计划审批? → 审批队列
     │                              ├── 关闭请求? → 处理
     └── tmux?                      └── 普通消息? → 收件箱显示
         → 写入 .ndjson 文件
```

### 消息类型

邮箱中的消息有多种类型，通过谓词函数识别：

| 消息类型 | 方向 | 用途 |
|----------|------|------|
| `permission_request` | Teammate → Leader | 请求执行危险操作的权限 |
| `permission_response` | Leader → Teammate | 批准或拒绝权限请求 |
| `plan_approval_request` | Teammate → Leader | 提交计划等待审批 |
| `plan_approval_response` | Leader → Teammate | 批准或驳回计划 |
| `sandbox_permission_request` | Teammate → Leader | 请求网络访问权限 |
| `shutdown_request` | Leader → Teammate | 请求优雅关闭 |
| `team_permission_update` | Leader → Teammate | 更新权限模式 |
| `mode_set_request` | Leader → Teammate | 设置权限级别 |
| 普通文本 | 双向 | 日常通信 |

## 权限同步：Teammate 怎么请示 Leader

当 Teammate 需要执行一个需要审批的操作（如删除文件、执行危险命令），流程如下：

```
Teammate 想执行 rm -rf test/
    │
    ▼
handleSwarmWorkerPermission()
    │
    ├─ 先尝试分类器自动判断
    │   （如果是安全命令，自动放行）
    │
    └─ 无法自动判断 → 发送权限请求给 Leader
         │
         ▼
    ┌──────────────────────────────────┐
    │  创建 SwarmPermissionRequest     │
    │  {                               │
    │    id: "perm-1234-abcd",         │
    │    workerId: "researcher@team",  │
    │    toolName: "Bash",             │
    │    description: "rm -rf test/",  │
    │    status: "pending"             │
    │  }                               │
    └──────────────┬───────────────────┘
                   │
                   ▼
    写入 Leader 的邮箱
                   │
                   ▼
    Leader 的 useInboxPoller 检测到请求
                   │
                   ▼
    路由到 ToolUseConfirmQueue → 弹窗显示给用户
                   │
              用户点击 允许/拒绝
                   │
                   ▼
    Leader 发送 permission_response 给 Teammate
                   │
                   ▼
    Teammate 的回调被触发，继续或中止操作
```

```typescript
// src/utils/swarm/permissionSync.ts (lines 49-86)
type SwarmPermissionRequest = {
  id: string                    // "perm-{timestamp}-{random}"
  workerId: string              // "researcher@research-team"
  workerName: string            // "researcher"
  teamName: string
  toolName: string              // "Bash"
  toolUseId: string
  description: string           // 人类可读的操作描述
  input: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}
```

权限请求还会**持久化到磁盘**（便于审计）：

```
~/.claude/teams/{team}/permissions/
├── pending/
│   └── perm-1234-abcd.json     ← 等待中的请求
└── resolved/
    └── perm-1234-abcd.json     ← 已处理的请求
```

## 计划审批流程

Teammate 可以被配置为 `planModeRequired: true`，这意味着它必须先提交计划，得到 Leader 审批后才能执行：

```
Teammate (planModeRequired = true)
    │
    │ 分析任务后...
    ▼
发送 plan_approval_request
{
  type: "plan_approval_request",
  plan: "1. 先读取 auth 模块\n2. 修复 token 验证\n3. 添加测试",
}
    │
    ▼
Teammate 状态: awaitingPlanApproval = true
Teammate 状态: isIdle = true （等待中）
    │
    │ Leader 审查计划...
    ▼
Leader 发送 plan_approval_response
{
  type: "plan_approval_response",
  approved: true,
  permissionMode: "default",     ← 审批后的权限级别
}
    │
    ▼
Teammate 收到审批
  → awaitingPlanApproval = false
  → permissionMode = "default"（从 plan 模式升级）
  → 开始执行计划
```

> **安全设计**：只有 `team-lead` 发出的审批才会被接受。Teammate 不能伪造其他成员的审批消息。

## 两种运行后端

Teammate 有两种运行方式：

### In-Process（进程内）

```
┌─────────────────────────────────────┐
│         同一个 Node.js 进程           │
│                                      │
│  Leader          Teammate A          │
│  (主线程)        (AsyncLocalStorage)  │
│                                      │
│  共享内存         独立上下文            │
│  通过 Mailbox 类直接投递               │
└─────────────────────────────────────┘
```

- 通过 **AsyncLocalStorage** 实现上下文隔离
- 消息通过内存中的 Mailbox 类直接投递，无需文件 I/O
- 消耗同一进程的内存

### Tmux/iTerm2（终端面板）

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Terminal  │  │ Terminal  │  │ Terminal  │
│ Pane 1   │  │ Pane 2   │  │ Pane 3   │
│          │  │          │  │          │
│ Leader   │  │Teammate A│  │Teammate B│
│          │  │          │  │          │
│ 独立进程  │  │ 独立进程  │  │ 独立进程  │
└──────────┘  └──────────┘  └──────────┘
      ▲              ▲              ▲
      └──── 通过 .ndjson 文件通信 ───┘
```

- 每个 Teammate 是独立的 Claude Code 进程
- 消息通过文件系统通信：`~/.claude/teams/{team}/inboxes/{name}.ndjson`
- 用户可以直接看到每个 Teammate 的终端输出

## 内存管理：50 条消息上限

团队场景下 Teammate 可能运行数百轮。为了防止内存爆炸：

```typescript
// src/tasks/InProcessTeammateTask/types.ts (line 101)
const TEAMMATE_MESSAGES_UI_CAP = 50

// UI 层只保留最近 50 条消息
// 完整对话存在 inProcessRunner 的本地数组 + 磁盘
```

> **背景**：实测发现一个有 292 个 Agent 的大型会话占用了 **36.8GB** 内存。每个 Agent 在 500+ 轮后占 ~20MB。所以 UI 只保留最近 50 条，详细历史存磁盘。

## Coordinator 模式 vs Team 模式

Claude Code 有两种多 Agent 模式，设计思路不同：

| 对比项 | Coordinator 模式 | Team 模式 |
|--------|-----------------|-----------|
| **Leader 角色** | 纯指挥，不亲自执行 | 可以自己干活 |
| **Worker 类型** | 临时子 Agent | 持久 Teammate |
| **通信方式** | task-notification | 邮箱系统 |
| **Worker 生命周期** | 做完就销毁 | 一直运行到团队解散 |
| **权限审批** | 无（Worker 自动模式） | 有（邮箱请求） |
| **计划审批** | 无 | 有（planModeRequired） |
| **适用场景** | 一次性并行任务 | 长期协作项目 |

## 团队共享记忆

团队有自己的共享记忆空间（详见第 7 章 Memory 系统）：

```
~/.claude/projects/<项目>/memory/
├── MEMORY.md              ← 个人索引
├── personal_*.md          ← 个人记忆
└── team/                  ← 团队共享
    ├── MEMORY.md          ← 团队索引
    └── shared_*.md        ← 团队记忆
```

记忆的归属规则：

| 记忆类型 | 归属 | 说明 |
|----------|------|------|
| user | 永远个人 | 个人偏好不强加给团队 |
| feedback | 默认个人 | 除非是项目级规范 |
| project | 倾向团队 | 项目信息大家都该知道 |
| reference | 通常团队 | 外部系统地址共享 |

安全规则：**API 密钥、凭据等敏感信息永远不写入团队记忆**。

## Leader 的收件箱轮询

Leader 通过 `useInboxPoller` 每秒检查一次收件箱：

```typescript
// src/hooks/useInboxPoller.ts (lines 126-200)
function useInboxPoller({ enabled, onSubmitMessage }) {
  setInterval(() => {
    const messages = readUnreadMessages()

    for (const msg of messages) {
      if (isPermissionRequest(msg)) {
        // → 路由到权限确认队列，弹窗给用户
        addToToolUseConfirmQueue(msg)
      }
      else if (isPermissionResponse(msg)) {
        // → 触发 Teammate 等待的回调
        invokePermissionCallback(msg.requestId, msg.decision)
      }
      else if (isPlanApprovalRequest(msg)) {
        // → 路由到计划审批队列
        addToPlanApprovalQueue(msg)
      }
      else if (isShutdownRequest(msg)) {
        // → 处理优雅关闭
        handleShutdown(msg)
      }
      else {
        // → 普通消息，显示在收件箱 UI
        addToInbox(msg)
      }
    }
  }, 1000)  // 每秒一次
}
```

## 团队创建的完整代码

```typescript
// src/tools/TeamCreateTool/TeamCreateTool.ts (lines 128-237)
async function call(input, context) {
  // 1. 检查是否已有团队（只能同时管一个）
  if (appState.teamContext) {
    throw "已有活跃团队，请先 TeamDelete"
  }

  // 2. 生成唯一团队名
  const finalName = ensureUnique(input.team_name)

  // 3. 生成 Leader Agent ID
  const leadAgentId = `team-lead@${finalName}`

  // 4. 创建配置文件
  await writeTeamFile({
    name: finalName,
    leadAgentId,
    leadSessionId: sessionId,
    members: [{ agentId: leadAgentId, name: 'team-lead', ... }]
  })
  // → ~/.claude/teams/{name}/config.json

  // 5. 创建任务目录
  await mkdir(`~/.claude/tasks/${sanitize(finalName)}`)

  // 6. 更新 AppState
  setAppState(prev => ({
    ...prev,
    teamContext: {
      teamName: finalName,
      leadAgentId,
      isLeader: true,
      teammates: {}
    }
  }))

  return { team_name: finalName, lead_agent_id: leadAgentId }
}
```

## 小结

Team/Swarm 系统的核心设计思想是**"自治 + 审批"**：

1. **自治运行**：每个 Teammate 有独立的上下文、独立的 AbortController、独立的消息历史
2. **邮箱通信**：统一的消息系统，支持进程内直投和文件系统轮询两种模式
3. **权限审批**：Teammate 遇到危险操作需要通过邮箱向 Leader 请示
4. **计划审批**：可选的 plan mode，Teammate 先提计划、Leader 审批后才能执行
5. **内存安全**：UI 层只保留 50 条消息，防止大规模团队导致内存溢出
6. **安全边界**：只有 Leader 的审批才生效、团队记忆不存敏感信息、路径遍历防御

> **比喻**：这就像一个远程团队的工作模式。每个人在自己的电脑上工作（独立上下文），通过 Slack（邮箱系统）沟通，重要决策需要组长在 Jira 上审批（权限/计划审批），共享文档放在 Notion 上（团队记忆），新人入职和离职都有流程（创建/删除）。
