# 途忆 · 基于大语言模型的个性化旅游攻略生成软件

> 本科毕业设计（2027 届）· 工作目录 `E:\Learn\tuyi` · 当前阶段：项目骨架
> 名字：途忆 = 旅途 + 记忆；智能体昵称「小忆」。

「途忆」（小忆）是一个旅游规划师智能体：用户用自然语言说出行需求，系统调用大语言模型（DeepSeek）+ 景点数据（高德 POI）+ 天气，生成带时间、地点、活动的结构化行程攻略，并逐步记住用户偏好（记忆消化），越用越懂你。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Node.js 18+，零 npm 依赖 | 复用 Momo 的「大脑」改造 |
| 模型 | DeepSeek API（SSE 流式） | `deepseek-v4-flash` 对话 / `deepseek-v4-pro` 推理 |
| 数据 | 高德开放平台 POI + 天气 API | 实时地理信息约束，降低幻觉 |
| 前端 | 原生 HTML / CSS / JS，三页 | 聊天 / 偏好统计看板 / 个人中心 |
| 数据分析 | Python（标准库；统计用 pandas） | 记忆消化（digest.py）+ 偏好统计（ECharts 看板） |
| 存储 | 本地 JSON 文件 | 沿用 Momo 数据层风格 |

## 目录结构

```
tuyi/
├── server.js            # HTTP 服务：静态页面 + /api/chat（SSE）
├── check.js             # 自检：语法 + 配置 + 工具注册
├── config.json          # 非敏感配置
├── .env.example         # 密钥模板（复制为 .env 后填写）
├── brain/               # 大脑：与界面无关的智能体逻辑
│   ├── llm.js           #   DeepSeek 流式客户端
│   ├── agent.js         #   ReAct 主循环（工具调用 ≤6 步）
│   ├── tools.js         #   工具注册与分发（自动加载 tools/）
│   ├── memory.js        #   分层记忆（抽取 / 检索 / 注入）
│   ├── stats.js         #   偏好统计（标签 / 目的地 / 预算 / 意图）
│   ├── auth.js          #   本地账号与会话（scrypt + httpOnly cookie）
│   └── prompts/         #   提示词（persona.md 人设）
├── tools/               # 工具实现（plan_trip 校验、高德 POI、天气、memory_edit）
├── py/                  # Python：记忆消化（digest.py，里程碑 3 起）
├── web/                 # 前端（React + Vite，源码 src/，构建产物 dist/）
├── test/                # 测试（冒烟 + 联网联调）
├── scripts/             # 辅助脚本（seed-accounts / ablation / build-geo）
├── docs/                # 设计文档（plan.md / development.md）
└── data/                # 运行时数据（记忆 / 账号 / 会话，git 忽略）
```

## 快速开始

```bash
# 1. 配置密钥
copy .env.example .env    # 然后填写 DEEPSEEK_API_KEY（必需）、AMAP_KEY（可选）

# 2. 启动（首次打开会跳到登录页）
node server.js            # 打开 http://127.0.0.1:8787
node scripts/seed-accounts.js   # 可选：生成本地测试账号（仅用于开发自测）

# 2.0 前端说明：web/dist 是已构建产物，直接可用；改前端代码需：
#     cd web && npm install && npm run dev   （开发调试，代理 /api 到 8787）
#     cd web && npm run build                （重新构建 dist/）

# 2.1 一键启动（可选）：在桌面生成快捷方式
powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1
# 之后双击桌面「途忆（启动并打开网页）」：后台起服务 + 等端口就绪 + 自动开浏览器；
# 「途忆（打开网页）」只开网页；「途忆（停止服务）」停服务。日志在 logs/server.*.log。

# 3. 自检与测试
node check.js             # 语法 + 配置 + 工具注册
node test/smoke.js        # 冒烟测试（不联网）
node test/live.js         # 手动联网联调（需 Key + 网络，会真实调用 DeepSeek 和高德）
node test/live-auth.js    # 账号 + 历史联调（需服务已启动）
node test/live-timeline.js    # 时序联调：第一次 / 第二次（需 Key）
node test/live-memory-edit.js # 对话式记忆编辑联调（需服务已启动）
python py/digest.py --user <用户ID> --force   # 手动触发一次记忆消化
node scripts/build-geo.js                     # 可选：重建地图 GeoJSON（数据已提交，一般不用跑）
```

