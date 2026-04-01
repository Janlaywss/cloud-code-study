---
pageType: home
hero:
  name: Cloud Code Study
  text: 深入理解 AI Agent 的工程实现
  tagline: 基于 Cloud Code 源码，拆解一个工业级 Agent 系统的架构设计
  actions:
    - theme: brand
      text: 开始阅读
      link: /guide/01-agent-loop
features:
  - title: '1. Agent Loop'
    details: '从一个 Prompt 出发，走完一整个任务。理解"循环调用"的核心设计。'
    link: /guide/01-agent-loop
  - title: '2. Tool 与沙箱'
    details: '如何定义工具、如何让 AI 安全地执行代码、如何防止逃逸。'
    link: /guide/02-tool-sandbox
  - title: '3. 子 Agent 设计'
    details: '多个 Agent 如何分工协作，消息怎么传递，上下文怎么共享。'
    link: /guide/03-sub-agent
  - title: '4. 任务图'
    details: '任务的状态机长什么样？父子关系怎么管理？如何回收？'
    link: /guide/04-task-graph
  - title: '5. System Prompt'
    details: '提示词怎么拼装？如何分层缓存？怎样做到改一个字不全量失效？'
    link: /guide/05-system-prompt
  - title: '6. 上下文压缩'
    details: '对话太长了怎么办？三级压缩策略，从轻量裁剪到全量摘要。'
    link: /guide/06-context-compression
  - title: '7. Memory 系统'
    details: '四层记忆结构，从一次会话到跨项目的持久化记忆。'
    link: /guide/07-memory
  - title: '8. 后台任务'
    details: '后台 Agent、定时任务、Dream 记忆整理——都是怎么跑起来的。'
    link: /guide/08-background-task
  - title: '9. Skill 与 MCP'
    details: '可复用的 Prompt 模板 + 标准化的外部服务协议，能力扩展的两大支柱。'
    link: /guide/09-skill-mcp
  - title: '10. 桌宠系统'
    details: '确定性抽卡、ASCII 动画引擎、AI 观察者——终端里的电子宠物。'
    link: /guide/10-buddy-companion
  - title: '11. Team/Swarm'
    details: '持久化多 Agent 团队：邮箱通信、权限审批、计划审批的完整协作体系。'
    link: /guide/11-team-swarm
---
