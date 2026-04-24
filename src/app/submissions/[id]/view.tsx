"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { formatMetricName, formatMetricValue } from "@/lib/judge";

type Submission = { id: string; status: string; metricValue?: number; leaderboardScore?: number; durationMs?: number; error?: string; outputPreview?: string; code: string; competition: { id: string; title: string; metric: string }; user: { nickname: string } };
export default function SubmissionView({ id }: { id: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  useEffect(() => { let alive = true; async function load() { const res = await fetch(`/api/submissions/${id}`); if (res.ok && alive) { const data = await res.json(); setSubmission(data.submission); if (["PENDING", "RUNNING"].includes(data.submission.status)) setTimeout(load, 1000); } } load(); return () => { alive = false; }; }, [id]);
  if (!submission) return <Card>加载中...</Card>;
  return <div className="grid gap-6"><Card><div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">{submission.competition.title}</h1><p className="text-sm text-slate-500">{formatMetricName(submission.competition.metric)} {formatMetricValue(submission.metricValue)} · {submission.durationMs ?? 0}ms</p><Link className="mt-2 inline-block text-sm font-semibold text-slate-700" href={`/competitions/${submission.competition.id}`}>返回比赛</Link></div><StatusBadge status={submission.status} /></div>{submission.error && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-sm text-red-700">{submission.error}</pre>}</Card>{submission.outputPreview && <Card><h2 className="text-xl font-bold">输出预览</h2><pre className="mt-3 overflow-auto rounded-xl bg-slate-100 p-4 text-sm">{submission.outputPreview}</pre></Card>}<Card><h2 className="text-xl font-bold">代码</h2><pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 text-sm text-white">{submission.code}</pre></Card></div>;
}
