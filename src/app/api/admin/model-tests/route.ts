import { requireAdmin } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { modelConnectivityPrompt, modelConnectivityTimeoutMs, runModelConnectivityTest, type ModelConnectivityResult } from "@/lib/model-connectivity";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConnectivityModel = {
  id: string;
  name: string;
  enabled: boolean;
  entrypointPath: string;
  packageDir: string;
  user: { username: string };
};

type StreamEvent =
  | { type: "start"; total: number; prompt: string; timeoutMs: number }
  | (PublicModelInfo & { type: "model_start" })
  | (PublicModelInfo & ModelConnectivityResult & { type: "result" })
  | { type: "done"; total: number; completed: number; passed: number; failed: number; error?: string };

type PublicModelInfo = {
  modelId: string;
  modelName: string;
  username: string;
  enabled: boolean;
};

function toPublicModelInfo(model: ConnectivityModel): PublicModelInfo {
  return {
    modelId: model.id,
    modelName: model.name,
    username: model.user.username,
    enabled: model.enabled,
  };
}

async function loadConnectivityModels(modelId?: string) {
  const uploadIds = await getSyncedModelUploadIds();
  const targetIds = modelId ? uploadIds.filter((id) => id === modelId) : uploadIds;
  return prisma.modelArtifact.findMany({
    where: { id: { in: targetIds } },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const models = await loadConnectivityModels();
    return json({
      prompt: modelConnectivityPrompt,
      timeoutMs: modelConnectivityTimeoutMs,
      models: models.map(toPublicModelInfo),
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body: unknown = await request.json().catch(() => ({}));
    const requestedModelId = body && typeof body === "object" && "modelId" in body ? body.modelId : undefined;
    const modelId = typeof requestedModelId === "string" && requestedModelId.trim() ? requestedModelId.trim() : undefined;
    const models = await loadConnectivityModels(modelId);
    if (!models.length) return error(modelId ? "没有找到该模型或模型未上传" : "没有已上传的模型可测试", 400);

    const encoder = new TextEncoder();
    const encode = (event: StreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let completed = 0;
        let passed = 0;
        let failed = 0;

        const enqueue = (event: StreamEvent) => controller.enqueue(encode(event));

        try {
          enqueue({ type: "start", total: models.length, prompt: modelConnectivityPrompt, timeoutMs: modelConnectivityTimeoutMs });

          for (const model of models) {
            if (request.signal.aborted) break;
            const modelInfo = toPublicModelInfo(model);
            enqueue({ type: "model_start", ...modelInfo });
            const result = await runModelConnectivityTest({
              entrypointPath: model.entrypointPath,
              workingDir: model.packageDir,
              timeoutMs: modelConnectivityTimeoutMs,
            });
            completed += 1;
            if (result.status === "SCORED") passed += 1;
            else failed += 1;
            enqueue({ type: "result", ...modelInfo, ...result });
          }

          enqueue({ type: "done", total: models.length, completed, passed, failed });
        } catch (streamError) {
          enqueue({
            type: "done",
            total: models.length,
            completed,
            passed,
            failed,
            error: streamError instanceof Error ? streamError.message : "模型连通性测试中断",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
