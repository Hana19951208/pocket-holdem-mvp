---
trigger: always_on
---

# 项目规范文档

## 项目背景
**Pocket Holdem MVP** - 一个为朋友设计的私人德州扑克工具。

## 编码规范
1. **语言选择**：所有文件使用 TypeScript，启用严格模式
2. **设计原则**：遵循 SOLID 原则，优先使用组合而非继承
3. **命名规范**：
   - 类/组件：PascalCase
   - 变量/函数：camelCase
   - 常量/Socket 事件：UPPER_CASE
4. **逻辑隔离**：PokerEngine 必须是无副作用的纯类，需包含单元测试

## UI/UX 设计指南
1. **风格**：苹果式极简主义（SF Pro 字体，系统颜色，大圆角：12px-24px）
2. **Tailwind**：使用语义化的工具类，避免硬编码十六进制颜色（除非在 tailwind.config.js 中定义）
3. **响应式**：移动浏览器优先的纵向设计，所有操作按钮必须位于屏幕底部 30% 区域，便于拇指操作

## 安全规则
1. **隐私保护**：WebSocket 广播中绝不泄露其他玩家的底牌
2. **服务器验证**：在更新状态前，服务器必须验证所有玩家操作（下注金额、回合顺序）
3. **输入净化**：净化所有玩家昵称，防止 XSS 攻击

## AI 行为准则
1. **代码简洁**：始终提供简洁的代码。如果文件较大，只显示相关修改部分
2. **逻辑验证**：如果请求边池或手牌评估逻辑，在输出前务必仔细检查数学计算和边界情况
3. **文档注释**：为复杂函数添加 JSDoc 注释，特别是 GameEngine 中的函数

## 核心偏好 (Core Preferences)
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
2. python 环境优先使用D:\tools\development_tools\miniconda3\来验证，不用使用系统自带的python或python3，请激活conda activate base环境
3. 记住你的每次回答，需要检查是否要保持同步 reademe 文件.
4. 当你使用github进行提交msg/tag时，默认使用中文描述
5. 我的本地终端默认使用的是PowerShell终端，后续提供命令要遵循PowerShell终端的语法规则