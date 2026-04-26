# 《智能计算系统》大作业模型提交与评测说明

本文档面向参加大作业的同学、助教和管理员，说明模型压缩包的提交格式、`main.py` 的输入输出约定、系统评测流程以及排行榜积分规则。

## 1. 总体规则

评测系统不会直接理解模型内部结构，只会做一件事：解压同学上传的 `.zip` 文件，找到其中唯一的 `main.py`，然后用 `python3` 启动它并读取回答结果。

因此，每个提交必须满足：

1. 上传文件必须是 `.zip`。
2. 压缩包内必须有一个可唯一识别的 `main.py`。
3. `main.py` 必须能在评测机上通过 `python3 main.py ...` 运行。
4. `main.py` 必须按本文档约定读取题目并输出答案。
5. 每道题最长运行时间默认 300 秒，系统也可能通过环境变量下调该限制，但不会超过 300 秒。
6. 同学只需要上传模型压缩包，不需要上传题目文件或答案文件。系统会读取题库后把每道题作为命令行参数传给 `main.py`，并在平台内部汇总结果。
7. 系统不会自动执行 `pip install`、下载模型权重或运行初始化脚本。需要的代码、配置和模型文件应随压缩包提交，或提前确认评测环境已经安装对应依赖。

## 2. 上传包结构

系统支持两种压缩包结构。

推荐结构：

```text
model.zip
├── main.py
├── model/
│   └── ...
├── src/
│   └── ...
└── config.json
```

也支持单一根目录结构：

```text
model.zip
└── my_model/
    ├── main.py
    ├── model/
    │   └── ...
    └── src/
        └── ...
```

不要提交以下结构：

```text
model.zip
├── version_a/main.py
└── version_b/main.py
```

原因是系统无法判断应该执行哪个 `main.py`。压缩包中也不能包含绝对路径、盘符路径或 `..` 这类不安全路径。

每个普通用户只保留一个当前模型。重复上传会覆盖自己之前的当前模型，不会影响其他同学的模型。模型目录名固定为当前登录用户名。

## 3. main.py 运行环境

系统执行模型时使用：

```bash
python3 <系统解压后的 main.py> "问题文本"
```

系统会把题目文本作为第一个命令行参数传给 `main.py`。模型需要把最终回答打印到标准输出 `stdout`，不需要也不应该读写 `question.json` 或 `answer.json`。

运行时的当前工作目录是 `main.py` 所在目录。因此，`main.py` 中读取相对路径文件时，可以按如下方式写：

```python
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
model_path = BASE_DIR / "model"
```

注意事项：

- 标准输入 `stdin` 不会传题目，不要等待用户在终端输入。
- 标准输出 `stdout` 是正式答案来源，请只打印最终回答。
- 标准错误 `stderr` 可以打印调试日志。系统会保留末尾一部分日志用于排错。
- 脚本退出码必须为 `0`。非 `0` 会被视为运行错误。
- 如果退出码为 `0` 但 `stdout` 为空，会被视为 `INVALID_OUTPUT`。
- 如果脚本超时，系统会终止进程并记录为超时。

## 4. 标准输入格式

模型只需要读取命令行第一个参数：

```python
import sys

question = sys.argv[1] if len(sys.argv) > 1 else ""
```

字段说明：

- `sys.argv[0]`：脚本路径。
- `sys.argv[1]`：系统传入的问题字符串。

排名评测时，系统会逐题调用模型。也就是说，正式排名中每次只会向 `main.py` 传入一道题。这样做是为了让某一道题超时或失败时不影响其他题继续评测。

## 5. 标准输出格式

模型把回答文本打印到 `stdout` 即可：

```python
print("梯度下降是一种迭代优化方法，用于沿损失函数负梯度方向更新参数...")
```

输出要求：

