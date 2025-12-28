# Pocket Holdem - 朋友局德州扑克系统

一款极致轻量化的德州扑克在线竞技工具，专为熟人社交设计。

## 🎯 项目特性

- **零成本接入**：无需下载，H5 环境点开即玩
- **极致公平**：纯服务器端校验逻辑，杜绝前端作弊
- **稳定体验**：完善的断线重连机制

## 📁 项目结构

```
TexasPokerMVP/
├── server/                     # 服务端 (Node.js + Socket.io)
│   ├── src/
│   │   ├── Interfaces.ts       # 核心类型定义
│   │   ├── Player.ts           # 玩家类
│   │   ├── PokerEngine.ts      # 德州扑克逻辑引擎
│   │   ├── RoomManager.ts      # 房间管理器
│   │   └── index.ts            # 服务器入口
│   ├── package.json
│   └── tsconfig.json
│
└── client/                     # 客户端 (Vite + Vue3)
    ├── src/
    │   ├── components/
    │   │   ├── PokerTable.vue  # 牌桌组件
    │   │   ├── PlayerSeat.vue  # 玩家座位组件
    │   │   ├── CardDisplay.vue # 扑克牌组件
    │   │   └── ActionPanel.vue # 操作面板组件
    │   ├── composables/
    │   │   └── useSocket.ts    # Socket 连接层
    │   ├── store/
    │   │   └── gameStore.ts    # Pinia 状态管理
    │   └── types/
    │       └── index.ts        # 共享类型定义
    ├── package.json
    └── vite.config.ts
```

## 🚀 快速开始

### 启动服务端

```bash
cd server
pnpm install
pnpm dev
```

服务端将在 `ws://localhost:3000` 启动。

### 启动客户端

```bash
cd client
pnpm install
pnpm dev
```

客户端将在 `http://localhost:5174` 启动。

## 📡 WebSocket 协议

### 客户端事件

| 事件 | Payload | 说明 |
|------|---------|------|
| `CREATE_ROOM` | `{hostNickname, config}` | 创建房间 |
| `JOIN_ROOM` | `{roomId, nickname}` | 加入房间 |
| `SIT_DOWN` | `{seatIndex}` | 坐下入座 |
| `STAND_UP` | - | 站起观战 |
| `START_GAME` | - | 开始游戏 |
| `PLAYER_ACTION` | `{action, amount?, roundIndex}` | 玩家操作 |

### 服务端事件

| 事件 | Payload | 说明 |
|------|---------|------|
| `ROOM_CREATED` | `{room, myPlayerId}` | 房间已创建 |
| `ROOM_JOINED` | `{room, myPlayerId}` | 已加入房间 |
| `GAME_STARTED` | `{room}` | 游戏开始 |
| `DEAL_CARDS` | `{holeCards}` | 发牌（私密） |
| `SYNC_STATE` | `{room, myCards?}` | 状态同步 |
| `ERROR` | `{code, message}` | 错误消息 |

## 🎮 核心规则

- **边池算法**：支持多玩家 All-in 时的边池自动计算
- **牌型评估**：10 种标准德州扑克牌型自动判定
- **庄位轮换**：每局结束后顺时针移动，自动跳过淘汰玩家
- **超时处理**：30秒超时自动 Check/Fold

## � 文档索引

- [🔗 快速开始与联调指南](docs/integration-guide.md)
- [🔌 WebSocket 协议文档](docs/websocket-protocol.md)
- [🎨 客户端交互体验规范](docs/client-ux-rules.md)
- [✅ 交互体验验收报告](docs/ux-verification-report.md)
- [🧪 自动化测试报告](docs/verification-report.md)

## �📝 开发状态

当前 **MVP v1.0** 已完成发布，核心功能稳定可用：

- [x] **服务端**
  - Node.js + Socket.io 核心架构
  - GameController 状态机
  - 核心算法（边池计算、手牌评估）
  - Vitest 单元测试覆盖率 100%
- [x] **客户端**
  - Vue 3 + TypeScript + Pinia
  - 响应式 UI/UX (支持移动端竖屏)
  - 实时 WebSocket 双向通信
  - 完整游戏流程（创建/加入/对局/结算）
- [x] **体验优化**
  - 断线重连
  - 动态按钮控制
  - 当前行动玩家高亮
  - 超时自动托管

## 📜 许可证

仅供技术研究与娱乐记分使用，**严禁**用于任何形式的赌博或非法集资活动。
