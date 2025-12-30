# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作提供指导。

## 项目概述

Pocket Hold'em 是一款轻量级德州扑克好友约局系统，采用前后端分离架构：Vue 3 前端 (client/) + Node.js + Socket.io 后端 (server/)。

## 常用命令

```bash
# 安装依赖
cd server && pnpm install
cd client && pnpm install

# 启动开发服务器
cd server && pnpm dev    # 后端 (端口 3000)
cd client && pnpm dev    # 前端 (端口 5174)

# 使用 ngrok 外网访问
ngrok http 5174
```

## 架构设计

### 数据流向
客户端 → Socket.io 事件 → 服务端（单一真理源）→ broadcastRoomState → 客户端同步

### 后端模块职责
- **index.ts**: Socket.io 入口，事件处理，广播
- **RoomManager.ts**: 房间生命周期，玩家管理，入座/站起，踢人
- **GameController.ts**: 手牌生命周期，下注轮，摊牌，边池计算
- **PokerEngine.ts**: 纯逻辑 - 洗牌，发牌，7选5手牌评估，边池算法
- **Player.ts**: 玩家状态封装，筹码，状态，行动资格判断

### 前端模块职责
- **App.vue**: 主 UI，包含 3 个视图（首页/房间/游戏），操作面板，倒计时，摊牌弹窗
- **useSocket.ts**: Socket 连接，事件监听，使用 localStorage session 自动重连
- **gameStore.ts**: Pinia 状态管理 - 全局状态：房间、手牌、行动信息、底池计算

### 核心数据结构
- **GamePhase**: PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN
- **PlayerStatus**: WAITING → ACTIVE → FOLDED → ALL_IN → ELIMINATED → SPECTATING
- **ActionType**: FOLD, CHECK, CALL, RAISE, ALL_IN

### 重要模式
- 服务端权威性：holeCards 绝不发往客户端，仅发送 `getPublicRoomInfo()` 过滤后的数据
- 请求去重：通过 requestId 的 LRU 缓存实现
- 边池计算：任意玩家全押时触发
- 位置标识：Dealer (D)、SB、BB、房主皇冠

## 协议概览

客户端 → 服务端：`CREATE_ROOM`、`JOIN_ROOM`、`SIT_DOWN`、`STAND_UP`、`START_GAME`、`PLAYER_ACTION`、`PLAYER_READY`、`KICK_PLAYER`

服务端 → 客户端：`ROOM_CREATED`、`PLAYER_TURN`、`DEAL_CARDS`、`HAND_RESULT`、`READY_STATE_CHANGED`、`PLAYER_KICKED`
