# 开发规范（途忆）

> 2026-11-04 创建。改代码前先读这里；和 Momo 的 docs/development.md 同一套思路。

## 一、提交规范

commit message 用「类型: 说明」格式：

| 类型 | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 文档 |
| `chore` | 杂项 / 工程 |
| `refactor` | 重构（不改行为） |

## 二、版本纪律（和 Momo 一致）

每完成一个版本 = 一个提交 + 一个 tag：

1. `node check.js` + `node test/smoke.js` 全绿；
2. `git add -A` → `git commit -m "feat: 版本说明"`；
3. `git tag vX.Y.Z`；
4. 双远端推送：`git push gitee master && git push gitee vX.Y.Z`，`git push github master && git push github vX.Y.Z`。

版本号规划：`v0.1.0` 骨架 → `v0.2.0` 行程生成 → `v0.3.0` 记忆消化 → `v0.4.0` 数据看板 → `v1.0.0` 答辩版。

## 三、测试纪律

- 每次提交前跑 `node check.js`（语法 + 配置 + 工具注册）；
- 冒烟测试 `node test/smoke.js`（不联网）；
- 改了模型 / 高德相关代码后，跑一次联网联调 `node test/live.js`（需要 .env 和网络，会真实调用 DeepSeek 与高德）。

## 四、密钥红线

- 真实 Key 只放 `.env`（已 gitignore，不进版本库）；`.env.example` 只放空值；
- 本地已装 pre-commit 钩子：提交时自动拦截 `.env` / `.env.*` / `data/` 与 `sk-` 样式串，并顺带跑 check.js；
- 换机器 / 重新 clone 后钩子需要重装（`.git/hooks/pre-commit` 不进版本库）。

## 五、目录约定

- `brain/` 只放与界面无关的智能体逻辑（模型客户端、主循环、工具注册、提示词）；
- `tools/` 一个文件一个工具，文件名不以 `_` 开头；`_` 开头的是共享库（如 `_amap.js`）；
- `web/` 是纯静态页面，不引入构建工具；
- `docs/` 放设计文档（`plan.md` 是方案定稿）。

## 六、复用说明

骨架移植自 Momo（`E:\Learn\Momo`）的「大脑」：Agent 主循环、工具注册、分层记忆、流式调用。已去掉 QQ / 桌宠接入层，前端换成 Web。
