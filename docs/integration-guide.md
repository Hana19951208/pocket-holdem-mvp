# 🎮 Pocket Holdem 联调说明文档

## 🚀 快速开始

### 1. 启动服务端

```bash
cd server
pnpm dev
```

输出：
```
🎰 Pocket Holdem 服务器已启动
   监听端口: 3000
   WebSocket: ws://localhost:3000
```

### 2. 启动客户端

```bash
cd client
pnpm dev
```

输出：
```
VITE v7.3.0  ready in 2514 ms
➜  Local:   http://localhost:5173/
```

### 3. 访问客户端

打开浏览器访问：`http://localhost:5173/`

---

## 🎲 两人对局测试步骤

### 场景：两个浏览器标签页完成一局

#### 玩家 1（创建房间）

1. 打开 `http://localhost:5173/`
2. 输入昵称（如 "Player1"）
3. 点击 **创建房间**
4. 记住房间号（如 "766864"）
5. 点击空座位入座

#### 玩家 2（加入房间）

1. 打开**新标签页**访问 `http://localhost:5173/`
2. 输入昵称（如 "Player2"）
3. 点击 **加入房间**
4. 输入玩家 1 的房间号
5. 点击 **加入**
6. 点击空座位入座

#### 开始游戏

1. 玩家 1（房主）看到 **开始游戏** 按钮
2. 点击开始游戏
3. 两个玩家都会收到手牌
4. 按提示执行操作（FOLD/CHECK/CALL/RAISE/ALL-IN）

---

## 📡 WebSocket 地址

| 环境 | 地址 |
|------|------|
| 开发 | `ws://localhost:3000` |
| 客户端 | `http://localhost:5173/` |

客户端通过 `VITE_SERVER_URL` 环境变量配置服务端地址，默认为 `http://localhost:3000`。

---

## 🔧 常见问题

### Q: 连接状态显示 "未连接"

**原因**：服务端未启动或端口被占用

**解决**：
```bash
# 检查端口是否被占用
netstat -ano | findstr "3000"

# 重新启动服务端
cd server && pnpm dev
```

### Q: 加入房间提示错误

**原因**：房间号错误或房间已不存在（服务重启后房间会丢失）

**解决**：
- 确认房间号正确
- 如果服务重启过，需要重新创建房间

### Q: 点击座位无反应

**原因**：昵称为空或已经入座

**解决**：
- 确保已输入昵称
- 一个玩家只能坐一个位置

### Q: 开始游戏按钮不显示

**原因**：
- 非房主无法开始游戏
- 入座玩家少于 2 人

**解决**：确保有 2 人以上入座

### Q: 游戏界面操作按钮不显示

**原因**：不是当前行动玩家

**提示**：只有轮到自己行动时才会显示操作按钮

---

## 📊 调试技巧

### 查看服务端日志

服务端会输出详细的游戏日志：

```
[Socket] 玩家 Player1 连接
[RoomManager] 房间 766864 已创建
[Socket] 玩家 Player2 加入房间 766864
[GameController] 新手牌开始: handId=xxx, 庄家=0, 小盲=1, 大盲=2
[GameController] Player1 CALL 20
[GameController] Player2 CHECK
...
```

### 浏览器控制台

客户端会在浏览器控制台输出调试信息：

```
[Socket] 已连接
[Socket] 房间已创建: 766864
[Socket] 收到手牌: [{suit: "SPADES", rank: 14}, {...}]
```

### 网络请求

打开浏览器开发者工具 → Network → WS，可以查看 WebSocket 消息流。

---

## 📁 项目结构

```
TexasPokerMVP/
├── server/                 # 服务端
│   ├── src/
│   │   ├── index.ts        # 入口，WebSocket 处理
│   │   ├── GameController.ts # 游戏控制器
│   │   ├── PokerEngine.ts  # 扑克引擎
│   │   ├── RoomManager.ts  # 房间管理
│   │   └── Player.ts       # 玩家类
│   └── package.json
├── client/                 # 客户端
│   ├── src/
│   │   ├── App.vue         # 主组件（首页/房间/游戏）
│   │   ├── composables/
│   │   │   └── useSocket.ts # WebSocket 连接层
│   │   ├── types/          # 类型定义
│   │   └── store/          # 状态管理
│   └── package.json
└── docs/                   # 文档
    ├── websocket-protocol.md # 协议文档
    └── integration-guide.md  # 联调说明
```

---

## ✅ 自检清单

| 项目 | 状态 |
|------|------|
| 服务端启动 | ✅ |
| 客户端启动 | ✅ |
| WebSocket 连接 | ✅ |
| 创建房间 | ✅ |
| 加入房间 | ✅ |
| 玩家入座 | ✅ |
| 开始游戏 | ✅ |
| 发牌显示 | ✅ |
| 玩家操作 | ✅ |
| 底池计算 | ✅ |
| 结算显示 | ✅ |

---

**结论**：系统满足「可玩一局」标准。
