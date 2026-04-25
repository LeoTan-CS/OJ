import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureGroup(name: string) {
  return prisma.group.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function ensureUser(username: string, password: string, role: "SUPER_ADMIN" | "USER", groupName?: string) {
  const group = groupName ? await ensureGroup(groupName) : null;
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return prisma.user.update({
      where: { username },
      data: {
        nickname: username,
        passwordHash,
        role,
        enabled: true,
        groupId: role === "USER" ? group?.id ?? null : null,
      },
    });
  }

  return prisma.user.create({
    data: {
      username,
      nickname: username,
      passwordHash,
      role,
      groupId: role === "USER" ? group?.id ?? null : null,
      enabled: true,
    },
  });
}

async function main() {
  const adminPassword = "superadmin123";
  const demoUsers = [
    { username: "user1", password: "user1", groupName: "group1" },
    { username: "user2", password: "user2", groupName: "group2" },
    { username: "user3", password: "user3", groupName: "group3" },
  ] as const;

  const [admin, ...users] = await Promise.all([
    ensureUser("superadmin", adminPassword, "SUPER_ADMIN"),
    ...demoUsers.map((user) => ensureUser(user.username, user.password, "USER", user.groupName)),
  ]);

  const announcementTitle = "欢迎使用 Bench AI 模型评测平台";
  const announcement = await prisma.announcement.findFirst({ where: { title: announcementTitle } });
  if (!announcement) {
    await prisma.announcement.create({
      data: {
        title: announcementTitle,
        body: "请先上传小组模型压缩包，再执行模型测试和模型排名。排行榜会根据已完成的排名批次自动更新。",
      },
    });
  }

  console.log(`Seed complete. SUPER_ADMIN: ${admin.username} / ${adminPassword}`);
  for (const user of users) console.log(`Demo USER: ${user.username} / ${user.username}`);
}

main().finally(() => prisma.$disconnect());
