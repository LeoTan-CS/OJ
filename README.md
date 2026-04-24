# Bench OJ

一个本地可运行的类 OJ 平台，仅支持 Python 函数调用题。包含用户端、管理端、SQLite 持久化、账号角色、班级分配、公告、提交队列和独立判题 Worker。

## 启动

```bash
pnpm install
pnpm db:setup
pnpm dev
```

如果需要分步执行数据库初始化，可运行 `pnpm prisma generate && pnpm db:init && pnpm seed`。

另开一个终端启动判题进程：

```bash
pnpm worker
```

默认地址：`http://localhost:3000`

## 初始账号

- 超级管理员：`superadmin` / `superadmin123`
- 示例学生：`student` / `student123`

## 功能

- `SUPER_ADMIN`：可管理管理员、普通用户、班级、题目、公告、提交和统计。
- `ADMIN`：可管理普通用户、班级、题目、公告、提交和统计，不能管理管理员账号。
- `USER`：只能访问自己班级分配的题目、公告、提交和账号设置。

## 判题说明

题目定义函数名、函数签名、代码模板和 JSON 测试点。测试点格式：

- `args`: JSON 数组，例如 `[1,2]`
- `expected`: JSON 值，例如 `3`

Worker 会用 `python3` 子进程调用用户函数并比较返回值。第一版仅提供基础安全限制，不适合运行不可信恶意代码。
