"use client";

import { useEffect, useState } from "react";
import { Card, StatusBadge } from "@/components/ui";

type Submission = { id: string; status: string; score: number; durationMs?: number; error?: string; code: string; problem: { title: string }; caseResults: { id: string; status: string; durationMs: number; actual?: string; error?: string; testCase: { args: string; expected: string; isSample: boolean } }[] };
export default function SubmissionView({ id }: { id: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  useEffect(() => { let alive = true; async function load() { const res = await fetch(`/api/submissions/${id}`); if (res.ok && alive) { const data = await res.json(); setSubmission(data.submission); if (["PENDING", "RUNNING"].includes(data.submission.status)) setTimeout(load, 1000); } } load(); return () => { alive = false; }; }, [id]);
  if (!submission) return <Card>加载中...</Card>;
  return <div className="grid gap-6"><Card><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">{submission.problem.title}</h1><p className="text-sm text-slate-500">得分 {submission.score}% · {submission.durationMs ?? 0}ms</p></div><StatusBadge status={submission.status} /></div>{submission.error && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-sm text-red-700">{submission.error}</pre>}</Card><Card><h2 className="text-xl font-bold">可见测试点</h2><table className="mt-3"><thead><tr><th>参数</th><th>期望</th><th>状态</th><th>实际/错误</th></tr></thead><tbody>{submission.caseResults.map((r) => <tr key={r.id}><td><code>{r.testCase.args}</code></td><td><code>{r.testCase.expected}</code></td><td><StatusBadge status={r.status} /></td><td><code>{r.actual ?? r.error ?? ""}</code></td></tr>)}</tbody></table></Card><Card><h2 className="text-xl font-bold">代码</h2><pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 text-sm text-white">{submission.code}</pre></Card></div>;
}