- `stdout` 去掉首尾空白后必须是非空字符串。
- 不要把 JSON 对象、调试日志或状态字段当作正式答案输出。
- 调试日志、异常堆栈等信息请写到 `stderr`。
- 系统会记录外部耗时和峰值内存，不需要模型自行输出这些指标。

系统可识别的 `status` 有：

```text
SCORED
TIME_LIMIT_EXCEEDED
RUNTIME_ERROR
INVALID_OUTPUT
```

这些状态由系统根据进程退出码、超时和 `stdout` 内容自动记录，同学不需要手动输出状态。

## 6. main.py 示例

下面是一个最小可用示例。真实提交时，把 `generate_answer` 替换成自己的模型推理逻辑即可。

```python
import sys


def generate_answer(question: str) -> str:
    # TODO: 在这里加载并调用你的模型。
    return f"这是对问题“{question}”的示例回答。"


def main() -> None:
    question = sys.argv[1] if len(sys.argv) > 1 else ""
    answer = generate_answer(question)
    print(answer)


if __name__ == "__main__":
    main()
```

本地自测时，直接传入问题字符串：

```bash
python3 main.py "简单介绍一下自己"
```

终端应该打印一段非空回答。

## 7. 系统内部题库与结果

默认排名题库位于：

```text
data/model-benchmark/questions.json
```

当前格式示例：

```json
{
  "questions": [
    {
      "id": "gradient-descent",
      "question": "什么是梯度下降"
    },
    {
      "id": "classification-vs-regression",
      "question": "分类问题和回归问题有什么相同和不同点"
    }
  ]
}
```

管理员可以在发起排名前维护该文件。发起排名后，系统会把当时的题库快照写入该批次目录，后续修改题库不会改变已经创建的批次。

模型不需要读取这个题库文件。系统会负责读取题库、逐题调用 `main.py`、把各模型的字符串回答组装为内部 `answers.json` 和 `judge-input.json`。

旧接口已经不再支持。以下命令不会作为正式评测接口使用：

```bash
python3 main.py --input question.json --output answer.json
```

## 8. 快速测试与正式排名

系统中有两类运行。

快速测试：

- 用户侧“快速测试”使用固定问题“简单介绍一下自己”。
- 管理员侧模型连通性测试使用固定问题“介绍一下你自己”。
- 目的只是检查模型是否能启动、是否能接收问题字符串并输出回答。
- 快速测试通过不代表正式排名一定高分。

正式排名：

- 管理员在后台创建“模型排名”批次。
- 系统读取 `data/model-benchmark/questions.json`。
- 系统对所有已启用模型逐题运行 `main.py`。
- 每个模型每道题都会生成一个题目级结果。
- 所有模型完成某道题后，裁判模型会对该题答案进行质量排序。
- 全部题目完成后，系统生成排行榜快照。

运行产物主要保存在：

```text
uploads/models/<用户名>/runs/<批次ID>/answers.json
uploads/model-rankings/<批次ID>/question.json
uploads/model-rankings/<批次ID>/judge-input.json
uploads/model-rankings/<批次ID>/leaderboard-snapshot.json
```

## 9. 排名与积分规则

排行榜由三部分组成：回答质量、运行时间、峰值内存。

权重：

```text
总分 = 质量分 * 0.8 + 时间分 * 0.1 + 内存分 * 0.1
```

质量分：

- 每道题由裁判模型根据答案质量排序。
- 评价维度包括准确性、完整性、结构清晰度、事实可靠性和中文表达质量。
- 第 1 到第 8 名分别得到 `10, 7, 6, 5, 4, 3, 2, 1` 分。
- 第 8 名之后质量分为 `0`。
- 只要模型对某题产生了非空回答文本，即使状态不是 `SCORED`，裁判模型也会基于已有文本参与质量排序。
- 完全没有可评估输出的模型不参与该题质量排序。

时间分：

