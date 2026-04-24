import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

const demoTemplate = `import argparse
import csv
import json

parser = argparse.ArgumentParser()
parser.add_argument("--data-dir", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()

features_path = args.data_dir + "/features.json"
with open(features_path) as src:
    rows = json.load(src)["features"]

with open(args.output, "w", newline="") as dst:
    writer = csv.writer(dst)
    writer.writerow(["id", "prediction"])
    for row in rows:
        score = 1.7 * float(row["x1"]) - 1.1 * float(row["x2"]) + 0.55 * int(row["x3"]) + 2.2 * float(row["x4"])
        writer.writerow([row["id"], 1 if score > 1.8 else 0])
`;

async function main() {
  const password = "superadmin123";
  const passwordHash = await bcrypt.hash(password, 10);
  const cls = await prisma.class.upsert({ where: { name: "默认班级" }, update: {}, create: { name: "默认班级", description: "示例班级" } });
  const admin = await prisma.user.upsert({ where: { username: "superadmin" }, update: { role: "SUPER_ADMIN", enabled: true }, create: { username: "superadmin", nickname: "超级管理员", passwordHash, role: "SUPER_ADMIN" } });
  const user = await prisma.user.upsert({ where: { username: "student" }, update: { classId: cls.id }, create: { username: "student", nickname: "示例学生", passwordHash: await bcrypt.hash("student123", 10), role: "USER", classId: cls.id } });
  const competition = await prisma.competition.create({ data: { title: "示例大规模 JSON 二分类打榜赛", description: "隐藏测试集包含 5000 条 JSON 特征记录。读取 features.json，生成 id,prediction CSV，平台使用内部 answers.json 计算 Accuracy。", metric: "accuracy", hiddenTestDataDir: resolve("data/demo-competition/test"), answerCsvPath: resolve("data/demo-competition/answers.json"), codeTemplate: demoTemplate, runtimeLimitMs: 10000, assignments: { create: { classId: cls.id } } } });
  await prisma.announcement.create({ data: { title: "欢迎使用 Bench AI 打榜平台", body: "请进入比赛页提交 Python 代码并查看实时排行榜。", classId: cls.id } });
  console.log(`Seed complete. SUPER_ADMIN: ${admin.username} / ${password}`);
  console.log(`Demo USER: ${user.username} / student123`);
  console.log(`Demo competition: ${competition.title}`);
}

main().finally(() => prisma.$disconnect());