## 地图数据

`web/public/vendor/geo/` 下的省 / 市级 GeoJSON 来自 [DataV.GeoAtlas](https://geo.datav.aliyun.com/areas_v3/bound/)（阿里云 DataV），已本地化，答辩现场断网也能显示地图。生成脚本见 `scripts/build-geo.js`；论文引用时注明数据来源与用途（学习 / 演示）。

## 里程碑

1. **骨架跑通**（已完成）：流式聊天 + 行程工具 + 三页占位。
2. **行程生成**（已完成）：高德 POI / 天气接入，行程卡片接真实数据。
3. **个性化记忆**（已完成）：分层记忆 + 记忆消化（Python 轻量版）。
4. **数据看板**（已完成）：偏好统计（标签 / 目的地 / 预算 / 意图）+ 个人中心（画像 / 记忆 / 行程）。
5. **收尾**（已完成）：测试、论文素材（架构图 / 提示词设计 / 消融实验 / 答辩脚本）。
6. **账号与多轮会话**（已完成 v1.1.0）：本地账号 + 登录页 + 历史加载。
7. **记忆时序与可编辑**（已完成 v1.2.0）：行程时间线注入（第一次 / 第 N 次）+ 对话式记忆增改删。
8. **个人看板**（已完成 v1.3.0）：我的旅行（城市 / 次数 / 天数 / 预算 / 足迹表）。
9. **地图点亮**（已完成 v2.0.0）：省 / 市粒度切换，行程自动点亮 + 手动标记去过。
10. **桌面快捷方式**（已完成 v2.0.1）：一键启动 / 打开网页 / 停止服务。
11. **React 前端重构**（v3.0.0）：React + TypeScript + Ant Design 重做前端（登录注册 / 聊天 / 我的旅行 / 个人中心）；旧页面移入 web/legacy/（v3.4.0 删除）。
12. **行程生命周期**（v3.1.0）：行程状态机（草稿 → 已确认 → 进行中 → 已完成）；生成默认草稿、确认后会计入去过城市并点亮地图；连续修改（同一方案原地改，只重排未进行的天，历史版本可展开查看）；聊天页 / 个人中心可查看详情、确认、出发、完成、删除草稿；刷新切页后行程卡片完整恢复。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/plan.md](docs/plan.md) | 方案定稿（选型 / 里程碑 / 变更记录） |
| [docs/architecture.md](docs/architecture.md) | 系统架构与数据流（论文第 3 章） |
| [docs/prompt-engineering.md](docs/prompt-engineering.md) | 提示词设计与防幻觉策略（论文第 4 章） |
| [docs/ablation.md](docs/ablation.md) | 消融实验设计（论文第 5 章） |
| [docs/demo.md](docs/demo.md) | 答辩演示脚本 |
| [docs/modification-plan.md](docs/modification-plan.md) | v1.x 修改方案（7 个反馈问题 → 版本计划） |
| [docs/v3-plan.md](docs/v3-plan.md) | v3 更新方案（18 条问题 → v3.0.0~v3.4.0 版本计划，已拍板） |
| [docs/design.md](docs/design.md) | 前端设计系统（配色 / 布局 / 组件 / AI 交互规范） |
| [docs/development.md](docs/development.md) | 开发规范（提交 / 版本 / 测试 / 密钥红线） |

## 复用说明

骨架由 Momo（`E:\Learn\Momo`）的「大脑」改造而来：Agent 主循环、插件式工具、分层记忆、流式调用。已去掉 QQ / 桌宠接入层，前端换成 Web。复用清单见 `E:\Learn\Momo\docs\graduation-project-reuse.md`。

## 许可证

MIT © 2026 tishencainiao。详见 [LICENSE](LICENSE)。
