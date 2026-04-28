# Bench AI Model Platform

一个本地可运行的模型评测平台，聚焦账号管理、模型上传、模型测试、模型排名、排行榜和全站公告。

## 启动

首次启动或数据库结构变化时执行：

```bash
pnpm install
pnpm db:setup
```

日常重启只需要启动服务，不要把初始化当成重启命令：

```bash
pnpm dev
```

另开一个终端启动评测 Worker：

```bash
pnpm worker
```

默认地址：`http://localhost:3000`

## 初始账号

- 超级管理员：`superadmin` / `superadmin123`
- 示例用户：`user1` / `user1`、`user2` / `user2`、`user3` / `user3`

## 功能概览

- `SUPER_ADMIN`：可管理管理员、普通用户、公告、模型测试、模型排名和积分排行榜。
- `ADMIN`：可管理普通用户、公告、模型测试、模型排名和积分排行榜，不能管理管理员账号。
- `USER`：可访问仪表盘、排行榜、我的模型和账号设置。
- 模型排名完成后会在 `uploads/model-rankings/<batchId>/leaderboard-snapshot.json` 生成本地快照。

## 模型约定

- 每个普通用户仅保留一个当前模型，目录名固定为当前账号。
- 同一用户重复上传模型会覆盖自己的当前模型，不影响其他用户。
- 上传文件必须为不超过 5GB 的 `.zip`，压缩包内需要包含 `main.py`，或者单一根目录下的 `main.py`。
- 平台通过 `python3 main.py "问题文本"` 启动模型，模型需要把非空回答打印到 `stdout`。
- 平台测试题库默认来自 `data/model-benchmark/questions.json`。
- 用户侧“快速测试”会用固定问题“简单介绍一下自己”直接验证模型是否可运行。
- 详细提交格式、`main.py` 输入输出、评测流程和积分规则见 [`docs/model-submission-and-ranking.md`](docs/model-submission-and-ranking.md)。

## 排名说明

- 后台“模型测试”会对所有启用模型创建异步测试批次。
- 后台“模型排名”会按 `data/model-benchmark/questions.json` 中的题目逐题执行，并由裁判模型生成质量排名报告。
- 用户侧 `/leaderboard` 会展示次榜与总榜，并支持前端排序。
