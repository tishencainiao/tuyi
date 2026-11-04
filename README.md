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
│   └── prompts/         #   提示词（persona.md 人设）
├── tools/               # 工具实现（plan_trip 校验、高德 POI、天气）
├── py/                  # Python：记忆消化（digest.py，里程碑 3 起）
├── web/                 # 前端三页
├── test/                # 测试（冒烟 + 联网联调）
├── scripts/             # 辅助脚本（seed-demo.js 生成演示数据）
├── docs/                # 设计文档（plan.md / development.md）
└── data/                # 运行时数据（记忆 / 会话，git 忽略）
```

## 快速开始

```bash
# 1. 配置密钥
copy .env.example .env    # 然后填写 DEEPSEEK_API_KEY（必需）、AMAP_KEY（可选）

# 2. 启动
node server.js            # 打开 http://127.0.0.1:8787

# 3. 自检与测试
node check.js             # 语法 + 配置 + 工具注册
node test/smoke.js        # 冒烟测试（不联网）
node test/live.js         # 手动联网联调（需 Key + 网络，会真实调用 DeepSeek 和高德）
python py/digest.py --user <用户ID> --force   # 手动触发一次记忆消化
node scripts/seed-demo.js                     # 生成演示数据（看板 / 个人中心用）
```

## 里程碑

1. **骨架跑通**（已完成）：流式聊天 + 行程工具 + 三页占位。
2. **行程生成**（已完成）：高德 POI / 天气接入，行程卡片接真实数据。
3. **个性化记忆**（已完成）：分层记忆 + 记忆消化（Python 轻量版）。
4. **数据看板**（已完成）：偏好统计（标签 / 目的地 / 预算 / 意图）+ 个人中心（画像 / 记忆 / 行程）。
5. **收尾**：测试、演示数据、论文素材（架构图 / 提示词设计 / 消融实验）。

## 复用说明

骨架由 Momo（`E:\Learn\Momo`）的「大脑」改造而来：Agent 主循环、插件式工具、分层记忆、流式调用。已去掉 QQ / 桌宠接入层，前端换成 Web。复用清单见 `E:\Learn\Momo\docs\graduation-project-reuse.md`。

## 许可证

MIT © 2026 tishencainiao。详见 [LICENSE](LICENSE)。
