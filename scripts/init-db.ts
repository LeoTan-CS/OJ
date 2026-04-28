import { randomUUID } from "node:crypto";
import { access, rename } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { rewriteModelRankingFiles, type ModelIdentityMapping } from "../src/lib/model-identity";

const prisma = new PrismaClient();

type TableColumn = { name: string };
type IdRow = { id: string };
type CountRow = { count: number };
type ModelBackfillRow = {
  id: string;
  userId: string;
  originalFilename: string;
  archivePath: string;
  packageDir: string;
  entrypointPath: string;
  createdAt: string | number | Date;
};

const legacyGroupUserMappings = [
  { oldUsername: "group1", username: "user1", password: "user1" },
  { oldUsername: "group2", username: "user2", password: "user2" },
  { oldUsername: "group3", username: "user3", password: "user3" },
] as const;

const legacyModelMappings: ModelIdentityMapping[] = legacyGroupUserMappings.map((mapping) => ({
  oldId: mapping.oldUsername,
  newId: mapping.username,
}));

async function columnExists(table: string, column: string) {
  const columns = await prisma.$queryRawUnsafe<TableColumn[]>(`PRAGMA table_info("${table}")`);
  return columns.some((item) => item.name === column);
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
}

async function rebuildCoreTables() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "User_next";`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "ModelArtifact_next";`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "ModelUploadRecord_next";`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE "User_next" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'USER',
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      INSERT OR REPLACE INTO "User_next" ("id", "username", "passwordHash", "role", "enabled", "createdAt")
      SELECT "id", "username", "passwordHash", "role", "enabled", "createdAt" FROM "User";
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE "ModelArtifact_next" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "originalFilename" TEXT NOT NULL,
        "archivePath" TEXT NOT NULL,
        "packageDir" TEXT NOT NULL,
        "entrypointPath" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ModelArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      INSERT OR REPLACE INTO "ModelArtifact_next" ("id", "userId", "name", "originalFilename", "archivePath", "packageDir", "entrypointPath", "enabled", "createdAt")
      SELECT "id", "userId", "name", "originalFilename", "archivePath", "packageDir", "entrypointPath", "enabled", "createdAt" FROM "ModelArtifact";
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE "ModelUploadRecord_next" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "modelId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "originalFilename" TEXT NOT NULL,
        "archivePath" TEXT NOT NULL,
        "packageDir" TEXT NOT NULL,
        "entrypointPath" TEXT NOT NULL,
        "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ModelUploadRecord_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ModelUploadRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      INSERT OR REPLACE INTO "ModelUploadRecord_next" ("id", "modelId", "userId", "originalFilename", "archivePath", "packageDir", "entrypointPath", "uploadedAt")
      SELECT "id", "modelId", "userId", "originalFilename", "archivePath", "packageDir", "entrypointPath", "uploadedAt" FROM "ModelUploadRecord";
    `);

    await prisma.$executeRawUnsafe(`DROP TABLE "ModelUploadRecord";`);
    await prisma.$executeRawUnsafe(`DROP TABLE "ModelArtifact";`);
    await prisma.$executeRawUnsafe(`DROP TABLE "User";`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Group";`);

    await prisma.$executeRawUnsafe(`ALTER TABLE "User_next" RENAME TO "User";`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "ModelArtifact_next" RENAME TO "ModelArtifact";`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "ModelUploadRecord_next" RENAME TO "ModelUploadRecord";`);
  } finally {
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
  }
}

async function findId(table: string, column: string, value: string) {
  const rows = await prisma.$queryRawUnsafe<IdRow[]>(`SELECT "id" FROM "${table}" WHERE "${column}" = ? LIMIT 1;`, value);
  return rows[0]?.id ?? null;
}

