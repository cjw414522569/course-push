# 课表推送平台

基于 pushplus 的微信课表定时推送系统。多用户课表管理 + 定时推送到微信，并提供 API 密钥供桌面端等第三方程序接入。

## 功能

- **多用户**：开放注册（管理员可开关），每个用户独立的数据空间（课程 / 任务 / 日志 / 设置）
- **课表管理**：周网格视图、无限节次、大小课（大课默认占两节）、周次范围与单双周过滤、复制 / 剪切 / 粘贴 / 拖拽移动、时间冲突检测
- **定时推送**：今日 / 明日 / 本周三种任务类型，可视化配置推送时间与星期，cron 调度，无课自动跳过（可强制推送）
- **推送日志**：状态、流水号、响应详情，按用户隔离
- **午休 / 晚间分界**：课表网格按配置的时间自动插入分界行
- **API 密钥**：`kb_` 前缀密钥（SHA-256 哈希存储），供桌面端程序以 `X-API-Key` 或 `Bearer` 方式调用全部业务 API
- **管理员**：注册开关、用户列表（含数据统计）、昵称 / 角色修改、重置密码、停用（即时踢下线）、删除（级联清理）

## 技术栈

| 端 | 选型 |
|---|---|
| 后端 | Node.js ≥ 22.13（原生 TypeScript 直接运行，零构建）、Fastify 5、`node:sqlite`、croner |
| 前端 | Vue 3 + TypeScript + Vite + Element Plus |
| 推送 | pushplus（微信渠道，markdown / html 模板） |

## 快速开始

```bash
# 1. 安装依赖（需要 Node.js ≥ 22.13）
npm run setup

# 2. 构建前端
npm run build

# 3. 启动（默认 http://localhost:3300）
npm start
```

默认管理员：`admin / admin123`（首次启动自动创建，请登录后立即修改密码）。

## 开发模式

```bash
npm run dev   # 前后端并行：web(5173, 代理 /api) + server(3300)
```

## API 密钥使用

系统设置 → API 密钥 → 创建后复制明文（仅显示一次）：

```bash
# 方式一：X-API-Key 头
curl http://localhost:3300/api/view/day -H "X-API-Key: kb_xxxx..."

# 方式二：Bearer
curl http://localhost:3300/api/courses -H "Authorization: Bearer kb_xxxx..."
```

可用接口：`/api/view/day`、`/api/view/week`、`/api/courses`、`/api/tasks`、`/api/times`、`/api/settings/semester`、`/api/preview` 等。

## 目录结构

```
├─ package.json        # 根：setup / dev / build / start 脚本
├─ server/             # 后端
│  ├─ src/
│  │  ├─ index.ts      # Fastify 入口（静态托管 + SPA 回退）
│  │  ├─ db/           # SQLite（WAL）+ 启动自动迁移
│  │  ├─ routes/       # auth / courses / tasks / admin
│  │  └─ services/     # 调度器、pushplus 客户端、渲染、加密、密钥
│  └─ scripts/         # 冒烟测试（smoke / web-smoke / multiuser-smoke）
└─ web/                # 前端（构建产物由后端托管）
```

## 数据与安全

- 数据库与主密钥位于 `server/data/`（自动创建，已在 `.gitignore` 排除）
- pushplus token 使用 AES-256-GCM 加密存储，接口只回显脱敏形式
- API 密钥仅存哈希；用户停用即时生效（JWT 与 API Key 双通道同时失效）

## 测试

```bash
cd server
node scripts/smoke.mjs           # 核心 API 冒烟
node scripts/web-smoke.mjs       # 前端接口覆盖
node scripts/multiuser-smoke.mjs # 多用户隔离 + API 密钥
```