- 只统计状态为 `SCORED` 且有耗时记录的结果。
- 每道题按耗时从短到长排名。
- 第 1 到第 5 名分别得到 `5, 4, 3, 2, 1` 分。
- 第 5 名之后时间分为 `0`。

内存分：

- 只统计状态为 `SCORED` 且有峰值内存记录的结果。
- 每道题按峰值内存从小到大排名。
- 第 1 到第 5 名分别得到 `5, 4, 3, 2, 1` 分。
- 第 5 名之后内存分为 `0`。

批次榜：

- 对一个排名批次内的所有题目分别计分。
- 每个模型的质量分、时间分、内存分会按题目取平均。
- 批次总分按上面的权重公式计算。

总榜：

- 总榜汇总多个已完成排名批次。
- 模型在多个批次中的得分会累计展示。

同分处理：

- 时间和内存排名中，如果数值完全相同，会获得相同名次。
- 排序展示时，总分优先，其次依次比较质量、时间、内存等指标。

## 10. 状态说明

常见状态含义如下：

```text
PENDING              等待运行
RUNNING              正在运行
SCORED               成功产生可评分输出
PARTIAL              多题评测中只有部分题成功
TIME_LIMIT_EXCEEDED  超过时间限制
RUNTIME_ERROR        Python 进程非 0 退出或启动失败
INVALID_OUTPUT       stdout 为空或没有产生可识别回答
COMPLETED            批次完成
FAILED               裁判或批次流程失败
```

同学最常见的问题是 `INVALID_OUTPUT`，通常由以下原因导致：

- 没有向 `stdout` 打印回答，只把答案写到了文件。
- `stdout` 去掉首尾空白后为空字符串。
- 脚本等待 `stdin` 输入，导致超时。
- 本地依赖没有在评测机安装。

## 11. 管理员操作说明

首次部署或数据库结构变化时：

```bash
pnpm install
pnpm db:setup
```

日常启动 Web 服务：

```bash
pnpm dev
```

另开终端启动评测 Worker：

```bash
pnpm worker
```

正式排名依赖裁判模型，需要在 `.env` 中配置：

```bash
JUDGE_API_BASE_URL=...
JUDGE_API_KEY=...
JUDGE_MODEL=...
```

可选配置：

```bash
MODEL_TEST_TIMEOUT_MS=300000
```

`MODEL_TEST_TIMEOUT_MS` 单位为毫秒，系统会把它和 300000 取较小值，因此最大不会超过 300 秒。

管理员发起排名前建议检查：

1. Web 服务和 Worker 都已启动。
2. `.env` 中裁判模型配置完整。
3. `data/model-benchmark/questions.json` 是本次要使用的题库。
4. 需要参赛的模型处于“已启用”状态。
5. 管理员侧连通性测试中，模型至少能正常返回一段答案。

## 12. 提交前检查清单

同学上传前建议逐项确认：

- `.zip` 文件中能找到唯一的 `main.py`。
- `main.py` 从 `sys.argv[1]` 读取问题字符串。
- 本地运行 `python3 main.py "简单介绍一下自己"` 成功。
- 终端输出是一段非空回答。
- 最终 `.zip` 不需要包含题目文件或答案文件。
- 推理不会等待人工输入。
- 推理时间控制在每题 300 秒以内。
- 模型文件、配置文件、词表文件等都已包含在压缩包中。
- 没有把本地绝对路径写死在代码里。
- 没有依赖评测机无法访问的网络下载。

## 13. 推荐实践

- 优先实现当前字符串接口：读取 `sys.argv[1]`，打印最终回答到 `stdout`。
- 在 `main.py` 开头集中加载模型，避免每个函数重复加载。
- 使用 `Path(__file__).resolve().parent` 管理相对路径。
- 回答内容保持完整、清晰、直接，不要把调试日志混入 `stdout`。
- 调试日志写到 `stderr`，正式答案写到 `stdout`。
- 控制输出长度，避免生成大量无关文本影响裁判质量判断。
