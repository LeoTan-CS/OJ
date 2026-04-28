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
- 平台会在 Singularity 禁网沙箱中通过 `python3 /workspace/<main.py> "问题文本"` 启动模型，模型需要把非空回答打印到 `stdout`。
- 部署环境需要提前准备包含 `python3`、CUDA/PyTorch、Transformers 等依赖的 `.sif` 镜像，并通过 `MODEL_SINGULARITY_IMAGE` 指定绝对路径。
- 用户模型运行时使用 `--containall --cleanenv --no-home --net --network none`，模型包只读挂载到 `/workspace`，每次运行仅提供独立 `/tmp` 可写目录。
- 推荐通过 `pnpm runtime:pull` 一次性拉取 Hugging Face GPU 镜像并生成本地 SIF。
- 平台测试题库默认来自 `data/model-benchmark/questions.json`。
- 用户侧“快速测试”会用固定问题“简单介绍一下自己”直接验证模型是否可运行。
- 详细提交格式、`main.py` 输入输出、评测流程和积分规则见 [`docs/model-submission-and-ranking.md`](docs/model-submission-and-ranking.md)。

## Singularity 运行环境

AutoDL 部署或更新运行环境时执行一次：

```bash
pnpm runtime:pull
```

脚本默认拉取 `huggingface/transformers-pytorch-gpu:latest` 并保存为本地 `runtime/model-eval.sif`。后续快速测试、模型排名只读取这个 `.sif`，不会再次拉镜像。只有你想更新运行环境时才需要重新执行 `pnpm runtime:pull`。

如果 `runtime/model-eval.sif` 已存在，脚本会跳过下载并只做验证；需要强制更新时执行 `MODEL_RUNTIME_FORCE_PULL=1 pnpm runtime:pull`。

脚本会验证 `torch`、`transformers`、`accelerate`、`datasets`、`safetensors`、`tokenizers` 等库。想换成更完整但更大的 Hugging Face deepspeed 镜像时可以执行：

```bash
MODEL_RUNTIME_DOCKER_IMAGE=huggingface/transformers-pytorch-deepspeed-latest-gpu:latest pnpm runtime:pull
```

然后在 `.env` 中配置：

```bash
MODEL_SINGULARITY_IMAGE=/root/OJ/runtime/model-eval.sif
MODEL_SINGULARITY_COMMAND=singularity
MODEL_SINGULARITY_SCRATCH_ROOT=/tmp
MODEL_SINGULARITY_ENABLE_NV=1
```

如需把本地模型缓存只读挂进沙箱，可追加：

```bash
MODEL_SINGULARITY_READONLY_BINDS=/root/.cache/huggingface:/models/hf_cache
```

验证镜像：

```bash
singularity exec --nv --net --network none runtime/model-eval.sif python3 -c "import torch, transformers; print(torch.cuda.is_available(), transformers.__version__)"
```

用户上传模型代码全程禁网；裁判模型调用仍使用 `JUDGE_API_*` 环境变量，建议指向本机 OpenAI-compatible 或 Ollama 服务。

## 排名说明

- 后台“模型测试”会对所有启用模型创建异步测试批次。
- 后台“模型排名”会按 `data/model-benchmark/questions.json` 中的题目逐题执行，并由裁判模型生成质量排名报告。
- 用户侧 `/leaderboard` 会展示次榜与总榜，并支持前端排序。
