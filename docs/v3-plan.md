# 途忆 v3 更新方案（18 条反馈的归并与实施计划 · 已拍板版）

> 生成日期：2026-11-11。本方案所有「现状」结论均来自对当前代码（master=ccdd097，v2.0.1）的逐文件核对，每条标注涉及文件。§9 为用户拍板记录（2026-11-11）。

## 0. 结论速览

18 条反馈归并为 **5 个版本 + 3 份清单**（提示词 / 功能建议 / 成熟度差距）。

| 版本 | 主题 | 对应条目 |
| --- | --- | --- |
| v3.0.0 | 前端 React 重构 + 设计系统 + 演示信息清理 | ① ② ④ |
| v3.1.0 | 行程生命周期：确认机制、连续修改、详情、历史恢复 | ⑤ ⑨ ⑩ ⑪ |
| v3.2.0 | 注册（邮箱/手机）+ 引导页 + 个人资料 | ⑭ ⑮ |
| v3.3.0 | 小忆形象与 logo 接入 + 话术去 AI 味 | ⑦ ⑫ ⑬ |
| v3.4.0 | 全局统计处理 + 工程化收尾 | ⑥ ⑯ |

## 1. 现状核对（读代码得出的结论，不捏造）

| # | 反馈 | 代码事实 | 涉及文件 |
| --- | --- | --- | --- |
| ① | 不是 React | 前端为原生 HTML+JS 五页（index/dashboard/profile/login + styles.css），无构建工具、零 npm 依赖 | web/* |
| ② | 查网上资料 | 本轮一次泛查询（AI 旅游助手功能设计）返回全为 AI 通识/导航站，无可借鉴产品细节 → 改为直接采用成熟产品模式（见 §2），实施时按需定向查证 | — |
| ④ | 演示信息 | 残留：`scripts/seed-demo.js`、`data/memory/` 下 demo-* 用户数据、dashboard 全局页签「含演示数据」文案、登录页测试账户提示 | scripts/seed-demo.js、web/dashboard.*、web/login.* |
| ⑤ | 行程未确认就「算去过」 | agent 收尾 `rememberTurn` → `memory.appendItinerary` 直接入库，无任何状态字段；统计/时间线/地图都当作真实去过 | brain/agent.js、brain/memory.js |
| ⑥ | 全局统计没必要 | `brain/stats.js computeStats` + `GET /api/stats` + dashboard「全局统计」页签 | brain/stats.js、server.js、web/dashboard.* |
| ⑦ | 酒店回复机械 | `tools/_amap.js formatPoi` 的 `cost` 取自高德 `biz_ext.cost`，酒店类 POI 基本无此字段（只有门票/人均有值），模型如实复述「接口没有返回房价」 | tools/_amap.js、tools/amap-poi.js |
| ⑧ | Momo 有什么可借鉴 | Momo 已核对至 v1.90.2，可借鉴清单见 §7 | — |
| ⑨ | 行程不可点开 | 个人中心行程列表只有摘要行，无详情视图 | web/profile.* |
| ⑩ | 切页回来行程不见 | `GET /api/history` 只回放文本轮次，行程卡片不会重建（根因） | server.js、web/app.js |
| ⑪ | 方案无连续性 | `plan_trip` 每次全新生成，行程无 id/版本概念，无法「在原方案上改」 | tools/plan-trip.js、brain/agent.js |
| ⑭ | 无个人资料 | 无结构化资料字段与注入，仅靠记忆抽取 | brain/memory.js |
| ⑮ | 注册只有用户名 | `brain/auth.js` 仅用户名+密码，无邮箱/手机、无引导页 | brain/auth.js、web/login.* |

## 2. 总体架构方向（React 版）

- **前端**（方案 A，已拍板）：Vite + React 18 + TypeScript + Ant Design 5 + zustand + ECharts + react-router。
  - 开发：vite devServer 把 `/api` 代理到 8787；生产：`npm run build` 产物放 `web/dist/`，由 `server.js` 静态托管 —— 保持单端口 8787，桌面快捷方式不变。
  - 放弃「零 npm 依赖」原则（已拍板）。
- **后端**：保持 Node 零依赖不变；新增行程接口（确认/更新/列表）与资料接口；memory 文件加 schemaVersion + 迁移函数。
- **设计系统**：用 DSH 新插件 `ui-ux-pro-max`（design_recommend / design_search / design_review）产出风格、配色、字体、UX 规范，在 v3.0.0 落地并记录到 `docs/design.md`（论文第 4 章可引用）。
- **借鉴的成熟产品模式**（实施时按需定向查证细节）：
  - TripIt：行程状态机「计划中 → 进行中 → 已完成」；
  - Wanderlog：计划 vs 实际、逐日编辑、雨天改期重排；
  - 携程行程单：按天折叠，点开看当日明细；
  - 马蜂窝足迹：去过城市点亮 + 「足迹 N 城」统计；
  - QQ 聊天：左侧头像 + 消息气泡（需求 ⑬ 自定）。

## 3. 版本计划（按目标，不按日期）

顺序已拍板：3.0 前端 → 3.1 行程 → 3.2 账号 → 3.3 形象 → 3.4 清理。每版仍遵守：一提交一 tag（feat:/fix:/… 前缀）、双远端推送。

## 4. 逐条方案详情

### 4.0 v3.0.0 —— ① 前端 React 重构 + ② 借鉴落地 + ④ 演示信息清理

**已拍板：方案 A。**

- A：Vite + React 18 + TS + Ant Design + zustand + ECharts。
  - 理由：中文文档、组件齐全（表单/弹窗/表格/地图容器）、开箱即好看，符合「技术不强但要好看」；TS 为毕设工程化加分。
- （备选记录）B：Vite + React 18 + JS + 手写组件 + Tailwind；C：Next.js。均不采用。

**影响**：首次引入 npm 依赖（`package.json` 现有 name 不变，新增 dependencies 与 build 脚本）；`check.js` 之后挂 `npm run build`；web/ 旧五页由 React 版替代（旧文件删除前保留 git 历史即可恢复）。

**代价**：大（约占总工作量 40%），一次到位，后续所有 UI 需求都在这套上做。

**演示信息清理（④，已拍板按清单全删；涉及删数据，删前自动备份 `data/backup-YYYYMMDD-HHMMSS/`）**：
1. 备份 `data/`；
2. 删除 `scripts/seed-demo.js` 及 `data/memory/demo-*` 等演示用户数据；
3. 登录页移除「测试账户：test1/123456」类提示；
4. README 中演示账号说明改为「测试账号见 scripts/seed-accounts.js（本地自建，不预置）」；
5. 保留：`scripts/seed-accounts.js`（测试工具，不进版本库展示）、`docs/demo.md`（答辩脚本，非界面演示信息）。

### 4.1 v3.1.0 —— ⑤ 行程确认机制

- 数据：itinerary 条目增加 `id`、`status`、`days[].done`、`createdAt/updatedAt`。
- 状态机：`draft`（生成即草稿）→ `confirmed`（用户点「确认执行」）→ `active/completed`（旅行中/旅行后，由小忆在聊天里确认后置位）→ `cancelled`（放弃）。
- 规则：**只有 confirmed 及以后的行程才计入** 时间线、去过城市、地图点亮与统计；草稿只出现在「我的方案」里。
- 交互：行程卡片带「确认执行 / 先存着」按钮；聊天中说「出发了 / 去过了」由小忆追问确认后再标记，不自动认定。
- **兼容（已拍板 B）**：旧数据无 status，**全部置为 `draft` 草稿**。
  - ⚠ 后果：现有测试账号（如 test1 的云南/成都演示行程）将不再计入地图点亮与时间线，需在界面重新「确认执行」后才点亮；`docs/demo.md` 答辩脚本的演示步骤需同步调整。

**影响**：brain/memory.js（appendItinerary → upsert+status）、brain/agent.js（时间线只注入 confirmed+）、brain/stats.js（过滤）、tools/plan-trip.js（返回 planId）、React 行程卡片。

**代价**：中。状态机设计可写进论文「行程生命周期状态机」一节。

### 4.2 v3.1.0 —— ⑨ 行程详情 + ⑩ 历史恢复

- ⑨：行程列表条目可点开 → 详情视图：按天折叠、每日 items 明细、预算、状态、按钮（继续修改 / 标记完成）。
- ⑩：根因是 `/api/history` 只存文本。方案：新增 `GET /api/plans?conversationId=`；React 聊天页初始化时拉当前会话行程并渲染卡片。不改 /api/history 的旧契约（旧数据仍可回放文字）。

**影响**：server.js、memory.js（查询）、React 行程组件。**代价**：小-中。

### 4.3 v3.1.0 —— ⑪ 方案连续性与修改（本版本核心）

- 数据：`state.activePlanId` 指向当前行程；itinerary 加 `revision`；`days[].status: done|upcoming`。
- 语义：用户说「下雨了，改一下后面的」→ 小忆加载当前行程 → 已完成天数折叠不动，只重排未到日期（必要时先 get_weather）→ `plan_trip(update)` 返回**同一 planId** 的新版本（revision+1）→ 前端原位更新卡片，不新建。
- 显示：默认只显示「后续计划」，前面已过日期折叠，可展开查看。
- 新工具/参数：`get_plan(planId)`、`plan_trip` 增加 `mode: create|update` 与 `planId`；persona 增加「连续修改」规则（先读原方案、保留已完成部分、说明改了哪几天）。

**影响**：brain/agent.js、tools/plan-trip.js、brain/memory.js、persona 提示词、React 卡片。**代价**：大（与 4.1 合并实现）。

**推荐**：直接做。这是相对通用聊天机器人的差异化亮点，论文创新点可写「行程状态的连续演化与记忆闭环」。

### 4.4 v3.3.0 —— ⑦ 话术去 AI 味（借 Momo）

- persona 加入（Momo `STYLE_DIRECTIVE` 改造版）：口语短句、不写括号动作、禁 Markdown；输出节奏四律（简短/不翻译/两拍顶嘴/碎片）；红线（不假承诺、不编经过）；禁词表（「作为一个AI」「您的」「希望对你有所帮助」等 13 硬禁 + 「进行/获取/予以/确保」等书面腔软禁）。
- 价格话术统一：查不到价格时只说「价格我这边查不到，你去携程/美团看实时价更准」，**不再复述接口细节**。
- 工具侧：`search_poi` 对住宿类（type 含「住宿」）且 `cost=0` 的结果附加 `priceHint`，模型按 hint 说话。

**影响**：brain/prompts/persona.md、tools/_amap.js、tools/amap-poi.js。**代价**：小。

### 4.5 v3.2.0 —— ⑭ 个人资料 + ⑮ 注册与引导

- 资料模型（借 Momo `user-profile.js`）：`{ nickname, age, gender, companions[{name,relation,age}], preferences[], travel_style, healthNotes? }`，每字段带来源标记 `_src: confirmed（用户填写）/inferred（对话抽取）`，并加防捏造正则（不许把 AI 自己的动作写进用户资料）。
- 注入：persona 与 plan_trip 提示词注入资料块（同行老人/小孩 → 影响节奏、景点类型、行程密度）。
- ⑮ 注册：邮箱注册（正则校验）+ 手机号注册（大陆号段校验）+ 保留用户名注册。
- **验证码（已拍板 B：模拟验证码演示）**：本地系统不发真实短信/邮件，注册流程展示验证码输入框，验证码直接显示在页面上（演示用），论文注明真实发送短信/邮件列为展望。
- 引导页：注册后 3 步（称呼/年龄/性别 → 同行人 → 偏好标签），可跳过，个人中心随时补。
- 个人中心：资料编辑 + 记忆管理（已有）+ 行程列表（点开详情，⑨）。

**影响**：brain/auth.js（users.json 结构）、新增 GET/PUT /api/profile、React 注册/引导/个人中心页。**代价**：中。

### 4.6 v3.3.0 —— ⑫ logo + ⑬ 小忆形象（即梦 Dreamina 出图，用户操作）

- **角色设定（已拍板）：小云朵精灵** —— 白色圆润云朵身体、浅蓝色点缀、斜挎小旅行包；与 Momo 同「圆润 Q 版软萌」风格但角色独立；logo 与小忆同一角色同一配色（天蓝+白）。
- 动作分组（每组即梦单独出图 2~3 张）：
  - 工作组：认真查地图、双手递行程单、认真打字；
  - 休闲组：趴云朵打盹、捧奶茶眯眼笑、开心转圈。
- 触发规则：生成行程/工具执行中 → 工作组轮播；用户 30 秒不说话 → 休闲组；用户发消息 → 挥手打招呼。
- 接入：出图后放到 `web/src/assets/xiaoyi/`（最终路径以用户给的为准），React 聊天页改为 QQ 风（左侧小忆头像 + 气泡），动作用图片切换（CSS/组件，不做骨骼动画）。
- 提示词全文见 §10，可直接复制到即梦。

**影响**：仅前端聊天页布局与素材目录，无后端改动。**代价**：小-中。

### 4.7 v3.4.0 —— ⑥ 全局统计处理

**已拍板：方案 B（彻底删除）。**

- `GET /api/stats` 与 `brain/stats.js` 中全局聚合逻辑（computeStats/collectRecords 及调用点）一并删除，dashboard 全局页签移除。
- 论文「大数据」章改为以**个人统计**（`computePersonalStats`：城市/次数/预算/偏好）为素材；如需答辩演示，用命令行脚本对个人数据生成统计报告（实施时定稿）。

**影响**：web/dashboard、server.js 路由、brain/stats.js。**代价**：小。

### 4.8 v3.4.0 —— ⑯ 工程化清单（借 Momo 已验证做法）

| 项 | 内容 | 来源 |
| --- | --- | --- |
| 发布 | `scripts/release.ps1`：提交 + tag + 双远端幂等补推（ls-remote 三次重试，只推不一致 ref），解决 GitHub 老断线 | Momo release.ps1 |
| 测试 | node:test 单测补 brain/memory、brain/stats、tools/plan-trip 纯函数；smoke 扩充新 API | 自研 |
| 前端质量 | ESLint + Prettier + TS 严格模式；`npm run build` 挂 pre-commit（与 check.js 并列） | 通用实践 |
| 文档 | docs/index.md 文档地图 + AGENTS.md 事实速查（Momo 同款） | Momo |
| 数据 | memory 文件 schemaVersion + 迁移函数（v3 改模型自动回填） | 通用实践 |
| 运维 | 启动时 .env 校验（缺 Key 即报错）、简单限流、日志分级（logs/ 已有） | 自研 |

## 5. ⑰ 还需要什么功能（建议分级）

- **高价值**（v3.4 后按需做）：行程导出（图片/PDF 行程单，答辩演示效果好）；天气变化提醒（出发前对比预报）；景点收藏心愿单；旅行花费记账（实际 vs 预算，可并入个人统计）。
- **中价值**：行程分享链接；语音输入（浏览器 Web Speech API，免费）；PWA 离线。
- **论文展望即可**：机票酒店预订（无开放 API）、多人协作、多语言。

## 6. ⑱ 成熟项目差距清单（毕设视角分级）

- **必须补**（否则验收弱）：自动化测试（单测+冒烟+联调）、错误处理与降级、文档完整、安全基础（会话/密钥已有，补限流与输入校验）、数据迁移。
- **建议补**：CI（Gitee Go 或本机脚本）、发布脚本、日志、备份脚本、隐私说明页、移动端响应式。
- **论文展望**：监控告警、容器化、CDN、国际化、商业化运营。

## 7. 从 Momo v1.90.2 借鉴清单（⑧）

| 借鉴项 | 用到哪 |
| --- | --- |
| STYLE_DIRECTIVE 输出四律 + 禁词表 | 4.4 话术去 AI 味 |
| user-profile.js：结构化画像、_src 来源标记、防捏造正则 | 4.5 个人资料 |
| release.ps1 幂等发布 | 4.8 发布 |
| doc-check + docs/index.md + AGENTS.md | 4.8 文档 |
| fabrication-guard 思路（没做过不许说做过） | 行程状态机（没确认去过就不算去过） |
| 人格表述「形象 ≠ 实体」 | persona（小忆知道自己只是软件里的伙伴） |

**不搬**：QQ 桥接/桌宠、语音（GPT-SoVITS 栈重）、大量个人生活插件。

## 8. 代价与风险总览

- **总工作量**：大（5 个版本，连续执行每版约 0.5~1 天）；前端重构占 40%。
- **引入 npm 依赖**：放弃零依赖原则（已拍板）；npm 可用、registry=npmjs 已验证。
- **数据风险**：删演示数据、行程模型加字段 —— 一律先备份 `data/backup-YYYYMMDD-HHMMSS/`，迁移失败可回滚。
- **GitHub**：继续用 release 脚本幂等补推；当前还欠 v1.1.0/v1.2.0/v1.3.0/v2.0.1 四个 tag 未推（下次发布一并补）。
- **论文联动**：全局统计彻底删除后，「大数据」章改为「个人统计 + 命令行统计报告」；行程状态机写入「防幻觉与一致性」节；旧行程置草稿后，答辩演示需现场「确认执行」。

## 9. 拍板记录（2026-11-11，7 项已确认）

| # | 事项 | 决定 |
| --- | --- | --- |
| 1 | 前端方案 | A：Vite+React+TS+AntD（引入 npm，放弃零依赖） |
| 2 | 全局统计 | B：彻底删除（后端接口与聚合模块一并删；论文用个人统计） |
| 3 | 旧行程数据 | B：全部置为草稿（需重新确认才计入地图/时间线） |
| 4 | 注册验证 | B：模拟验证码演示 |
| 5 | 小忆形象 | 小云朵精灵（天蓝+白） |
| 6 | 版本顺序 | A：3.0 → 3.1 → 3.2 → 3.3 → 3.4 |
| 7 | 演示数据 | A：按清单全删（删前自动备份 data/） |
| 8 | 提醒 | GitHub 欠 v1.1.0/v1.2.0/v1.3.0/v2.0.1 四个 tag，下次发布一并补推 |

## 10. logo 与小忆提示词（即梦 Dreamina 直接复制）

> 角色已拍板：小云朵精灵（天蓝+白）。全部中文，复制到即梦即可。建议先生成基础立绘，定稿后用「统一后缀」保证后续动作图一致。

【Logo 主标】
> Q版卡通logo设计：一个圆润软萌的小云朵精灵，白色蓬松云朵身体，圆眼睛微笑，脸颊有腮红，斜挎一个浅蓝色小旅行包，头顶飘着一小朵浅蓝色云帽，身边点缀几滴小雨点和一个小行李箱；天蓝与白色主色调，点缀暖黄色小太阳；扁平可爱风格，圆角，纯白背景，无文字，适合作为旅游app的logo，高清，居中构图

【Logo 图标版（App 图标，圆角方形）】
> App图标：同一个云朵精灵大头像，微笑表情，圆角方形构图，天蓝渐变背景，白色云朵身体，简约扁平，无文字，iOS图标风格，高清

【小忆基础立绘】
> Q版软萌吉祥物立绘：白色圆润小云朵精灵拟人化，头顶一小片浅蓝色云朵，圆眼睛微笑，脸颊有腮红，小短手小短脚，斜挎一个浅蓝色小旅行包，云朵身体上点缀着小雨滴图案，干净浅色背景，全身照，可爱治愈风，类似卡通桌宠，高清

【动作·工作组】
1. 认真查地图：小忆双手展开一张大地图，皱着眉头认真看，旁边飘着红色定位小图标，白色云朵身体浅蓝点缀，同立绘
2. 递行程单：小忆小短手举起一张行程卡片递向前方，卡片上画着小图标，表情期待，同立绘
3. 认真打字：小忆坐在一台小电脑前认真打字，屏幕亮着，眼睛专注，同立绘

【动作·休闲组】
1. 打盹：小忆趴在自己的小云朵上打盹，头顶冒「Zzz」，表情安逸，同立绘
2. 喝奶茶：小忆小短手捧着一杯奶茶吸着，眼睛眯成月牙，一脸满足，同立绘
3. 开心转圈：小忆开心地转圈，身边飘着小雨点和星星，同立绘

【统一后缀（追加到每个动作提示词后）】
> 同一角色同一画风：白色云朵身体、浅蓝色点缀、斜挎小旅行包，纯色浅背景，无文字

## 11. 实施记录

### v3.0.0（已完成，2026-11-11，提交 6f7ac20）
- Vite + React 18 + TS + AntD 5 + zustand + ECharts + react-router；`web/dist` 由 server.js 托管，SPA 回退；旧页面移 `web/legacy/`（v3.4.0 删）。
- 页面：登录 / 注册 / 聊天（SSE 流式+工具过程 Tag+行程卡片+历史恢复）/ 我的旅行（KPI+柱状图+省/市地图点亮+足迹表）/ 个人中心（画像+记忆增删改+行程列表）。
- 演示数据清理：备份 `backups/`、删 `scripts/seed-demo.js`、删 `demo-*` 数据、README 同步。
- 设计系统见 docs/design.md（天蓝 #0EA5E9 + 暖橙 #FB923C）。
- 遗留（后续版本处理）：Markdown 渲染（v3.3.0）、代码分割与 ESLint（v3.4.0）、GitHub 补推。

### v3.1.0（已完成，2026-11-11）
- 行程状态机：`draft → confirmed → in_progress → completed`；生成默认草稿，确认后计入去过城市/点亮地图；旧行程自动迁移为草稿。
- 连续修改：`get_plan` 读当前方案 → `plan_trip(mode:update)` 同 plan_id 原地改，只重排未进行的天，历史版本进 `previousDays`（可展开），revision 计数。
- 新工具：`get_plan`、`update_plan_status`；persona 新增「行程的生命周期」规则。
- 新接口：`GET /api/plans`、`PUT /api/plans/:id/status`、`DELETE /api/plans/:id`（仅草稿可删）。
- 前端：PlanCard 状态/操作/详情、聊天页历史+行程卡片按时间线恢复、个人中心行程操作、我的旅行草稿提示。
- 测试：smoke 26 项（含状态机用例，TUYI_DATA_DIR 隔离）；真实 LLM 端到端验证「生成→草稿→确认→统计→雨天改室内→同一方案第 2 版」全链路通过。

### v3.2.0（2026-11-11）
- 注册三种方式：用户名（免验码）/ 邮箱 / 手机号（模拟验证码：内存 5 分钟 TTL、一次性，演示环境接口直接返回 mockCode，正式版改短信 / 邮件下发）；登录统一「账号」输入框（三字段任一匹配）。
- 引导页 `/onboarding`（注册后进入，可跳过）：称呼 / 年龄 / 性别 / 同行人（关系·称呼·年龄，可多条）/ 偏好标签（回车添加）/ 旅行风格 / 健康备注。
- 个人资料：`brain/profile.js` 新模块（data/user-profile/<userId>.json，白名单校验，sources 来源标记）；资料经 `renderProfileBlock` 注入 system 提示词（【用户资料】块），persona 增加用法规则（老人小孩放慢节奏；不盘问；新资料走 memory_edit）。
- 接口：`POST /api/verify-code`、`GET/PUT /api/userinfo`、`POST /api/onboard`；注册 / 登录兼容旧 `username` 参数。
- 前端：RegisterPage 三 Tab（验证码倒计时 60s + 绿色提示条显示模拟验证码）、OnboardingPage、ProfileForm 复用组件（引导页与个人中心共用）、个人中心「个人资料」卡（查看 + 编辑弹窗）、登录页提示语更新。
- 测试：smoke 32 项；浏览器全流程验证（邮箱注册→引导页填写→个人中心编辑→邮箱登录）；真实 LLM 验证资料注入（给 test1 填「外婆 68 岁、松弛、美食拍照」后发杭州行程请求，回复主动按 2 人（含外婆）算预算、安排游船免走路并说明节奏）。
- 修复：ProfileForm 偏好标签输入框被 Form.Item 注入 value/onChange 覆盖 → 输入导致表单字段变字符串、渲染崩溃；改为标签输入框脱离 Form.Item（仅 setFieldValue 维护）+ 隐藏字段存储。

### v3.3.0（2026-11-11）
- 小忆形象接入：即梦素材（E:\Learn\sc\tuyi 9 文件）复制到 web/public/xiaoyi/ 并改简洁名（工作 3 段：查地图 / 递行程单 / 打字；休闲 3 段：打盹 / 喝奶茶 / 转圈；立绘 / App 图标 / logo 主标）；`scripts/build-xiaoyi-assets.py`（Pillow）生成派生图：聊天头像 192px、favicon 64px、顶栏品牌标 48px、登录页立绘 320px。
- 前端：聊天页每条小忆回复带 QQ 风格圆头像；动态形象卡（右下角悬浮）：生成方案 / 工具运行中轮播工作动作，30 秒无操作轮播休闲动作（6 秒一换），有操作即隐藏；登录 / 注册页顶部放小忆立绘；顶栏与浏览器图标换小忆 logo。
- Markdown：引入 react-markdown，小忆回复支持加粗 / 列表 / 代码排版（流式输出时仍显示纯文本，避免抖动）。
- 话术去 AI 味：persona.md 新增「语气红线」——硬禁词 13 组（作为一个 AI / 您的 / 希望对你有所帮助等）+ 书面腔禁用（进行 / 获取 / 予以 / 确保 / 相关 / 上述）+ 不聊技术细节（接口 / API / 字段 / 返回）；查不到价格统一说「价格我这边查不到，以携程 / 美团实时价为准」。
- 工具：`tools/_amap.js formatPoi` 对无价格的酒店类 POI 返回 `price_note`（「暂无公开价格，价格以携程 / 美团实时价为准」），供模型直接引用。
- server.js：静态放行 `/xiaoyi/` 前缀（登录页也要加载形象）、MIME 增 `.mp4/.webm`。
- 实测：真实 LLM 问「春熙路一带的酒店」→ 回复「因为价格查不到，所以下面不写金额，房价请以携程 / 美团实时页为准」，不再出现「接口没返回房价」；带长辈提示生效（引用 test1 资料里的外婆）。

### v3.4.0（2026-11-11）
- 全局统计彻底删除（拍板⑥）：`brain/stats.js` 删除 `collectRecords`/`computeStats` 与 exports（保留 `computePersonalStats` 等个人统计）；server.js 删除 `GET /api/stats`；smoke 对应用例移除。论文「大数据元素」口径改为：个人旅行统计 + 个人地图点亮（数据更大也更真实）。
- 旧页面删除：`git rm -r web/legacy`（9 文件）；server.js 删除 serveLegacy/LEGACY_DIR 与 /legacy 路由（保留旧地址 302 重定向）。
- 限流：`config.json server.rate_limit`（10 分钟窗口 / 30 次聊天），server.js `rateCheck(ip)` 滑动窗口 + 定时清理，超限 429。
- 单元测试：`node --test test/unit/`（node:test 内置，4 文件 26 项：auth 7 / profile 5 / stats 6 / memory-plan 8，全部通过；TUYI_DATA_DIR 临时目录隔离）。
- ESLint：`web/eslint.config.js`（flat config：eslint@9 + typescript-eslint + react-hooks），`npm run lint` 0 错 0 警（清理了 TravelPage 的 any 等）。
- 拆包：vite manualChunks（react/antd/echarts/markdown 四组），首屏脚本 2.1MB → 44KB + 四个 vendor 分包，chunkSizeWarningLimit 1200。
- 数据迁移基建：记忆文件 `schemaVersion=2`（旧文件加载时补齐落盘）、资料文件 `schemaVersion=1`（写盘时补）。
- 文档地图：`docs/index.md` + check.js 新增 [4/4] 文档地图完整性校验；check.js 跳过 dist、按错误信息放行 ESM 文件。
- 发布脚本：`scripts/release.ps1`（幂等补推：每远端 ls-remote 对比、只推不一致的 master/tag、3 次重试、wincred 凭据、-DryRun 预览）。

### v3.5.0（2026-11-11，微调包 1：体验修复）
- ④消息乱序修复：assistant 气泡创建时即带 ts（原只在 user 消息带），timeline 排序恢复严格交替；输入法组合态回车不再误发。
- ①②③小忆形象：悬浮卡移到右上角（top 96px / right 24px）、背景改聊天页同色去边框阴影（视觉融合）、忙碌时固定一个动作不轮换、闲时 30 秒一换。
- ⑤状态可回退：STATUS_FLOW 改全连通（任一状态可切到其余三态）；update_plan_status 工具 enum 加 draft；PlanCard 加「回退状态」Modal（单选目标状态，改回草稿不再计入足迹）；persona 生命周期节同步。
- ⑤previousDays 修复：连续修改只把「旧 days 中日期不在新 days 里」的天归档，与已有归档按日期去重合并（不再整份误塞）。
- ⑤删除联动：删除行程（仅草稿可删）后小忆自动补一条记事「用户删除了行程方案「title」」。
- ⑨免责声明：行程卡底部「金额与时间仅为估算，仅作参考」。
- ⑫行程名：生成兜底名改「目的地之旅 · 当天日期」；新增 PUT /api/plans/:id（renameItinerary，1~60 字）与卡片「改名」Modal。
- 测试：smoke 32/32、unit 25/25（新增回退允许/previousDays diff/改名用例）、lint 0 错、build ✓。

## §11 实施记录（续）

**v3.6.0 记忆治理**
- 标签黑名单：brain/meta-tags.js（精确词 15 + 包含词 15，cleanTags 去元操作/去重/截断）；抽取（brain/memory.js addFacts）、编辑（memory-edit 工具）、消化（digest.py）、图表聚合（brain/stats.js）四处全链路过滤；存量数据用 scripts/clean-meta-tags.js 一键清洗（--dry-run 预览、--apply 先备份），本次实测清洗 1 个「记忆修改」脏标签。
- 冲突检测与整理建议：digest.py 消化输出新增 merges（合并建议，ids+suggestion）与 conflicts（冲突对 aId/bId）；写入 record.memoryReview（pending/none）。
- 主动汇报：renderBlock 注入【待处理的记忆整理建议】；persona.md 新增「记忆整理」节（口语征询、用户确认后才动手、绝不擅自改、同一批最多提一次、用户没兴趣就 dismiss）。
- 用户确认后执行：新工具 handle_memory_review（apply_merge/keep_first/keep_second/dismiss）；memory.js 新增 getPendingReview/applyMemoryReview。
- 80 条上限：config.json memory.review_trigger_count=80，digestDue 增条数触发条件。
- 测试：unit 34/34（新增 memory-review.test.js 9 项）、smoke 35/35（新增 3 项）、check.js 7 工具、digest.py 语法通过。
- 端到端实测（真实 LLM 一轮）：test1 的两条重复微辣记忆 → 小忆主动问「合并吗？」→ 用户回「合并吧」→ 工具执行 → 两条变一条、review 清零。

### v3.7.0 账号个性化与旅行相册（2026-11-11）
- 删除用户名注册：auth.createUser 用户名分支返回「用户名注册已停用，请使用邮箱或手机号注册（老账号仍可登录）」；注册页只剩邮箱/手机两个页签。
- 改用户名：auth.updateUsername（2~20 字符、查重忽略大小写且排除自己）；PUT /api/account。
- 头像：brain/account.js saveAvatar（data:image base64 ≤2MB、按扩展名存 data/avatars/、换扩展名删旧文件）；前端 antd-img-crop 圆形裁剪（P9B）；/avatars/<userId>.<ext> 需登录且只能访问自己。
- 旅行相册：brain/album.js（data/album/<userId>.json + data/photos/，≤200 张、单张 ≤3MB、备注 ≤60 字；上传可关联行程、改备注、删除；删行程只解除关联不删照片）；新增「相册」页。
- 测试：unit 43/43（auth 改用户名、account 3 项、album 5 项）、smoke 35/35（3 个账号用例改邮箱注册）、check.js、lint、build 全过。
- 浏览器实测：注册页两页签；test1 换头像（裁剪弹窗→确定→头部与个人卡片同步更新）；改用户名 小忆测试→改回 test1；相册上传→归类到「北京七天六晚」→备注→删除全链路通过。
