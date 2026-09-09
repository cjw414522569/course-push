# 课表推送平台

基于 [pushplus](https://www.pushplus.plus) 的微信课表定时推送系统。多用户课表管理 + 定时推送到微信/邮件/APP 等 10 种渠道，并提供 API 密钥供桌面端等第三方程序接入。

## 功能

### 课表管理
- 周网格视图，时段列（上午 / 下午 / 晚上）+ 午休、晚间分界行（时间可配置）
- 无限节次，支持大小课（大课默认占两节小课），可排序、增删
- 周次范围（如 `1-8,10-16`）与单双周过滤
- 网格直接操作：点击空白格新增、右键复制 / 剪切 / 粘贴 / 删除、拖拽移动
- 时间冲突检测（同一天节次重叠即时拦截，提示冲突课程名）

### 定时推送
- 今日 / 明日 / 本周三种任务类型，可视化配置推送时间与星期，cron 调度
- 推送形式全局可选：**文字**（markdown 列表）或**表格**（课表网格富文本）
- 10 种官方渠道**多选**（微信公众号 / APP / 插件 / Webhook / ClawBot / QQ 机器人 / 企业微信 / 邮件，短信 / 语音为收费渠道），多渠道自动走批量接口
- 无课自动跳过（可按任务强制推送），推送日志记录流水号与响应详情

### 多用户与管理员
- 开放注册（管理员可开关），每个用户独立的数据空间
- 管理员：用户列表（课程 / 任务 / 密钥统计）、昵称 / 角色修改、重置密码、停用（JWT 与 API Key 即时失效）、删除（级联清理）
- 防自锁：管理员不能停用 / 降级 / 删除自己

### API 密钥
- `kb_` 前缀密钥，SHA-256 哈希存储，明文仅创建时显示一次
- 供桌面端等第三方程序以 `X-API-Key` 或 `Bearer` 方式调用全部业务 API

## 技术栈

| 端 | 选型 |
|---|---|
| 后端 | Node.js ≥ 22.13（原生 TypeScript 直接运行，零构建）、Fastify 5、`node:sqlite`、croner |
| 前端 | Vue 3 + TypeScript + Vite + Element Plus |
| 推送 | pushplus（多渠道，markdown / html 模板） |

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

## pushplus 配置

1. [获取 token](https://www.pushplus.plus/push1.html)：微信扫码登录后复制 token，粘贴到 系统设置 → Token
2. [绑定渠道](https://www.pushplus.plus/uc-channel.html)：APP / 插件 / Webhook / ClawBot 等渠道需先绑定
3. 系统设置 → 推送渠道：勾选需要同时推送的渠道
4. 推送任务页：启用任务或点「立即执行」测试

> 注意：未绑定的渠道 pushplus 官方会回落到微信公众号发送。

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

## 开发模式

```bash
npm run dev   # 前后端并行：web(5173, 代理 /api) + server(3300)
```

## 测试

```bash
cd server
node scripts/smoke.mjs           # 核心 API 冒烟
node scripts/web-smoke.mjs       # 前端接口覆盖
node scripts/multiuser-smoke.mjs # 多用户隔离 + API 密钥
```
