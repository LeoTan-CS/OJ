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
      else if (field.name === "classId" && value === "") body[field.name] = null;
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
  return <button onClick={del} className="text-sm font-medium text-red-600">删除</button>;
}

export function AssignmentForm({ problemId, classes, assigned }: { problemId: string; classes: { id: string; name: string }[]; assigned: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(new Set(assigned));
  async function save() { await fetch(`/api/admin/problems/${problemId}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classIds: Array.from(selected) }) }); router.refresh(); }
  return <div className="grid gap-2">{classes.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><input className="w-auto" type="checkbox" checked={selected.has(c.id)} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(c.id); else next.delete(c.id); setSelected(next); }} />{c.name}</label>)}<button onClick={save} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">保存分配</button></div>;
}
