# ngrok 内网穿透指南

## 一、安装 ngrok

### macOS

```bash
brew install ngrok
```

### Linux

```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
  && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list \
  && sudo apt update \
  && sudo apt install ngrok
```

## 二、配置 Token

1. 注册 [ngrok.com](https://ngrok.com)
2. 获取 Authtoken
3. 设置 token：

```bash
ngrok config add-authtoken YOUR_TOKEN
```

## 三、启动服务

### 方式一：两个端口分别穿透

终端 1 - 前端：
```bash
ngrok http 5173
```

终端 2 - 后端：
```bash
ngrok http 3000
```

### 方式二：配置文件（推荐）

创建 `ngrok.yml`：

```yaml
version: "2"
tunnels:
  frontend:
    addr: 5173
    proto: http
  backend:
    addr: 3000
    proto: http
```

启动：
```bash
ngrok start --all
```

## 四、前端配置

创建 `.env.production` 或修改现有配置：

```env
VITE_SERVER_URL=https://YOUR_BACKEND.ngrok-free.app
```

## 五、常见问题

### Q: WebSocket 连接失败

**A:** 确保：
1. 后端使用 ngrok https 地址
2. 前端 `VITE_SERVER_URL` 配置正确
3. Socket.IO 会自动处理 wss

### Q: 刷新后 404

**A:** ngrok 免费版每次重启会变更域名，需：
1. 使用 ngrok 付费版固定域名
2. 或每次重启后更新 `.env.production`

### Q: 多人同时进房失败

**A:** 检查服务端日志，确保：
1. 房间号正确
2. 昵称不为空
3. 网络连接稳定

## 六、完整流程

```bash
# 1. 启动服务端
cd server && pnpm dev

# 2. 启动 ngrok（新终端）
ngrok http 3000

# 3. 复制 ngrok 地址（如 https://abc123.ngrok-free.app）

# 4. 修改前端配置
echo "VITE_SERVER_URL=https://abc123.ngrok-free.app" > client/.env.local

# 5. 启动前端
cd client && pnpm dev

# 6. 分享前端 URL 给朋友
```
