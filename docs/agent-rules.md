# Pocket Holdem MVP - 系统规则与智能体指南

## 1. 项目概述
Pocket Holdem 是一个轻量级、服务器权威的在线德州扑克游戏，专为社交圈（"好友局"）设计。
- **核心价值**：数字筹码 + 自动化荷官。纯粹的计分工具，非真实货币赌博。
- **平台**：H5 (移动端优先，垂直布局)。
- **技术栈**：
  - **服务器端**：Node.js + Socket.io + TypeScript (内存存储状态)。
  - **客户端**：Vue 3 + Vite + Tailwind CSS + Pinia。

---

## 2. 工程理念 (至关重要)
你必须遵循 **轻量级架构** 原则：
1.  **服务器权威**：所有游戏逻辑、状态转换和洗牌都在服务器上进行。客户端只是一个"哑渲染器"。
2.  **单一数据源**：服务器的 `GameState` 是**唯一**的真相源。客户端绝不在本地推导状态；它们只应用服务器发来的快照。
3.  **串行执行**：单个房间内的操作必须同步、串行处理，以避免竞态条件。
4.  **无状态广播**：将新状态广播给所有客户端。客户端通过验证 `stateVersion` 来确保严格的状态顺序。

---

## 3. 实现规则

### 3.1 服务器端 (Node.js)
- **并发控制**：利用 Node.js 事件循环天然的串行化特性。在可能破坏原子性的关键状态修改函数内部，**不要使用 `await`**。
- **状态版本控制**：
  - 每次 `GameState` 变更**必须**递增 `stateVersion`。
  - 客户端应拒绝接收 `payload.stateVersion <= current.stateVersion` 的快照。
- **核心实体**：
  - `RoomManager`：单例。
  - `Room`：包含 `GameState` 和 `Player` 映射。
  - `PokerEngine`：纯函数式的逻辑核心（洗牌、牌型比较、边池计算）。
- **边池**：**必须实现**。正确处理多人 All-in 的情况。
- **计时器**：在服务器端管理 30 秒超时。不要信任客户端计时器。

### 3.2 客户端 (Vue 3)
- **设计系统**：
  - **风格**："苹果极简主义" (玻璃态效果、高对比度、圆角)。
  - **布局**：垂直移动端布局。操作按钮位于底部。
- **用户体验规则**：
  - **行动玩家**：高亮显示轮到行动的玩家（发光/脉动效果）。
  - **操作按钮**：
    - `CHECK`：仅在 `callAmount == 0` 时显示。
    - `FOLD`：始终可用（如果当前是活动玩家）。
    - `CALL`：显示具体的跟注金额。
    - `RAISE`：显示滑动条/输入框。
  - **断线重连**：页面刷新时，发送 `RECONNECT` 事件并携带 `UUID`。从服务器返回的 `SYNC_STATE` 中完全恢复 UI 状态。

---

## 4. 关键工作流程 (参考 `docs/architecture-lite.md`)

### 4.1 游戏生命周期
- **牌局开始**：洗牌 -> 发盲注 -> 发手牌 -> 生成新的 `handId`。
- **下注轮次**：等待行动 -> 30 秒超时 -> 玩家行动/超时 -> 下一玩家。
- **摊牌/结束**：计算底池 -> 分配筹码 -> 淘汰（筹码=0的玩家）-> 重置。

### 4.2 重连机制
- 使用 `localStorage` 存储 `playerId` 和 `roomId`。
- Socket 连接建立后，立即发送 `RECONNECT` 事件。
- 服务器验证后，发送完整状态。客户端覆盖本地存储。

### 4.3 WebSocket 通信协议
- **核心事件**：`SYNC_STATE`, `DEAL_CARDS`, `PLAYER_ACTED`, `GAME_ENDED`, `ERROR`。
- **隐私保护**：除非进入摊牌阶段，否则绝不发送其他玩家的私有手牌 (`holeCards`)。

---

## 5. 开发策略
- **MVP 重点**：稳定性优先。如果复杂逻辑（如边池边缘情况）存在风险，可以使用简化但安全的回退方案，但应以实现正确性为目标。
- **测试**：优先保障 `PokerEngine` 的单元测试（100% 逻辑覆盖）和边池场景测试。

## 6. 项目结构
- `server/src/Interfaces.ts`：数据契约。确保此文件与 `docs/websocket-protocol.md` 保持同步。
- `server/src/PokerEngine.ts`：逻辑大脑。纯函数式逻辑。
- `client/src/composables/useSocket.ts`：通信桥梁。

## 7. 核心偏好 (Core Preferences)
🛠 命令行与工具 (CLI Protocol)
- Docker: 必须使用 V2 语法 (无连字符)。
> ✅ docker compose up -d
> ❌ docker-compose up -d

- HuggingFace: 涉及模型下载时，必须使用 hf 别名。
> ✅ hf download --resume-download <model_id>
> ❌ huggingface-cli download ...

- Package Manager: 前端严格限制使用 pnpm。
> ✅ pnpm install, pnpm add
> ❌ npm install, yarn add

1. 语言环境：记住请将你所有思考以及生成过程，使用中文来回答
2. python 环境优先使用/opt/anaconda3来验证，不用使用系统自带的python或python3，请激活conda activate base环境
3. 记住你的每次回答，需要检查是否要保持同步 reademe 文件.
4. 当你使用github进行提交msg/tag时，默认使用中文描述

---
**注意**：生成代码时，始终添加 TypeScript 类型注解。复杂的逻辑请用中文注释（根据用户偏好）。