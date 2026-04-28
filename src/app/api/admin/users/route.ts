import bcrypt from "bcryptjs";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { parseUsersXlsx } from "@/lib/xlsx-users";
import { publicUserSelect } from "@/lib/user-select";
import { userSchema } from "@/lib/validators";

const usernamePattern = /^[A-Za-z0-9_.-]+$/;

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return json({ users: await prisma.user.findMany({ select: publicUserSelect, orderBy: { createdAt: "desc" } }) });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireAdmin();
    const body = await parseJson(request, userSchema);
    if (!canManageRole(actor.role, body.role)) return error("Forbidden", 403);
    if (!body.password) return error("Password is required", 400);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        role: body.role,
        enabled: true,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      select: publicUserSelect,
    });
    return json({ user });
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const actor = await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("usersFile");
    if (!(file instanceof File) || file.size === 0) return error("请选择 Excel 文件", 400);
    let rows;
    try {
      rows = parseUsersXlsx(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      return error(err instanceof Error ? err.message : "Excel 解析失败", 400);
    }
    if (!rows.length) return error("Excel 中没有账号数据", 400);

    const usernames = new Set<string>();
    for (const row of rows) {
      if (!canManageRole(actor.role, row.role)) return error(`第 ${row.rowNumber} 行无权创建 ${row.role}`, 403);
      if (!usernamePattern.test(row.username)) return error(`第 ${row.rowNumber} 行账号只能包含字母、数字、下划线、点和连字符`, 400);
      if (usernames.has(row.username)) return error(`Excel 中账号重复：${row.username}`, 400);
      usernames.add(row.username);
    }

    const existingUsers = await prisma.user.findMany({ where: { username: { in: Array.from(usernames) } }, select: { username: true } });
    if (existingUsers.length) return error(`账号已存在：${existingUsers.map((user) => user.username).join("、")}`, 400);

    await prisma.user.createMany({
      data: await Promise.all(rows.map(async (row) => ({
        username: row.username,
        passwordHash: await bcrypt.hash(row.password, 10),
        role: row.role,
        enabled: true,
      }))),
    });
    return json({ created: rows.length });
  });
}
