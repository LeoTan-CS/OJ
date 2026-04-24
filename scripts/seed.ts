import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = "superadmin123";
  const passwordHash = await bcrypt.hash(password, 10);
  const cls = await prisma.class.upsert({
    where: { name: "默认班级" },
    update: {},
    create: { name: "默认班级", description: "示例班级" },
  });
  const admin = await prisma.user.upsert({
    where: { username: "superadmin" },
    update: { role: "SUPER_ADMIN", enabled: true },
    create: { username: "superadmin", nickname: "超级管理员", passwordHash, role: "SUPER_ADMIN" },
  });
  const user = await prisma.user.upsert({
    where: { username: "student" },
    update: { classId: cls.id },
    create: { username: "student", nickname: "示例学生", passwordHash: await bcrypt.hash("student123", 10), role: "USER", classId: cls.id },
  });
  const problem = await prisma.problem.create({
    data: {
      title: "两数之和",
      description: "实现函数 add(a, b)，返回两个整数之和。",
      functionName: "add",
      functionSig: "def add(a: int, b: int) -> int:",
      codeTemplate: "def add(a: int, b: int) -> int:\n    return a + b\n",
      difficulty: "Easy",
      testCases: { create: [
        { args: "[1,2]", expected: "3", isSample: true, sortOrder: 1 },
        { args: "[-1,5]", expected: "4", isSample: false, sortOrder: 2 },
      ] },
      assignments: { create: { classId: cls.id } },
    },
  });
  await prisma.announcement.create({ data: { title: "欢迎使用 Bench OJ", body: "请从题目列表开始练习。", classId: cls.id } });
  console.log(`Seed complete. SUPER_ADMIN: ${admin.username} / ${password}`);
  console.log(`Demo USER: ${user.username} / student123`);
  console.log(`Demo problem: ${problem.title}`);
}

main().finally(() => prisma.$disconnect());
