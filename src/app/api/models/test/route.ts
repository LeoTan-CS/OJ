import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { runModelConnectivityTest } from "@/lib/model-connectivity";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { modelRuntimeLimitMs } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";

const prompt = "简单介绍一下自己";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    if (user.role !== "USER") return error("只有普通用户可以测试自己的模型", 400);
    const uploadIds = await getSyncedModelUploadIds();
    if (!uploadIds.includes(user.username)) return error("请先上传模型", 400);
    const model = await prisma.modelArtifact.findUnique({ where: { userId: user.id } });
    if (!model) return error("请先上传模型", 400);

    const result = await runModelConnectivityTest({
      entrypointPath: model.entrypointPath,
      workingDir: model.packageDir,
      prompt,
      timeoutMs: modelRuntimeLimitMs,
    });
    return json(result);
  });
}