async function ensureMappedUser(oldUsername: string, username: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const legacyUserId = await findId("User", "username", oldUsername);
  const mappedUserId = await findId("User", "username", username);

  if (legacyUserId && (!mappedUserId || mappedUserId === legacyUserId)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "username" = ?, "passwordHash" = ?, "role" = 'USER', "enabled" = true WHERE "id" = ?;`,
      username,
      passwordHash,
      legacyUserId,
    );
    return legacyUserId;
  }

  if (mappedUserId) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "passwordHash" = ?, "role" = 'USER', "enabled" = true WHERE "id" = ?;`,
      passwordHash,
      mappedUserId,
    );
    return mappedUserId;
  }

  const userId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "username", "passwordHash", "role", "enabled", "createdAt") VALUES (?, ?, ?, 'USER', true, CURRENT_TIMESTAMP);`,
    userId,
    username,
    passwordHash,
  );
  return userId;
}

async function migrateLegacyGroupUsers() {
  for (const mapping of legacyGroupUserMappings) {
    const userId = await ensureMappedUser(mapping.oldUsername, mapping.username, mapping.password);
    await renameLegacyModelDirectory(mapping.oldUsername, mapping.username);
    await prisma.$executeRawUnsafe(
      `UPDATE "ModelArtifact" SET "id" = ?, "userId" = ?, "name" = ? WHERE "id" = ? AND NOT EXISTS (SELECT 1 FROM "ModelArtifact" WHERE "id" = ?);`,
      mapping.username,
      userId,
      mapping.username,
      mapping.oldUsername,
      mapping.username,
    );
    await prisma.$executeRawUnsafe(`UPDATE "ModelArtifact" SET "userId" = ?, "name" = ? WHERE "id" = ?;`, userId, mapping.username, mapping.username);
    await replaceLegacyModelReferences(mapping.oldUsername, mapping.username, userId);
  }
  await rewriteModelRankingFiles(legacyModelMappings);
}

async function renameLegacyModelDirectory(oldId: string, newId: string) {
  const oldRoot = join(process.cwd(), "uploads", "models", oldId);
  const newRoot = join(process.cwd(), "uploads", "models", newId);
  try {
    await access(oldRoot);
  } catch {
    return;
  }
  try {
    await access(newRoot);
    return;
  } catch {
    await rename(oldRoot, newRoot);
  }
}

async function replaceLegacyModelReferences(oldId: string, newId: string, userId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "ModelArtifact" SET "archivePath" = replace("archivePath", ?, ?), "packageDir" = replace("packageDir", ?, ?), "entrypointPath" = replace("entrypointPath", ?, ?) WHERE "id" = ?;`,
    oldId,
    newId,
    oldId,
    newId,
    oldId,
    newId,
    newId,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "ModelUploadRecord" SET "modelId" = ?, "userId" = ?, "archivePath" = replace("archivePath", ?, ?), "packageDir" = replace("packageDir", ?, ?), "entrypointPath" = replace("entrypointPath", ?, ?) WHERE "modelId" = ? OR "modelId" = ?;`,
    newId,
    userId,
    oldId,
    newId,
    oldId,
    newId,
    oldId,
    newId,
    oldId,
    newId,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "ModelTestResult" SET "modelId" = ?, "outputPath" = replace("outputPath", ?, ?) WHERE "modelId" = ? OR "modelId" = ?;`,
    newId,
    oldId,
    newId,
    oldId,
    newId,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "ModelTestBatch" SET "judgeRankingsJson" = replace("judgeRankingsJson", ?, ?), "judgeReport" = replace("judgeReport", ?, ?), "judgeRawResponse" = replace("judgeRawResponse", ?, ?) WHERE "judgeRankingsJson" IS NOT NULL OR "judgeReport" IS NOT NULL OR "judgeRawResponse" IS NOT NULL;`,
    oldId,
    newId,
    oldId,
    newId,
    oldId,
    newId,
  );
}

async function backfillModelUploadRecords() {
  const models = await prisma.$queryRawUnsafe<ModelBackfillRow[]>(
    `SELECT "id", "userId", "originalFilename", "archivePath", "packageDir", "entrypointPath", "createdAt" FROM "ModelArtifact";`,
  );
  for (const model of models) {
    const existing = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS "count" FROM "ModelUploadRecord" WHERE "modelId" = ? AND "userId" = ? AND "uploadedAt" = ?;`,
      model.id,
      model.userId,
      model.createdAt,
    );
    if ((existing[0]?.count ?? 0) > 0) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelUploadRecord" ("id", "modelId", "userId", "originalFilename", "archivePath", "packageDir", "entrypointPath", "uploadedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      randomUUID(),
      model.id,
      model.userId,
      model.originalFilename,
      model.archivePath,
      model.packageDir,
      model.entrypointPath,
      model.createdAt,
    );
  }
}

async function deleteLegacyModelTestBatches() {
  const deleted = await prisma.modelTestBatch.deleteMany({ where: { kind: { not: "RANKING" } } });
  if (deleted.count > 0) console.log(`Deleted ${deleted.count} legacy non-ranking model test batches.`);
}

async function main() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'USER', "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Announcement" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelArtifact" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "originalFilename" TEXT NOT NULL, "archivePath" TEXT NOT NULL, "packageDir" TEXT NOT NULL, "entrypointPath" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModelArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelUploadRecord" ("id" TEXT NOT NULL PRIMARY KEY, "modelId" TEXT NOT NULL, "userId" TEXT NOT NULL, "originalFilename" TEXT NOT NULL, "archivePath" TEXT NOT NULL, "packageDir" TEXT NOT NULL, "entrypointPath" TEXT NOT NULL, "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModelUploadRecord_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ModelUploadRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelTestBatch" ("id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL DEFAULT 'TEST', "status" TEXT NOT NULL DEFAULT 'PENDING', "question" TEXT, "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, "judgeStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED', "judgeInputPath" TEXT, "judgeRawResponse" TEXT, "judgeRankingsJson" TEXT, "judgeReport" TEXT, "judgeError" TEXT, "judgeStartedAt" DATETIME, "judgeCompletedAt" DATETIME, CONSTRAINT "ModelTestBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelTestResult" ("id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "modelId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "durationMs" INTEGER, "peakMemoryKb" INTEGER, "outputPath" TEXT, "outputPreview" TEXT, "error" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, CONSTRAINT "ModelTestResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ModelTestBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ModelTestResult_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);

  await addColumnIfMissing("User", "role", "TEXT NOT NULL DEFAULT 'USER'");
  await addColumnIfMissing("User", "enabled", "BOOLEAN NOT NULL DEFAULT true");
  await addColumnIfMissing("User", "createdAt", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing("ModelArtifact", "enabled", "BOOLEAN NOT NULL DEFAULT true");
  await addColumnIfMissing("ModelArtifact", "createdAt", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

  await rebuildCoreTables();

  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Group_name_key";`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_groupId_idx";`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ModelArtifact_groupId_key";`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ModelArtifact_groupId_idx";`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ModelUploadRecord_groupId_uploadedAt_idx";`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ModelArtifact_userId_key";`);

  await migrateLegacyGroupUsers();

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ModelArtifact_userId_key" ON "ModelArtifact"("userId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUploadRecord_userId_uploadedAt_idx" ON "ModelUploadRecord"("userId", "uploadedAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUploadRecord_modelId_uploadedAt_idx" ON "ModelUploadRecord"("modelId", "uploadedAt");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ModelTestResult_batchId_modelId_key" ON "ModelTestResult"("batchId", "modelId");`);

  await backfillModelUploadRecords();
  await deleteLegacyModelTestBatches();

  console.log("SQLite tables are ready. User groups were removed and ranking data was preserved.");
}

main().finally(() => prisma.$disconnect());
