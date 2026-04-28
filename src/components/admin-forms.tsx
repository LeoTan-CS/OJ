"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field } from "./ui";

export function JsonForm({ endpoint, method = "POST", initial, fields, submitLabel = "保存", redirectTo }: { endpoint: string; method?: string; initial?: Record<string, unknown>; fields: { name: string; label: string; type?: string; options?: { label: string; value: string }[]; textarea?: boolean }[]; submitLabel?: string; redirectTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    const body: Record<string, unknown> = {};
    fields.forEach((field) => {
      const value = formData.get(field.name);
      if (field.type === "number") body[field.name] = Number(value);
      else if (field.type === "checkbox") body[field.name] = value === "on";
      else body[field.name] = value;
    });
    const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const data = await res.json().catch(() => ({})); return setError(data.error ?? "保存失败"); }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }
  return <form action={submit} className="grid gap-4">{fields.map((field) => <Field key={field.name} label={field.label}>{field.options ? <select name={field.name} defaultValue={String(initial?.[field.name] ?? "")}>{field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.textarea ? <textarea name={field.name} defaultValue={String(initial?.[field.name] ?? "")} /> : field.type === "checkbox" ? <input name={field.name} type="checkbox" defaultChecked={Boolean(initial?.[field.name] ?? true)} /> : <input name={field.name} type={field.type ?? "text"} defaultValue={String(initial?.[field.name] ?? "")} />}</Field>)}{error && <p className="text-sm text-red-600">{error}</p>}<Button>{submitLabel}</Button></form>;
}

export function DeleteButton({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  async function del() { if (!confirm("确定删除？")) return; await fetch(endpoint, { method: "DELETE" }); router.refresh(); }
  return <button type="button" onClick={del} className="text-sm font-medium text-red-600">删除</button>;
}

function SmallActionButton({
  endpoint,
  method = "POST",
  confirmText,
  idleLabel,
  pendingLabel,
  disabled = false,
  className = "",
}: {
  endpoint: string;
  method?: string;
  confirmText?: string;
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (confirmText && !confirm(confirmText)) return;
    setPending(true);
    setError("");
    const res = await fetch(endpoint, { method });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error ?? "操作失败");
    }
    router.refresh();
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={disabled || pending}
        className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {pending ? pendingLabel : idleLabel}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

export function ModelUploadForm({ initialName = "" }: { initialName?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const file = formData.get("modelFile");
    if (!(file instanceof File) || file.size === 0) return setError("请选择模型压缩包");
    const modelName = String(formData.get("modelName") ?? "").trim();
    if (!modelName) return setError("请填写模型名称");
    setPending(true);
    setError("");
    setMessage("");
    setProgress(0);
    const res = await uploadModelFile(file, modelName, setProgress);
    setPending(false);
    if (!res.ok) { const data = await res.json().catch(() => ({})); setProgress(0); return setError(data.error ?? "上传失败"); }
    form.reset();
    setSelectedFile(null);
    setProgress(0);
    setMessage("模型上传成功，已替换当前模型。");
    router.refresh();
  }
  return <form onSubmit={submit} className="grid gap-4"><Field label="模型名称"><input name="modelName" defaultValue={initialName} maxLength={120} required placeholder="例如：我的问答模型" /></Field><label className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 p-5 transition hover:border-slate-400 hover:bg-white"><input name="modelFile" type="file" accept=".zip,application/zip" required className="sr-only" onChange={(event) => { setError(""); setMessage(""); setProgress(0); setSelectedFile(event.target.files?.[0] ?? null); }} /><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm ring-1 ring-slate-200 transition group-hover:scale-105">⬆️</div><div className="min-w-0 flex-1"><div className="text-sm font-bold text-slate-950">{selectedFile ? selectedFile.name : "选择或拖入模型压缩包"}</div><div className="mt-1 text-xs leading-5 text-slate-500">{selectedFile ? `${(selectedFile.size / 1024 / 1024 / 1024).toFixed(2)} GB · 点击可重新选择` : "支持 .zip 文件，上传后会覆盖当前用户的旧模型。"}</div>{selectedFile && <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">文件已就绪</div>}</div></div></label>{pending && <div className="rounded-2xl bg-slate-50 p-4"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600"><span>上传进度</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-500">大模型上传完成后还需要服务端解压校验，请保持页面打开。</p></div>}{message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>}{error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}<button type="submit" disabled={pending} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? progress >= 100 ? "服务端处理中..." : "上传中，请勿关闭页面..." : selectedFile ? "上传并替换我的模型" : "选择文件后上传"}</button></form>;
}

function uploadModelFile(file: File, modelName: string, onProgress: (progress: number) => void): Promise<Response> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/models");
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.setRequestHeader("X-Model-Filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-Model-Name", encodeURIComponent(modelName));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "application/json" } }));
    xhr.onerror = () => resolve(new Response(JSON.stringify({ error: "网络错误，上传失败" }), { status: 500, headers: { "Content-Type": "application/json" } }));
    xhr.send(file);
  });
}

