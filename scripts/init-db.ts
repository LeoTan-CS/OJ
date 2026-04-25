import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type TableColumn = { name: string };
type IdRow = { id: string };
type CountRow = { count: number };
type ModelBackfillRow = {
  id: string;
  userId: string;
  groupId: string;
  originalFilename: string;
  archivePath: string;
  packageDir: string;
  entrypointPath: string;
  createdAt: string | number | Date;
};

const legacyGroupUserMappings = [
  { groupName: "group1", username: "user1", password: "user1" },
  { groupName: "group2", username: "user2", password: "user2" },
  { groupName: "group3", username: "user3", password: "user3" },
] as const;

async function columnExists(table: string, column: string) {
  const columns = await prisma.$queryRawUnsafe<TableColumn[]>(`PRAGMA table_info("${table}")`);
  return columns.some((item) => item.name === column);
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
}

async function findId(table: string, column: string, value: string) {
  const rows = await prisma.$queryRawUnsafe<IdRow[]>(`SELECT "id" FROM "${table}" WHERE "${column}" = ? LIMIT 1;`, value);
  return rows[0]?.id ?? null;
}

async function ensureGroup(name: string) {
  const existingId = await findId("Group", "name", name);
  if (existingId) return existingId;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "Group" ("id", "name", "createdAt") VALUES (?, ?, CURRENT_TIMESTAMP);`, id, name);
  return id;
}

async function ensureMappedUser(groupName: string, username: string, password: string) {
  const groupId = await ensureGroup(groupName);
  const passwordHash = await bcrypt.hash(password, 10);
  const legacyUserId = await findId("User", "username", groupName);
  const mappedUserId = await findId("User", "username", username);

  if (legacyUserId && (!mappedUserId || mappedUserId === legacyUserId)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "username" = ?, "nickname" = ?, "passwordHash" = ?, "role" = 'USER', "groupId" = ?, "enabled" = true WHERE "id" = ?;`,
      username,
      username,
      passwordHash,
      groupId,
      legacyUserId,
    );
    return { userId: legacyUserId, groupId };
  }

  if (mappedUserId) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "nickname" = ?, "passwordHash" = ?, "role" = 'USER', "groupId" = ?, "enabled" = true WHERE "id" = ?;`,
      username,
      passwordHash,
      groupId,
      mappedUserId,
    );
    return { userId: mappedUserId, groupId };
  }

  const userId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "username", "passwordHash", "nickname", "role", "groupId", "enabled", "createdAt") VALUES (?, ?, ?, ?, 'USER', ?, true, CURRENT_TIMESTAMP);`,
    userId,
    username,
    passwordHash,
    username,
    groupId,
  );
  return { userId, groupId };
}

async function migrateLegacyGroupUsers() {
  for (const mapping of legacyGroupUserMappings) {
    const { userId, groupId } = await ensureMappedUser(mapping.groupName, mapping.username, mapping.password);
    await prisma.$executeRawUnsafe(
      `UPDATE "ModelArtifact" SET "userId" = ?, "groupId" = ?, "name" = ? WHERE "id" = ?;`,
      userId,
      groupId,
      mapping.groupName,
      mapping.groupName,
    );
  }
}

async function backfillModelUploadRecords() {
  const models = await prisma.$queryRawUnsafe<ModelBackfillRow[]>(
    `SELECT "id", "userId", "groupId", "originalFilename", "archivePath", "packageDir", "entrypointPath", "createdAt" FROM "ModelArtifact" WHERE "groupId" IS NOT NULL;`,
  );
  for (const model of models) {
    const existing = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS "count" FROM "ModelUploadRecord" WHERE "modelId" = ? AND "groupId" = ? AND "userId" = ? AND "uploadedAt" = ?;`,
      model.id,
      model.groupId,
      model.userId,
      model.createdAt,
    );
    if ((existing[0]?.count ?? 0) > 0) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelUploadRecord" ("id", "modelId", "groupId", "userId", "originalFilename", "archivePath", "packageDir", "entrypointPath", "uploadedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      randomUUID(),
      model.id,
      model.groupId,
      model.userId,
      model.originalFilename,
      model.archivePath,
      model.packageDir,
      model.entrypointPath,
      model.createdAt,
    );
  }
}

async function main() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Group" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "nickname" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'USER', "groupId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Announcement" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelArtifact" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "groupId" TEXT, "name" TEXT NOT NULL, "originalFilename" TEXT NOT NULL, "archivePath" TEXT NOT NULL, "packageDir" TEXT NOT NULL, "entrypointPath" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModelArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ModelArtifact_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelUploadRecord" ("id" TEXT NOT NULL PRIMARY KEY, "modelId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "userId" TEXT NOT NULL, "originalFilename" TEXT NOT NULL, "archivePath" TEXT NOT NULL, "packageDir" TEXT NOT NULL, "entrypointPath" TEXT NOT NULL, "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModelUploadRecord_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ModelUploadRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ModelUploadRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelTestBatch" ("id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL DEFAULT 'TEST', "status" TEXT NOT NULL DEFAULT 'PENDING', "question" TEXT, "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, "judgeStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED', "judgeInputPath" TEXT, "judgeRawResponse" TEXT, "judgeRankingsJson" TEXT, "judgeReport" TEXT, "judgeError" TEXT, "judgeStartedAt" DATETIME, "judgeCompletedAt" DATETIME, CONSTRAINT "ModelTestBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelTestResult" ("id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "modelId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "durationMs" INTEGER, "peakMemoryKb" INTEGER, "outputPath" TEXT, "outputPreview" TEXT, "error" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, CONSTRAINT "ModelTestResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ModelTestBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ModelTestResult_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);

  await addColumnIfMissing("User", "groupId", "TEXT");
  await addColumnIfMissing("ModelArtifact", "groupId", "TEXT");

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Group_name_key" ON "Group"("name");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_groupId_idx" ON "User"("groupId");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ModelArtifact_groupId_key" ON "ModelArtifact"("groupId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUploadRecord_groupId_uploadedAt_idx" ON "ModelUploadRecord"("groupId", "uploadedAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUploadRecord_userId_uploadedAt_idx" ON "ModelUploadRecord"("userId", "uploadedAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUploadRecord_modelId_uploadedAt_idx" ON "ModelUploadRecord"("modelId", "uploadedAt");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ModelTestResult_batchId_modelId_key" ON "ModelTestResult"("batchId", "modelId");`);

  await migrateLegacyGroupUsers();
  await backfillModelUploadRecords();

  console.log("SQLite tables are ready. Existing data was preserved.");
}

main().finally(() => prisma.$disconnect());
