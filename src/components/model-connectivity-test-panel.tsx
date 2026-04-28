"use client";

import { useEffect, useMemo, useState } from "react";
import { ModelIdentity, StatusBadge } from "./ui";

export type ConnectivityPanelModel = {
  modelId: string;
  modelName: string;
  username: string;
  enabled: boolean;
};

type RowState = ConnectivityPanelModel & {
  state: "idle" | "pending" | "running" | "done";
  status?: string;
  answer?: string | null;
  error?: string | null;
  durationMs?: number | null;
  peakMemoryKb?: number | null;
};

type StreamEvent =
  | { type: "start"; total: number; prompt: string; timeoutMs: number }
  | (ConnectivityPanelModel & { type: "model_start" })
  | (ConnectivityPanelModel & {
    type: "result";
    status: string;
    answer: string | null;
    error: string | null;
    durationMs: number | null;
    peakMemoryKb: number | null;
  })
  | { type: "done"; total: number; completed: number; passed: number; failed: number; error?: string };

const storageKey = "bench:model-connectivity:last-status";
const storageVersion = 1;
const storedErrorLimit = 800;

function formatDuration(value: number | null | undefined) {
  return value == null ? "-" : `${Math.round(value)}ms`;
}

function formatMemory(value: number | null | undefined) {
  if (value == null) return "-";
  if (value < 1024) return `${Math.round(value)}KB`;
  return `${(value / 1024).toFixed(1)}MB`;
}

function initialRows(models: ConnectivityPanelModel[]) {
  return Object.fromEntries(models.map((model) => [model.modelId, { ...model, state: "pending" as const }]));
}

function trimStoredError(value: string | null | undefined) {
  return value ? value.slice(0, storedErrorLimit) : null;
}

function toStoredRow(row: RowState): RowState {
  if (row.state === "pending" || row.state === "running") {
    return {
      ...row,
      state: "done",
      status: "INTERRUPTED",
      answer: null,
      error: "页面刷新或连接中断，最终结果未确认。请重新测试该模型。",
    };
  }
  return { ...row, answer: null, error: trimStoredError(row.error) };
}

function readStoredRows(models: ConnectivityPanelModel[]) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: number; rows?: Record<string, RowState> };
    if (parsed.version !== storageVersion || !parsed.rows) return {};
    return Object.fromEntries(models.flatMap((model) => {
      const row = parsed.rows?.[model.modelId];
      return row ? [[model.modelId, { ...row, ...model, answer: null } satisfies RowState]] : [];
    }));
  } catch {
    return {};
  }
}

function writeStoredRows(rows: Record<string, RowState>) {
  try {
    const storedRows = Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, toStoredRow(row)]));
    if (Object.keys(storedRows).length === 0) sessionStorage.removeItem(storageKey);
    else sessionStorage.setItem(storageKey, JSON.stringify({ version: storageVersion, rows: storedRows, savedAt: new Date().toISOString() }));
  } catch {
    // Ignore storage quota/private-mode failures; live test state still works.
  }
}

