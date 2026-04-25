export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { CollapsiblePanel } from "@/components/collapsible-panel";
import { DeleteButton, ModelRankingButton } from "@/components/admin-forms";
import { Card, StatusBadge } from "@/components/ui";
import { readLeaderboardSnapshot, type LeaderboardSnapshot } from "@/lib/model-leaderboard";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { readDefaultModelRankingQuestions, summarizeRankingQuestions, type JudgeRanking } from "@/lib/model-ranking";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | string | null) {
  if (!value) return "-";
  return (value instanceof Date ? value : new Date(value)).toLocaleString("zh-CN", { hour12: false });
}

function formatAverage(value: number) {
  return value.toFixed(2).replace(/\.00$/, "");
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

function LegacyReportBlock({ reportText }: { reportText: string | null }) {
  const report = parseJson<{ summaryReport?: string; strengths?: string[]; weaknesses?: string[]; recommendations?: string[] }>(reportText);
  if (!report) return reportText ? <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{reportText}</pre> : null;
  return <div className="mt-4 grid gap-4 text-sm text-slate-700"><div className="rounded-xl bg-slate-50 p-4 leading-7">{report.summaryReport || "裁判未返回整体报告。"}</div><div className="grid gap-4 md:grid-cols-3"><section><h4 className="font-bold text-slate-900">优势</h4><ul className="mt-2 list-disc space-y-1 pl-5">{(report.strengths ?? []).map((item, index) => <li key={index}>{item}</li>)}</ul></section><section><h4 className="font-bold text-slate-900">不足</h4><ul className="mt-2 list-disc space-y-1 pl-5">{(report.weaknesses ?? []).map((item, index) => <li key={index}>{item}</li>)}</ul></section><section><h4 className="font-bold text-slate-900">建议</h4><ul className="mt-2 list-disc space-y-1 pl-5">{(report.recommendations ?? []).map((item, index) => <li key={index}>{item}</li>)}</ul></section></div></div>;
}

function QuestionReportBlock({ snapshot }: { snapshot: LeaderboardSnapshot }) {
  return (
    <div className="mt-5 grid gap-4">
      <div>
        <h3 className="font-bold">批次聚合摘要</h3>
        <table className="mt-3">
          <thead>
            <tr>
              <th>模型</th>
              <th>成功题数</th>
              <th>质量均分</th>
              <th>时间均分</th>
              <th>空间均分</th>
              <th>总分</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.entries.map((entry) => (
              <tr key={`${snapshot.batch.id}-${entry.modelId}`}>
                <td><div className="font-semibold">{entry.modelName}</div><div className="text-xs text-slate-500">{entry.username}</div></td>
                <td>{entry.successfulQuestions}/{entry.questionCount}</td>
                <td>{formatAverage(entry.qualityAverage)}</td>
                <td>{formatAverage(entry.timeAverage)}</td>
                <td>{formatAverage(entry.memoryAverage)}</td>
                <td className="font-bold text-slate-950">{formatAverage(entry.totalScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-bold">逐题裁判报告</h3>
        <div className="mt-3 grid gap-3">
          {snapshot.questions.map((question, index) => (
            <details key={`${snapshot.batch.id}-${question.questionId}`} className="rounded-xl border bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                第 {index + 1} 题 · {question.question}
              </summary>
              <div className="mt-4 grid gap-4">
                <div className="rounded-xl bg-white p-4 text-sm leading-7 text-slate-700">{question.summaryReport || "裁判未返回整体报告。"}</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <section><h4 className="font-bold text-slate-900">优势</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{(question.strengths ?? []).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>
                  <section><h4 className="font-bold text-slate-900">不足</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{(question.weaknesses ?? []).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>
                  <section><h4 className="font-bold text-slate-900">建议</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{(question.recommendations ?? []).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>质量名次</th>
                      <th>质量分</th>
                      <th>耗时名次</th>
                      <th>时间分</th>
                      <th>内存名次</th>
                      <th>空间分</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {question.entries.map((entry) => {
                      const ranking = question.rankings.find((item) => item.modelId === entry.modelId);
                      return (
                        <tr key={`${question.questionId}-${entry.modelId}`}>
                          <td><div className="font-medium">{entry.modelName}</div><div className="text-xs text-slate-500">{entry.username}</div></td>
                          <td>{entry.qualityRank ? `#${entry.qualityRank}` : "-"}</td>
                          <td>{entry.qualityScore}</td>
                          <td>{entry.timeRank ? `#${entry.timeRank}` : "-"}</td>
                          <td>{entry.timeScore}</td>
                          <td>{entry.memoryRank ? `#${entry.memoryRank}` : "-"}</td>
                          <td>{entry.memoryScore}</td>
                          <td className="text-sm text-slate-600">{ranking?.reason ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function AdminModelRankingsPage() {
  const uploadIds = await getSyncedModelUploadIds();
  const [questions, models, batches] = await Promise.all([
    readDefaultModelRankingQuestions(),
    prisma.modelArtifact.findMany({ where: { id: { in: uploadIds } }, include: { user: true, group: true }, orderBy: { createdAt: "desc" } }),
    prisma.modelTestBatch.findMany({ where: { kind: "RANKING" }, include: { createdBy: true, results: { where: { modelId: { in: uploadIds } }, include: { model: { include: { user: true, group: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const snapshots = await Promise.all(batches.map((batch) => readLeaderboardSnapshot(batch.id)));
  const snapshotMap = new Map(batches.map((batch, index) => [batch.id, snapshots[index] && "version" in snapshots[index]! && snapshots[index]!.version === 2 ? snapshots[index] as LeaderboardSnapshot : null] as const));
  const enabledCount = models.filter((model) => model.enabled).length;
  const questionSummary = summarizeRankingQuestions(questions);

  return <AppShell admin><AdminNav /><div className="grid gap-6"><div className="grid gap-4 md:grid-cols-3"><Card><div className="text-sm text-slate-500">模型总数</div><div className="mt-2 text-3xl font-bold">{models.length}</div></Card><Card><div className="text-sm text-slate-500">启用模型</div><div className="mt-2 text-3xl font-bold">{enabledCount}</div></Card><Card><div className="text-sm text-slate-500">排名题库</div><div className="mt-2 text-sm font-medium leading-6">{questionSummary}</div></Card></div><Card><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-xl font-bold">模型排名</h1><p className="mt-1 text-sm text-slate-500">点击后会按题目顺序执行：先让所有启用模型完成当前题，再由裁判大模型对这一题生成质量排名与报告，然后进入下一题。</p></div><ModelRankingButton /></div></Card><Card><h2 className="text-xl font-bold">参与模型</h2><table className="mt-3"><tbody>{models.map((model) => <tr key={model.id}><td><div className="font-semibold">{model.user.username}</div><div className="text-xs text-slate-500">组别 {model.group?.name ?? "未分组"} · 文件 {model.originalFilename}</div></td><td>{model.enabled ? <span className="text-sm font-medium text-emerald-700">启用</span> : <span className="text-sm font-medium text-slate-500">禁用</span>}</td><td>{formatDate(model.createdAt)}</td></tr>)}{!models.length && <tr><td className="text-sm text-slate-500">暂无模型。</td></tr>}</tbody></table></Card><Card><h2 className="text-xl font-bold">排名批次</h2><div className="mt-4 grid gap-6">{batches.map((batch, index) => { const snapshot = snapshotMap.get(batch.id); const rankings = parseJson<JudgeRanking[]>(batch.judgeRankingsJson) ?? []; return <CollapsiblePanel key={batch.id} defaultExpanded={index === 0} className="rounded-xl border p-4" header={<div><div className="font-semibold">批次 {batch.id}</div><div className="text-xs text-slate-500">创建人 {batch.createdBy.username} · {formatDate(batch.createdAt)}</div><div className="mt-1 text-xs text-slate-500">题库：{batch.question ?? questionSummary}</div></div>} actions={<><StatusBadge status={batch.status} /><span className="text-xs text-slate-500">裁判</span><StatusBadge status={batch.judgeStatus} /><DeleteButton endpoint={`/api/admin/model-tests/${batch.id}`} /></>}><table className="mt-3"><tbody>{batch.results.map((result) => <tr key={result.id}><td><div className="font-medium">{result.model.user.username}</div><div className="text-xs text-slate-500">组别 {result.model.group?.name ?? "未分组"}</div></td><td><StatusBadge status={result.status} /></td><td>{result.durationMs ? `${result.durationMs}ms` : "-"}</td><td className="max-w-md"><div className="truncate text-xs text-slate-500">{result.outputPath ?? result.error ?? "-"}</div>{result.outputPreview && <details className="mt-1 text-xs"><summary className="cursor-pointer text-slate-600">回答预览</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{result.outputPreview}</pre></details>}{result.error && <div className="mt-1 text-xs text-red-600">{result.error}</div>}</td></tr>)}</tbody></table>{snapshot ? <QuestionReportBlock snapshot={snapshot} /> : rankings.length > 0 && <div className="mt-5"><h3 className="font-bold">裁判排名</h3><table className="mt-3"><tbody>{rankings.map((ranking) => <tr key={`${batch.id}-${ranking.modelId}`}><td className="w-16 text-lg font-black">#{ranking.rank}</td><td><div className="font-semibold">{ranking.modelName}</div><div className="text-xs text-slate-500">{ranking.modelId}</div></td><td>{ranking.score == null ? "-" : `${ranking.score} 分`}</td><td className="text-sm text-slate-600">{ranking.reason}</td></tr>)}</tbody></table></div>}{!snapshot && <LegacyReportBlock reportText={batch.judgeReport} />}{batch.judgeError && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{batch.judgeError}</div>}{batch.judgeInputPath && <div className="mt-3 break-all text-xs text-slate-500">裁判输入 JSON：{batch.judgeInputPath}</div>}</CollapsiblePanel>; })}{!batches.length && <p className="text-sm text-slate-500">还没有排名批次。</p>}</div></Card></div></AppShell>;
}
