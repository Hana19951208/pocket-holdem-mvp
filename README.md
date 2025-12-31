# Pocket Holdem - 朋友局记分牌系统

一款极致轻量化的德州扑克在线竞技工具，专为熟人社交设计。

## 🎯 项目特性

- **内网穿透支持**：集成 ngrok 适配，支持零成本外网联机
- **自动淘汰机制**：筹码归零自动出局，房主转移
- **完整结算展示**：Showdown 弹窗包含公共牌与完整对局信息
- **SVG 扑克牌**：使用高质量 SVG 扑克牌图片，响应式适配
- **移动端优化**：Flexbox 布局确保按钮对齐，触摸友好

## 📁 项目结构

```
pocket-holdem-mvp/
├── server/                     # 服务端 (Node.js + Socket.io)
│   └── src/
│       ├── index.ts            # Socket.io 入口与事件处理
│       ├── RoomManager.ts      # 房间生命周期管理
│       ├── GameController.ts   # 手牌流程与下注轮控制
│       ├── PokerEngine.ts      # 核心扑克逻辑
│       ├── Player.ts           # 玩家状态封装
│       └── Interfaces.ts       # 类型定义
├── client/                     # 客户端 (Vite + Vue3)
│   ├── src/
│   │   ├── App.vue             # 主应用入口
│   │   ├── components/
│   │   │   ├── ActionPanel.vue # 操作面板（Fold/Check/Call/Raise）
│   │   │   ├── CardDisplay.vue # 扑克牌显示组件
│   │   │   ├── PokerTable.vue  # 牌桌布局组件
│   │   │   └── PlayerSeat.vue  # 玩家座位组件
│   │   ├── composables/
│   │   │   └── useSocket.ts    # Socket 连接管理
│   │   ├── store/
│   │   │   └── gameStore.ts    # Pinia 状态管理
│   │   └── types/index.ts      # 类型定义
│   └── public/assets/imgs/     # SVG 扑克牌资源
├── docs/                       # 系统文档
└── README.md
```

## 🚀 快速开始

### 1. 启动服务端
```bash
cd server
pnpm install
pnpm dev
# 运行在 http://localhost:3000
```

### 2. 启动客户端
```bash
cd client
pnpm install
pnpm dev
# 运行在 http://localhost:5174
```

### 3. 外网共享 (可选)
使用 ngrok 进行穿透：
```bash
ngrok http 5174
```

## 📡 WebSocket 协议

### 客户端 → 服务端
| 事件 | Payload | 说明 |
|------|---------|------|
| `CREATE_ROOM` | `{nickname, config}` | 创建房间 |
| `JOIN_ROOM` | `{roomId, nickname}` | 加入房间 |
| `SIT_DOWN` | `{seatIndex}` | 入座 |
| `STAND_UP` | - | 站起 |
| `START_GAME` | - | 开始游戏（房主） |
| `PLAYER_ACTION` | `{action, amount}` | 玩家操作 |
| `PLAYER_READY` | - | 准备新一局 |
| `KICK_PLAYER` | `{targetPlayerId}` | 踢出玩家（房主） |
| `LEAVE_ROOM` | - | 离开房间 |

### 服务端 → 客户端
| 事件 | Payload | 说明 |
|------|---------|------|
| `ROOM_CREATED` | `{room, playerId}` | 房间创建成功 |
| `ROOM_JOINED` | `{room, playerId}` | 加入房间成功 |
| `ROOM_UPDATED` | `{room}` | 房间状态更新 |
| `PLAYER_JOINED` | `{player}` | 玩家加入 |
| `PLAYER_LEFT` | `{playerId}` | 玩家离开 |
| `PLAYER_SAT` | `{player}` | 玩家入座 |
| `PLAYER_STOOD` | `{playerId}` | 玩家站起 |
| `PLAYER_KICKED` | `{reason}` | 被踢出通知 |
| `HOST_TRANSFERRED` | `{newHostId, newHostNickname}` | 房主转移 |
| `GAME_STARTED` | `{gameState}` | 游戏开始 |
| `DEAL_CARDS` | `{cards}` | 发牌通知 |
| `PLAYER_TURN` | `{playerId, timeout}` | 轮到某玩家 |
| `PLAYER_ACTED` | `{playerId, action}` | 玩家已行动 |
| `HAND_RESULT` | `{result}` | 本局结算 |
| `READY_STATE_CHANGED` | `{playerId, isReady}` | 准备状态更新 |
| `ERROR` | `{message}` | 错误通知 |

## 🎮 核心功能

### 游戏流程
- **盲注系统**：自动收取小盲/大盲
- **下注轮**：Pre-flop → Flop → Turn → River → Showdown
- **操作类型**：弃牌(FOLD)、过牌(CHECK)、跟注(CALL)、加注(RAISE)、全押(ALL_IN)
- **边池计算**：支持多边池拆分
- **自动淘汰**：筹码归零自动出局，房主身份自动转移

### UI 优化
- **操作面板**：Flexbox 布局确保按钮对齐，固定高度 56px
- **扑克牌显示**：使用 SVG 文件，CSS 媒体查询响应式适配
- **倒计时提示**：行动倒计时进度条，最后 5 秒变红警告
- **Showdown 结算**：展示公共牌、赢家信息、各玩家手牌
- **Dealer 标识**：庄位(D)、小盲(SB)、大盲(BB)实时徽章

## 📝 开发状态

当前 **v1.3** (最新):

- [x] **UI 深度优化**：操作面板切换为 **CSS Grid 布局**，实现完美的 2x2 动作按钮矩阵。
- [x] **文本自适应**：增加 `text-overflow` 处理，防止“全押”金额过大导致按钮错位。
- [x] **座位管理修复**：解决玩家被淘汰后座位状态未彻底清除的 Bug，提高房间稳定性。
- [x] **默认配置更新**：默认人数调整为 6 人，确保移动端显示无死角。

### 历史版本
**v1.2**
- [x] **UI 优化**：修复操作面板按钮对齐问题
- [x] **结算完善**：Showdown 弹窗增加公共牌展示
- [x] **自动淘汰**：筹码归零自动出局
- [x] **房主转移**：房主淘汰时自动转移给下一位玩家

## 📜 许可证

仅供技术研究与娱乐记分使用，**严禁**用于任何形式的赌博或非法集资活动。
