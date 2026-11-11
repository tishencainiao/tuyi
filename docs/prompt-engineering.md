# 提示词工程与防幻觉设计

> 论文第 4 章素材。改提示词前先读这里；每个提示词都对应一个文件，便于版本追溯。

## 一、提示词清单

| 文件 | 用途 | 关键约束 |
|---|---|---|
| `brain/prompts/persona.md` | 「小忆」人设 + 排行程规矩 + 行程生命周期 + 语气红线 + 工具使用规则 | 口语化、先结论、事实点、不确定信息必须标注「以官方/现场为准」 |
| `brain/prompts/memory-extract.md` | 每轮从对话抽取「关于用户的事实」 | 只输出 JSON；只抽用户说的；不超过 4 条；不要寒暄 |
| `py/digest.py` 内 `DIGEST_PROMPT` | 把多条事实反思合成为偏好标签 + 一句话认识 | 只输出 JSON；3~6 个短标签；摘要 ≤60 字 |
| `tools/plan-trip.js` 的 `def.parameters` | 行程 JSON 的 schema 约束（时间 / 地点 / 活动 / 交通 / 花费） | 固定字段名与格式，模型必须按 schema 输出 |
| `tools/memory-edit.js` 的 `def` | 让用户通过对话增 / 改 / 删自己的记忆（`add` / `update` / `remove`） | 只操作当前登录用户的记忆；优先用 id，没有 id 用 `match` 片段；删多条按片段全删 |

## 二、提示词注入结构

```
system =
  persona.md（人设 + 规矩 + 工具使用 + 行程生命周期 + 语气红线）
  + 【用户资料】称呼 / 年龄 / 性别 / 同行人 / 偏好标签 / 旅行风格 / 健康备注（若有，brain/profile.js 生成）
  + 【用户记忆】偏好标签 / 关于用户的认识 / 【行程时间线】第 1 次… · 目的地 · 天数 · 预算（仅已确认行程）/ 相关历史记忆（若有）
user = 本轮用户输入
```

记忆块（由 `brain/memory.js` 生成）只在有内容时注入，并附一句「若与本次说法冲突，以本次说法为准」，避免旧偏好压过新需求。

## 二点五、语气红线（v3.3.0 新增，persona.md）

让对话「像人不像机器」的硬约束：

- **硬禁词 13 组**：作为一个 AI / 人工智能 / 您的 / 希望对你有所帮助 / 我很乐意 / 我会尽力 / 首先…其次…最后 / 总而言之 / 综上所述 / 值得注意的是 / 关于这个问题 / 让我来回答——出现即视为不合格输出；
- **书面腔禁用**：进行 / 获取 / 予以 / 确保 / 相关 / 上述（改成口语：做 / 拿到 / 给 / 保证 / 有关 / 上面说的）；
- **不聊技术细节**：接口 / API / 字段 / 返回 等实现词汇不准出现在面向用户的话里；
- **查不到就直说**：价格等外部数据查不到时统一说「价格我这边查不到，以携程 / 美团实时价为准」，不说「接口没有返回房价」这类机器话（配合 `tools/_amap.js` 对无价格酒店 POI 返回 `price_note` 字段供模型引用）；
- 允许 Markdown 排版（加粗 / 列表 / 代码块），前端用 react-markdown 渲染。

## 三、防幻觉策略（论文重点）

| 层级 | 做法 | 代码位置 |
|---|---|---|
| 数据约束 | 排行程前先查高德 POI / 天气，景点名必须来自查询结果 | `persona.md` + `tools/amap-poi.js` + `tools/amap-weather.js` |
| 结构化约束 | 行程必须落成固定 JSON，校验时间/地点/活动/顺序 | `tools/plan-trip.js` |
| 时序约束 | 注入「第 1 次 / 第 2 次…」行程时间线（仅已确认行程），人设要求序数指代先复述再回答 | `brain/memory.js`（renderBlock）+ `persona.md` |
| 生命周期约束 | 生成=草稿需用户确认；修改必须基于原方案（`get_plan` → `plan_trip(mode:update)`）只重排未进行的天；状态迁移走 `update_plan_status`，非法迁移拒绝 | `brain/memory.js`（STATUS_FLOW）+ `persona.md` |
| 失败降级 | 工具返回 `ok:false` 时明确告诉用户「实时数据没查到」，不硬编 | `persona.md` + 工具返回值 |
| 检索增强 | 历史记忆 / 偏好 / 用户资料注入，减少「忘掉用户」导致的重复与冲突 | `brain/memory.js` + `brain/profile.js` |
| 消融验证 | 有/无记忆消化、有/无工具校验对比 | `scripts/ablation.js` + `docs/ablation.md` |

## 四、可调参数（都放在配置文件里，方便实验）

- `config.json → llm.max_agent_steps`：最多几步工具循环（默认 6）。
- `config.json → llm.temperature`：默认 0.7。
- `config.json → memory.digest_trigger_count`：攒多少条事实触发一次消化（默认 2）。
- `config.json → memory.digest_min_interval_minutes`：两次消化最小间隔（默认 1 分钟）。
- `config.json → memory.max_inject_memories`：每轮最多注入几条历史记忆（默认 5）。

## 五、写作建议（论文 4.x）

1. 先讲「为什么这样设计」：真实数据减少编造 → 结构化减少排错 → 记忆减少重复。
2. 每个约束配一个「反例 / 失败场景」，说明不做会怎样（例如不查 POI 会推荐不存在的店）。
3. 引用 `docs/ablation.md` 的实验设计，说明如何验证有效性。
