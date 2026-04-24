import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Class" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL DEFAULT '', "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "nickname" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'USER', "enabled" BOOLEAN NOT NULL DEFAULT true, "classId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Competition" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "description" TEXT NOT NULL, "metric" TEXT NOT NULL DEFAULT 'accuracy', "hiddenTestDataDir" TEXT NOT NULL, "answerCsvPath" TEXT NOT NULL, "codeTemplate" TEXT NOT NULL DEFAULT '', "runtimeLimitMs" INTEGER NOT NULL DEFAULT 10000, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CompetitionAssignment" ("id" TEXT NOT NULL PRIMARY KEY, "competitionId" TEXT NOT NULL, "classId" TEXT NOT NULL, CONSTRAINT "CompetitionAssignment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "CompetitionAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionAssignment_competitionId_classId_key" ON "CompetitionAssignment"("competitionId", "classId");`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Announcement" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "classId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Announcement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE);`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Submission" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "competitionId" TEXT NOT NULL, "code" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "metricValue" REAL, "leaderboardScore" REAL, "durationMs" INTEGER, "outputPreview" TEXT, "error" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME, CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "Submission_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`);
  console.log("SQLite tables are ready.");
}

main().finally(() => prisma.$disconnect());
