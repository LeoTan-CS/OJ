import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { assertModelUploadSize } from "@/lib/model-upload-limits";
import { assertModelStorageId, defaultModelNameFromFilename, getModelFile, modelNameOrFallback, parseModelName, saveModelUpload, saveModelUploadStream } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";
import { publicUserSelect } from "@/lib/user-select";

async function requireModelOwner(user: SessionUser) {
  if (user.role !== "USER") throw new Response(JSON.stringify({ error: "只有普通用户可以上传模型" }), { status: 403 });
  try {
    assertModelStorageId(user.username);
  } catch (storageError) {
    if (storageError instanceof Error) throw new Response(JSON.stringify({ error: storageError.message }), { status: 400 });
    throw storageError;
  }
  return { storageId: user.username };
}

function restoreModelData(previousModel: NonNullable<Awaited<ReturnType<typeof prisma.modelArtifact.findUnique>>>) {
  return {
    userId: previousModel.userId,
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
  modelId,
  originalFilename,
  paths,
  uploadedAt,
  userId,
}: {
  modelId: string;
  originalFilename: string;
  paths: { archivePath: string; workingDir: string; entrypointPath: string };
  uploadedAt: Date;
  userId: string;
}) {
  await prisma.modelUploadRecord.create({
    data: {
      modelId,
      userId,
      originalFilename,
      archivePath: paths.archivePath,
      packageDir: paths.workingDir,
      entrypointPath: paths.entrypointPath,
      uploadedAt,
    },
  });
}

function decodeHeaderValue(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nameErrorResponse(nameError: unknown) {
  if (nameError instanceof Error) return error(nameError.message, 400);
  throw nameError;
}

function modelUploadSizeErrorResponse(sizeError: unknown) {
  if (sizeError instanceof Error) return error(sizeError.message, 400);
  throw sizeError;
}

function assertContentLengthWithinModelUploadLimit(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;
  const size = Number(contentLength);
  if (Number.isFinite(size)) assertModelUploadSize(size);
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const uploadIds = await getSyncedModelUploadIds();
    const models = await prisma.modelArtifact.findMany({
      where: { id: { in: uploadIds }, ...(user.role === "USER" ? { userId: user.id } : {}) },
      include: { user: { select: publicUserSelect }, results: { include: { batch: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return json({ models });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { storageId } = await requireModelOwner(user);
    const previousModel = await prisma.modelArtifact.findUnique({ where: { id: storageId } });
    const directFilename = decodeHeaderValue(request.headers.get("x-model-filename"));

    if (request.headers.get("content-type") === "application/zip" && directFilename && request.body) {
      let modelName: string;
      try {
        modelName = modelNameOrFallback(decodeHeaderValue(request.headers.get("x-model-name")), defaultModelNameFromFilename(directFilename));
      } catch (nameError) {
        return nameErrorResponse(nameError);
      }
      try {
        assertContentLengthWithinModelUploadLimit(request);
      } catch (sizeError) {
        return modelUploadSizeErrorResponse(sizeError);
      }
      const uploadedAt = new Date();
      const model = await prisma.modelArtifact.upsert({
        where: { id: storageId },
        update: { userId: user.id, name: modelName, originalFilename: directFilename, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", enabled: true, createdAt: uploadedAt },
        create: { id: storageId, userId: user.id, name: modelName, originalFilename: directFilename, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", createdAt: uploadedAt },
      });
      try {
        const paths = await saveModelUploadStream(storageId, directFilename, request.body);
        const updated = await prisma.modelArtifact.update({
          where: { id: model.id },
          data: { archivePath: paths.archivePath, packageDir: paths.workingDir, entrypointPath: paths.entrypointPath },
        });
        await createUploadRecord({ modelId: model.id, originalFilename: directFilename, paths, uploadedAt, userId: user.id });
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
    try {
      assertModelUploadSize(file.size);
    } catch (sizeError) {
      return modelUploadSizeErrorResponse(sizeError);
    }
    let modelName: string;
    try {
      modelName = parseModelName(formData, defaultModelNameFromFilename(file.name));
    } catch (nameError) {
      return nameErrorResponse(nameError);
    }
    const uploadedAt = new Date();
    const model = await prisma.modelArtifact.upsert({
      where: { id: storageId },
      update: { userId: user.id, name: modelName, originalFilename: file.name, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", enabled: true, createdAt: uploadedAt },
      create: { id: storageId, userId: user.id, name: modelName, originalFilename: file.name, archivePath: "pending", packageDir: "pending", entrypointPath: "pending", createdAt: uploadedAt },
    });
    try {
      const paths = await saveModelUpload(storageId, file);
      const updated = await prisma.modelArtifact.update({
        where: { id: model.id },
        data: { archivePath: paths.archivePath, packageDir: paths.workingDir, entrypointPath: paths.entrypointPath },
      });
      await createUploadRecord({ modelId: model.id, originalFilename: file.name, paths, uploadedAt, userId: user.id });
      return json({ model: updated });
    } catch (uploadError) {
      if (previousModel) await prisma.modelArtifact.update({ where: { id: model.id }, data: restoreModelData(previousModel) }).catch(() => undefined);
      else await prisma.modelArtifact.delete({ where: { id: model.id } }).catch(() => undefined);
      if (uploadError instanceof Error) return error(uploadError.message, 400);
      throw uploadError;
    }
  });
}
