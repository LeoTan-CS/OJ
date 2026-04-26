import type { PrismaClient } from "@prisma/client";
import { renameModelUpload } from "./model-upload";
import { replaceModelIdentityText, rewriteModelRankingFiles, type ModelIdentityMapping } from "./model-identity";
import { prisma } from "./prisma";

type Db = PrismaClient | typeof prisma;

function pathMapping(oldId: string, newId: string): ModelIdentityMapping[] {
  return oldId === newId ? [] : [{ oldId, newId }];
}

function mapNullableText(value: string | null | undefined, mappings: ModelIdentityMapping[]) {
  return value == null ? value : replaceModelIdentityText(value, mappings);
}

async function rewriteRankingBatchText(db: Db, mappings: ModelIdentityMapping[]) {
  if (!mappings.length) return;
  const batches = await db.modelTestBatch.findMany({
    where: {
      OR: [
        { judgeRankingsJson: { not: null } },
        { judgeReport: { not: null } },
        { judgeRawResponse: { not: null } },
      ],
    },
    select: { id: true, judgeRankingsJson: true, judgeReport: true, judgeRawResponse: true },
  });
  await Promise.all(batches.map((batch) => db.modelTestBatch.update({
    where: { id: batch.id },
    data: {
      judgeRankingsJson: mapNullableText(batch.judgeRankingsJson, mappings),
      judgeReport: mapNullableText(batch.judgeReport, mappings),
      judgeRawResponse: mapNullableText(batch.judgeRawResponse, mappings),
    },
  })));
}

export async function renameUserModelIdentity({
  db = prisma,
  userId,
  newUsername,
  groupId,
}: {
  db?: Db;
  userId: string;
  newUsername: string;
  groupId?: string | null;
}) {
  const model = await db.modelArtifact.findUnique({ where: { userId } });
  if (!model) return null;
  const oldId = model.id;
  const newId = newUsername;
  const mappings = pathMapping(oldId, newId);
  if (!mappings.length) {
    const updated = await db.modelArtifact.update({ where: { id: oldId }, data: { groupId: groupId ?? null } });
    await db.modelUploadRecord.updateMany({ where: { modelId: oldId }, data: { groupId: groupId ?? null } });
    return updated;
  }

  const conflict = await db.modelArtifact.findUnique({ where: { id: newId }, select: { userId: true } });
  if (conflict && conflict.userId !== userId) throw new Error("目标用户名已存在模型，无法重命名模型目录");

  const renamed = await renameModelUpload(oldId, newId);
  let databaseChanged = false;
  try {
    const updated = await db.$transaction(async (tx) => {
      const nextModel = await tx.modelArtifact.update({
        where: { id: oldId },
        data: {
          id: newId,
          groupId: groupId ?? null,
          archivePath: replaceModelIdentityText(model.archivePath, mappings),
          packageDir: replaceModelIdentityText(model.packageDir, mappings),
          entrypointPath: replaceModelIdentityText(model.entrypointPath, mappings),
        },
      });
      await tx.modelUploadRecord.updateMany({
        where: { modelId: newId },
        data: {
          groupId: groupId ?? null,
          archivePath: replaceModelIdentityText(model.archivePath, mappings),
          packageDir: replaceModelIdentityText(model.packageDir, mappings),
          entrypointPath: replaceModelIdentityText(model.entrypointPath, mappings),
        },
      });
      const results = await tx.modelTestResult.findMany({
        where: { modelId: newId, outputPath: { not: null } },
        select: { id: true, outputPath: true },
      });
      await Promise.all(results.map((result) => tx.modelTestResult.update({
        where: { id: result.id },
        data: { outputPath: mapNullableText(result.outputPath, mappings) },
      })));
      await rewriteRankingBatchText(tx as Db, mappings);
      return nextModel;
    });
    databaseChanged = true;
    await rewriteModelRankingFiles(mappings);
    return updated;
  } catch (error) {
    const reverseMappings = pathMapping(newId, oldId);
    if (databaseChanged) {
      await db.$transaction(async (tx) => {
        await tx.modelArtifact.update({
          where: { id: newId },
          data: {
            id: oldId,
            name: model.name,
            groupId: model.groupId,
            archivePath: model.archivePath,
            packageDir: model.packageDir,
            entrypointPath: model.entrypointPath,
          },
        });
        await tx.modelUploadRecord.updateMany({
          where: { modelId: oldId },
          data: {
            groupId: model.groupId,
            archivePath: model.archivePath,
            packageDir: model.packageDir,
            entrypointPath: model.entrypointPath,
          },
        });
        const results = await tx.modelTestResult.findMany({
          where: { modelId: oldId, outputPath: { not: null } },
          select: { id: true, outputPath: true },
        });
        await Promise.all(results.map((result) => tx.modelTestResult.update({
          where: { id: result.id },
          data: { outputPath: mapNullableText(result.outputPath, reverseMappings) },
        })));
        await rewriteRankingBatchText(tx as Db, reverseMappings);
      }).catch(() => undefined);
      await rewriteModelRankingFiles(reverseMappings).catch(() => undefined);
    }
    if (renamed) await renameModelUpload(newId, oldId).catch(() => undefined);
    throw error;
  }
}

export async function syncModelIdentityHistory(mappings: ModelIdentityMapping[], db: Db = prisma) {
  if (!mappings.length) return;
  await rewriteRankingBatchText(db, mappings);
  await rewriteModelRankingFiles(mappings);
}
