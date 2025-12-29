# Pocket Holdem - 朋友局德州扑克系统

一款极致轻量化的德州扑克在线竞技工具，专为熟人社交设计。

## 🎯 项目特性

- **内网穿透支持**：集成 ngrok 适配，支持零成本外网联机

## 📁 项目结构

```
TexasPokerMVP/
├── server/                     # 服务端 (Node.js + Socket.io)
├── client/                     # 客户端 (Vite + Vue3)
├── docs/                       # 系统文档
│   ├── room-governance.md      # 房间管理规范 (踢人逻辑)
│   ├── showdown-state-model.md # Showdown 状态隔离模型
│   └── ngrok-guide.md          # ngrok 内网穿透指南
└── README.md
```

## 🚀 快速开始

### 1. 启动服务端
```bash
cd server
pnpm install
pnpm dev
```

### 2. 启动客户端
```bash
cd client
pnpm install
pnpm dev
```

### 3. 外网共享 (可选)
使用 ngrok 进行穿透：
```bash
ngrok http 5174
```

## 📡 WebSocket 协议更新

### 客户端事件
| 事件 | Payload | 说明 |
|------|---------|------|
| `KICK_PLAYER` | `{targetPlayerId}` | 房主踢人 |
| `PLAYER_READY` | - | 结算后准备新一局 |

### 服务端事件
| 事件 | Payload | 说明 |
|------|---------|------|
| `PLAYER_KICKED` | `{reason}` | 被踢出通知 |
| `READY_STATE_CHANGED` | `{playerId, isReady}`| 准备状态更新 |

## 🎮 核心增强功能

- **房主治理**：房主可在准备阶段踢出捣乱玩家。
- **状态隔离**：Showdown 结算弹窗实现本地化状态管理，玩家可自主关闭，互不干扰。
- **视觉标识**：新增 Dealer (D)、小盲 (SB)、大盲 (BB) 实时徽章。

## 📖 文档索引

- [🔗 房主治理规范](docs/room-governance.md)
- [🔗 Showdown 隔离模型](docs/showdown-state-model.md)
- [🔗 ngrok 穿透指南](docs/ngrok-guide.md)
- [🔗 快速开始与联调指南](docs/integration-guide.md)

## 📝 开发状态

当前 **v1.1** 已上线：

- [x] **房间管理**：房主权限系统与踢人流程。
- [x] **状态隔离**：修复了 Showdown 弹窗的全员干扰 Bug。
- [x] **身份标记**：完善的 D/SB/BB 座位标识。
- [x] **穿透适配**：Vite Proxy 与 ngrok 兼容配置。

## 📜 许可证

仅供技术研究与娱乐记分使用，**严禁**用于任何形式的赌博或非法集资活动。
