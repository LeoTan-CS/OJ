import bcrypt from "bcryptjs";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { parseUsersXlsx } from "@/lib/xlsx-users";
import { publicUserWithGroupSelect } from "@/lib/user-select";
import { userSchema } from "@/lib/validators";

const groupNamePattern = /^[A-Za-z0-9_.-]+$/;
const usernamePattern = /^[A-Za-z0-9_.-]+$/;

async function resolveUserGroupId(role: "SUPER_ADMIN" | "ADMIN" | "USER", groupId: string | undefined) {
  if (role !== "USER") return null;
  if (!groupId) return null;
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Response(JSON.stringify({ error: "小组不存在" }), { status: 400 });
  return group.id;
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return json({ users: await prisma.user.findMany({ select: publicUserWithGroupSelect, orderBy: { createdAt: "desc" } }) });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireAdmin();
    const body = await parseJson(request, userSchema);
    if (!canManageRole(actor.role, body.role)) return error("Forbidden", 403);
    if (!body.password) return error("Password is required", 400);
    const groupId = await resolveUserGroupId(body.role, body.groupId);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        nickname: body.username,
        role: body.role,
        groupId,
        enabled: true,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      select: publicUserWithGroupSelect,
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
    const groupNames = new Set<string>();
    for (const row of rows) {
      if (!canManageRole(actor.role, row.role)) return error(`第 ${row.rowNumber} 行无权创建 ${row.role}`, 403);
      if (!usernamePattern.test(row.username)) return error(`第 ${row.rowNumber} 行用户名只能包含字母、数字、下划线、点和连字符`, 400);
      if (usernames.has(row.username)) return error(`Excel 中用户名重复：${row.username}`, 400);
      usernames.add(row.username);
      if (row.groupName) {
        if (!groupNamePattern.test(row.groupName)) return error(`第 ${row.rowNumber} 行小组名只能包含字母、数字、下划线、点和连字符`, 400);
        groupNames.add(row.groupName);
      }
    }

    const [existingUsers, groups] = await Promise.all([
      prisma.user.findMany({ where: { username: { in: Array.from(usernames) } }, select: { username: true } }),
      prisma.group.findMany({ where: { name: { in: Array.from(groupNames) } }, select: { id: true, name: true } }),
    ]);
    if (existingUsers.length) return error(`用户名已存在：${existingUsers.map((user) => user.username).join("、")}`, 400);
    const groupByName = new Map(groups.map((group) => [group.name, group] as const));
    for (const row of rows) {
      if (row.role === "USER" && row.groupName && !groupByName.has(row.groupName)) return error(`第 ${row.rowNumber} 行小组不存在：${row.groupName}`, 400);
    }

    await prisma.user.createMany({
      data: await Promise.all(rows.map(async (row) => ({
        username: row.username,
        nickname: row.username,
        passwordHash: await bcrypt.hash(row.password, 10),
        role: row.role,
        groupId: row.role === "USER" && row.groupName ? groupByName.get(row.groupName)!.id : null,
        enabled: true,
      }))),
    });
    return json({ created: rows.length });
  });
}
