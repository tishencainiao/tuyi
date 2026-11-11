# 途忆前端设计系统（v3.0.0）

> 依据：dsh-ui-ux-pro-max 的 AI-Native UI 规范 + 小云朵精灵「活泼、可爱、清新」气质自定配色。
> 本文件是 web/ 前端与后续页面的唯一视觉依据；改样式先改这里。

## 1. 定位与气质

- 产品：个人旅游 AI 助理「小忆」，气质关键词：天空蓝、轻盈、友好、不端着。
- 原则：内容优先、圆角柔和、留白充足；AI 生成内容必须可见其过程（流式/工具步骤），不做「黑盒出结果」。

## 2. 色彩（语义令牌，禁止在组件里硬编码 hex）

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--tuyi-sky` | `#0EA5E9` | 主色：按钮、链接、选中、地图点亮 |
| `--tuyi-sky-deep` | `#0284C7` | 主色 hover/按压 |
| `--tuyi-sky-light` | `#E0F2FE` | 浅蓝底、选中背景 |
| `--tuyi-sun` | `#FB923C` | 点缀：小忆头像描边、重点标签、徽标 |
| `--tuyi-ink` | `#0F172A` | 正文 |
| `--tuyi-sub` | `#64748B` | 次要文字 |
| `--tuyi-bg` | `#F0F9FF` | 页面背景（顶部渐变到白） |
| `--tuyi-line` | `#BAE6FD` | 边框/分割线 |
| `--tuyi-ok` | `#22C55E` | 成功/已确认 |
| `--tuyi-warn` | `#F59E0B` | 草稿/待确认 |
| `--tuyi-danger` | `#EF4444` | 删除/错误 |

AntD 主题令牌映射见 `web/src/theme.ts`（colorPrimary=#0EA5E9、colorTextBase=#0F172A、colorBgLayout=#F0F9FF、colorBorder=#BAE6FD、borderRadius=12）。

## 3. 字体

- 系统字体栈（不引 Google Fonts CDN，保证离线/国内可用）：
  `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- 数字/金额用 tabular 场景由 AntD 默认；标题 600、正文 400。

## 4. 间距 / 圆角 / 阴影

- 间距刻度（4 的倍数）：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64。
- 卡片圆角 12，按钮/输入框跟随 AntD（8），头像正圆。
- 阴影只用两级：卡片 `0 2px 8px rgba(14,165,233,.08)`；悬浮 `0 6px 16px rgba(14,165,233,.14)`。

## 5. 布局

- 顶栏 56px：左 logo+「途忆」，中间导航（聊天 / 我的旅行 / 个人中心），右侧用户菜单。
- 内容区最大宽 1080px 居中，左右 16px 呼吸边。
- 聊天页单列：快捷问（空态）→ 消息流（小忆头像在左，气泡浅蓝底；用户气泡在右，主色底白字）→ 输入区；行程卡片内嵌在消息流中。
- 登录/注册：居中卡片 400px，渐变背景 + 小云朵 logo。

## 6. 组件规范

- 按钮：主操作主色实底；危险操作（删除记忆/行程/退出）用 danger 语义并带二次确认（Popconfirm）。
- 空态：配文案 + 一句下一步引导（例：「还没有行程，去和小忆聊聊吧」+ 跳转按钮）。
- 加载：骨架/Spin 必须出现，不允许白屏干等。
- 错误：统一 `message.error(可读中文)`，不用技术栈报错原文（用户可见错误一律人话）。
- 触控目标 ≥44px；按压反馈由 AntD 自带。

## 7. AI-Native 交互（来自 ui-ux-pro-max 规范）

- 流式输出逐字渲染 + 光标闪烁（`.streaming-cursor`）。
- 工具调用过程可视化：状态条显示「正在查找景点… / 正在查询天气… / 正在生成行程…」，完成打勾。
- AI 内容一律带小忆头像标注，用户内容在右侧；行程卡片带来源说明（生成于何时）。
- 反馈回路：每条 AI 回复与行程卡后续可评价/纠正（v3.1.0+ 落「连续修改」）。
- 前端所有 useEffect 订阅/图表实例必须 cleanup（防内存泄漏与重复渲染）。

## 8. 无障碍与动效底线

- 正文对比度 ≥4.5:1（sky 底白字 4.6:1 达标）。
- 图标不用 emoji；表单控件均有 label 关联。
- 动效克制：消息入场 120ms 淡入；`prefers-reduced-motion` 下关闭非必要动效。
- 移动端（<768px）：顶栏折叠、内容单列、输入区吸底。

## 9. 地图与图表视觉

- 地图点亮色带：`#E0F2FE → #7DD3FC → #0EA5E9`（visualMap），未去过 `#F1F5F9`，边框白。
- 柱状图主色 `#0EA5E9`，标签分类图用 `#FB923C`；图表容器固定高度（柱 280px、地图 420px），resize 自适应。

## 10. 小忆形象

- 现为占位：`web/public/favicon.svg`（小云朵 SVG）。
- 用户从即梦 Dreamina 产出素材后放入 `web/public/xiaoyi/`（logo.svg、avatar.png、work-*.png、rest-*.png），替换占位；头像规范：40px 圆形、`--tuyi-line` 描边。
- 完整提示词见 `docs/v3-plan.md` §10。