export function ModelConnectivityTestPanel({ models }: { models: ConnectivityPanelModel[] }) {
  const [running, setRunning] = useState(false);
  const [runningModelId, setRunningModelId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [streamDoneError, setStreamDoneError] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [storageReady, setStorageReady] = useState(false);

  const visibleRows = useMemo(
    () => models.map((model) => rows[model.modelId] ?? { ...model, state: "idle" as const }),
    [models, rows],
  );
  const passed = visibleRows.filter((row) => row.state === "done" && row.status === "SCORED").length;
  const failed = visibleRows.filter((row) => row.state === "done" && row.status !== "SCORED").length;
  const runningCount = visibleRows.filter((row) => row.state === "running").length;
  const completed = passed + failed;
  const hasSavedRows = Object.keys(rows).length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRows(readStoredRows(models));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [models]);

  useEffect(() => {
    if (storageReady) writeStoredRows(rows);
  }, [rows, storageReady]);

  function applyEvent(event: StreamEvent) {
    if (event.type === "start") {
      setStreamDoneError("");
      return;
    }
    if (event.type === "model_start") {
      setRows((current) => ({
        ...current,
        [event.modelId]: { ...event, state: "running", status: "RUNNING", answer: null, error: null, durationMs: null, peakMemoryKb: null },
      }));
      return;
    }
    if (event.type === "result") {
      setRows((current) => ({
        ...current,
        [event.modelId]: { ...event, state: "done" },
      }));
      return;
    }
    if (event.type === "done" && event.error) setStreamDoneError(event.error);
  }

  function clearRows() {
    sessionStorage.removeItem(storageKey);
    setRows({});
    setError("");
    setStreamDoneError("");
  }

  async function run(targetModel?: ConnectivityPanelModel) {
    if (!targetModel && !confirm("确定对所有已上传模型执行连通性测试？")) return;
    setRunning(true);
    setRunningModelId(targetModel?.modelId ?? null);
    setError("");
    setStreamDoneError("");
    if (targetModel) {
      setRows((current) => ({
        ...current,
        [targetModel.modelId]: {
          ...targetModel,
          state: "pending",
          status: "PENDING",
          answer: null,
          error: null,
          durationMs: null,
          peakMemoryKb: null,
        },
      }));
    } else {
      setRows(initialRows(models));
    }

    try {
      const response = await fetch("/api/admin/model-tests", {
        method: "POST",
        headers: targetModel ? { "Content-Type": "application/json" } : undefined,
        body: targetModel ? JSON.stringify({ modelId: targetModel.modelId }) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "模型连通性测试启动失败");
      }
      if (!response.body) throw new Error("当前浏览器无法读取流式测试结果");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          applyEvent(JSON.parse(line) as StreamEvent);
        }
        if (done) break;
      }

      if (buffer.trim()) applyEvent(JSON.parse(buffer) as StreamEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : "模型连通性测试失败";
      setError(message);
      if (targetModel) {
        setRows((current) => ({
          ...current,
          [targetModel.modelId]: {
            ...targetModel,
            state: "done",
            status: "FAILED",
            answer: null,
            error: message,
            durationMs: null,
            peakMemoryKb: null,
          },
        }));
      }
    } finally {
      setRunning(false);
      setRunningModelId(null);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">模型连通性测试</h1>
          <p className="mt-1 text-sm text-slate-500">对所有已上传模型询问“介绍一下你自己”。刷新后只保留本标签页的最小状态，不保存回答正文。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearRows}
            disabled={running || !hasSavedRows}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            清除状态
          </button>
          <button
            type="button"
            onClick={() => run()}
            disabled={running || models.length === 0}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {running ? "测试中..." : "开始连通性测试"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500">模型总数</div><div className="mt-1 text-2xl font-bold">{models.length}</div></div>
        <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500">测试完成</div><div className="mt-1 text-2xl font-bold">{completed}</div></div>
        <div className="rounded-xl bg-emerald-50 p-4"><div className="text-xs font-semibold text-emerald-700">通过</div><div className="mt-1 text-2xl font-bold text-emerald-800">{passed}</div></div>
        <div className="rounded-xl bg-rose-50 p-4"><div className="text-xs font-semibold text-rose-700">失败</div><div className="mt-1 text-2xl font-bold text-rose-800">{failed}</div></div>
      </div>

      {(error || streamDoneError) && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error || streamDoneError}</div>}
      {running && <div className="text-sm font-medium text-slate-600">{runningCount > 0 ? `${runningCount} 个模型正在测试` : "等待下一个模型开始测试"}</div>}

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>模型</th>
              <th>状态</th>
              <th>耗时</th>
              <th>峰值内存</th>
              <th>操作</th>
              <th>回答 / 错误</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.modelId}>
                <td>
                  <ModelIdentity modelName={row.modelName} username={row.username} />
                </td>
                <td><StatusBadge status={row.status ?? "PENDING"} /></td>
                <td>{formatDuration(row.durationMs)}</td>
                <td>{formatMemory(row.peakMemoryKb)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => run(row)}
                    disabled={running}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {running && runningModelId === row.modelId ? "测试中..." : "单独测试"}
                  </button>
                </td>
                <td className="max-w-2xl">
                  {row.state === "idle" && <span className="text-sm text-slate-500">尚未测试</span>}
                  {row.state === "pending" && <span className="text-sm text-slate-500">排队中</span>}
                  {row.state === "running" && <span className="text-sm text-slate-500">测试中</span>}
                  {row.state === "done" && (
                    <pre className={row.status === "SCORED" ? "max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-700" : "max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-red-700"}>
                      {row.answer || row.error || (row.status === "SCORED" ? "已通过，回答正文未保存。" : "-")}
                    </pre>
                  )}
                </td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td colSpan={6} className="text-sm text-slate-500">暂无模型。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
