import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { assertModelStorageId, getModelFile, saveModelUpload, saveModelUploadStream } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";
import { publicUserSelect } from "@/lib/user-select";

async function requireModelOwner(user: SessionUser) {
  if (user.role !== "USER") throw new Response(JSON.stringify({ error: "只有普通用户可以上传模型" }), { status: 403 });
  const group = user.groupId ? await prisma.group.findUnique({ where: { id: user.groupId } }) : null;
  if (user.groupId && !group) throw new Response(JSON.stringify({ error: "当前账号的小组不存在，无法上传模型" }), { status: 400 });
  try {
    assertModelStorageId(user.username);
  } catch (storageError) {
    if (storageError instanceof Error) throw new Response(JSON.stringify({ error: storageError.message }), { status: 400 });
    throw storageError;
  }
  return { group, storageId: user.username };
}

function restoreModelData(previousModel: NonNullable<Awaited<ReturnType<typeof prisma.modelArtifact.findUnique>>>) {
  return {
    userId: previousModel.userId,
    groupId: previousModel.groupId,
    name: previousModel.name,
    originalFilename: previousModel.originalFilename,
    archivePath: previousModel.archivePath,
    packageDir: previousModel.packageDir,
    entrypointPath: previousModel.entrypointPath,
    enabled: previousModel.enabled,
    createdAt: previousModel.createdAt,
  };
}

async function createUploadRecord({
  groupId,
  modelId,
  originalFilename,
  paths,
  uploadedAt,
  userId,
}: {
  groupId: string | null;
  modelId: string;
  originalFilename: string;
  paths: { archivePath: string; workingDir: string; entrypointPath: string };
  uploadedAt: Date;
  userId: string;
}) {
  await prisma.modelUploadRecord.create({
    data: {
      modelId,
      groupId,
      userId,
      originalFilename,
      archivePath: paths.archivePath,
      packageDir: paths.workingDir,
      entrypointPath: paths.entrypointPath,
      uploadedAt,
    },
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const uploadIds = await getSyncedModelUploadIds();
    const models = await prisma.modelArtifact.findMany({
      where: { id: { in: uploadIds }, ...(user.role === "USER" ? { userId: user.id } : {}) },
      include: { user: { select: publicUserSelect }, group: true, results: { include: { batch: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return json({ models });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { group, storageId } = await requireModelOwner(user);
    const previousModel = await prisma.modelArtifact.findUnique({ where: { id: storageId } });
    const directFilename = decodeURIComponent(request.headers.get("x-model-filename") ?? "");

    if (request.headers.get("content-type") === "application/zip" && directFilename && request.body) {
      const uploadedAt = new Date();
      const model = await prisma.modelArtifact.upsert({
        where: { id: storageId },
        update: { userId: user.id, groupId: group?.id ?? null, name: storageId, originalFilename: directFilename, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", enabled: true, createdAt: uploadedAt },
        create: { id: storageId, userId: user.id, groupId: group?.id ?? null, name: storageId, originalFilename: directFilename, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", createdAt: uploadedAt },
      });
      try {
        const paths = await saveModelUploadStream(storageId, directFilename, request.body);
        const updated = await prisma.modelArtifact.update({
          where: { id: model.id },
          data: { archivePath: paths.archivePath, packageDir: paths.workingDir, entrypointPath: paths.entrypointPath },
        });
        await createUploadRecord({ groupId: group?.id ?? null, modelId: model.id, originalFilename: directFilename, paths, uploadedAt, userId: user.id });
        return json({ model: updated });
      } catch (uploadError) {
        if (previousModel) await prisma.modelArtifact.update({ where: { id: model.id }, data: restoreModelData(previousModel) }).catch(() => undefined);
        else await prisma.modelArtifact.delete({ where: { id: model.id } }).catch(() => undefined);
        if (uploadError instanceof Error) return error(uploadError.message, 400);
        throw uploadError;
      }
    }

    const formData = await request.formData().catch((formError) => {
      console.error("Failed to parse model upload form data", formError);
      return null;
    });
    if (!formData) return error("上传请求无法解析，可能是文件过大或请求被截断，请重新选择较小的 .zip 文件后上传", 400);
    const file = getModelFile(formData);
    if (!file) return error("请上传模型 .zip 文件", 400);
    const uploadedAt = new Date();
    const model = await prisma.modelArtifact.upsert({
      where: { id: storageId },
      update: { userId: user.id, groupId: group?.id ?? null, name: storageId, originalFilename: file.name, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", enabled: true, createdAt: uploadedAt },
      create: { id: storageId, userId: user.id, groupId: group?.id ?? null, name: storageId, originalFilename: file.name, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", createdAt: uploadedAt },
    });
    try {
      const paths = await saveModelUpload(storageId, file);
      const updated = await prisma.modelArtifact.update({
        where: { id: model.id },
        data: { archivePath: paths.archivePath, packageDir: paths.workingDir, entrypointPath: paths.entrypointPath },
      });
      await createUploadRecord({ groupId: group?.id ?? null, modelId: model.id, originalFilename: file.name, paths, uploadedAt, userId: user.id });
      return json({ model: updated });
    } catch (uploadError) {
      if (previousModel) await prisma.modelArtifact.update({ where: { id: model.id }, data: restoreModelData(previousModel) }).catch(() => undefined);
      else await prisma.modelArtifact.delete({ where: { id: model.id } }).catch(() => undefined);
      if (uploadError instanceof Error) return error(uploadError.message, 400);
      throw uploadError;
    }
  });
}
