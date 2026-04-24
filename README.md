# Bench AI Leaderboard

一个本地可运行的 Kaggle 风格 AI 打榜平台。平台支持账号角色、班级内比赛、公告、代码提交队列、独立 Worker 运行参赛代码、隐藏测试集评分和实时排行榜。

## 启动

```bash
pnpm install
pnpm db:setup
pnpm dev
```

另开一个终端启动评测进程：

```bash
pnpm worker
```

默认地址：`http://localhost:3000`

## 初始账号

- 超级管理员：`superadmin` / `superadmin123`
- 示例学生：`student` / `student123`

## 功能

- `SUPER_ADMIN`：可管理管理员、普通用户、班级、比赛、公告、提交和统计。
- `ADMIN`：可管理普通用户、班级、比赛、公告、提交和统计，不能管理管理员账号。
- `USER`：只能访问自己班级分配的比赛、公告、提交和账号设置。

## 比赛说明

管理员创建比赛时配置：

- 隐藏测试集目录：传给用户代码的 `--data-dir`。
- 答案文件路径：仅 Worker 内部读取，支持 CSV `id,label` 或 JSON `{ "answers": [{ "id": "1", "label": "0" }] }`。
- 评分指标：`accuracy`、`macro_f1`、`rmse`、`mae`。
- 运行限制：超过时间会标记为 `TIME_LIMIT_EXCEEDED`。

学生提交单个 Python 文件。Worker 会运行：

```bash
python3 main.py --data-dir <hiddenTestDir> --output <predictionCsvPath>
```

参赛代码可以读取隐藏测试目录内的数据文件；示例比赛使用 `features.json`。参赛代码必须写出预测 CSV，格式为：

```csv
id,prediction
1,cat
2,dog
```

示例比赛内置 5000 条 JSON 测试记录，路径为 `data/demo-competition/test/features.json`，答案保存在平台内部 `data/demo-competition/answers.json`。

排行榜按每个用户在每场比赛的历史最佳提交展示。第一版仅提供基础安全限制，不适合运行不可信恶意代码。