export function UserImportForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const file = formData.get("usersFile");
    if (!(file instanceof File) || file.size === 0) return setError("请选择 Excel 文件");
    setPending(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/users", { method: "PUT", body: formData });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "导入失败");
    form.reset();
    setMessage(`已导入 ${data.created ?? 0} 个账号`);
    router.refresh();
  }
  return <form onSubmit={submit} className="grid gap-4"><Field label="账号 Excel"><input name="usersFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></Field><p className="text-xs text-slate-500">从左到右四列依次为：用户名、初始密码、角色、小组。角色支持 SUPER_ADMIN / ADMIN / USER；小组为可选标记，填写时必须已存在。</p>{error && <p className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}<Button>{pending ? "导入中..." : "批量导入账号"}</Button></form>;
}

export function ModelTestBatchButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function run() {
    if (!confirm("确定对所有启用模型创建一轮模型测试批次？")) return;
    setPending(true);
    setError("");
    const res = await fetch("/api/admin/model-rankings", { method: "POST" });
    setPending(false);
    if (!res.ok) { const data = await res.json().catch(() => ({})); return setError(data.error ?? "创建模型测试批次失败"); }
    router.refresh();
  }
  return <div className="grid gap-2"><button type="button" onClick={run} disabled={pending} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "创建中..." : "开始模型测试"}</button>{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}

export function JudgeRankingButton({
  batchId,
  disabled = false,
  label = "开始裁判排名",
}: {
  batchId: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <SmallActionButton
      endpoint={`/api/admin/model-rankings/${batchId}/judge`}
      confirmText="确定开始这个批次的裁判排名？"
      idleLabel={label}
      pendingLabel="提交中..."
      disabled={disabled}
    />
  );
}

export function RerunRankingModelButton({
  batchId,
  modelId,
  disabled = false,
}: {
  batchId: string;
  modelId: string;
  disabled?: boolean;
}) {
  return (
    <SmallActionButton
      endpoint={`/api/admin/model-rankings/${batchId}/models/${modelId}/rerun`}
      confirmText="确定重跑这个模型？这会清空当前批次已有的裁判结果。"
      idleLabel="重跑模型"
      pendingLabel="提交中..."
      disabled={disabled}
    />
  );
}

export function ModelEnabledToggle({ modelId, enabled }: { modelId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    await fetch(`/api/admin/models/${modelId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
    setPending(false);
    router.refresh();
  }
  return <button type="button" onClick={toggle} disabled={pending} className={enabled ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-slate-500"}>{pending ? "更新中" : enabled ? "启用" : "禁用"}</button>;
}

export function UserModelTestButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ status: string; answer?: string; error?: string; durationMs?: number } | null>(null);
  async function run() {
    setPending(true);
    setResult(null);
    const res = await fetch("/api/models/test", { method: "POST" });
    const data = await res.json().catch(() => ({ status: "RUNTIME_ERROR", error: "测试失败" }));
    setPending(false);
    setResult(res.ok ? data : { status: data.status ?? "RUNTIME_ERROR", error: data.error ?? "测试失败", durationMs: data.durationMs });
  }
  return <div className="grid gap-4"><button type="button" onClick={run} disabled={pending} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "测试中..." : "用示例问题测试模型"}</button>{result && <section className={result.status === "SCORED" ? "rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-900" : "rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800"}><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-bold">测试结果</div><div className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold">{result.status}{result.durationMs ? ` · ${result.durationMs}ms` : ""}</div></div><pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{result.answer ?? result.error ?? "-"}</pre></section>}</div>;
}
