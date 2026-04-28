"use client";

import { useMemo, useState } from "react";
import type { LeaderboardBatch, LeaderboardBatchEntry, LeaderboardTotalEntry } from "@/lib/model-leaderboard";
import { Card, ModelIdentity } from "./ui";

type BatchSortKey = "qualityAverage" | "timeAverage" | "memoryAverage" | "totalScore";
type TotalSortKey = "modelName" | "totalScore" | `test:${string}`;
type SortDirection = "desc" | "asc";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function formatAverage(value: number) {
  return value.toFixed(2).replace(/\.00$/, "");
}

function rowClassName(isCurrentUser: boolean | undefined) {
  return isCurrentUser ? "bg-emerald-50 font-semibold text-slate-950" : undefined;
}

function compareValues(left: string | number | null, right: string | number | null, direction: SortDirection) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return direction === "asc" ? left - right : right - left;
  return direction === "asc" ? String(left).localeCompare(String(right), "zh-CN") : String(right).localeCompare(String(left), "zh-CN");
}

function defaultSortDirection(sortKey: string): SortDirection {
  return sortKey === "modelName" ? "asc" : "desc";
}

function nextSortDirection(currentKey: string, nextKey: string, currentDirection: SortDirection) {
  return currentKey === nextKey ? (currentDirection === "asc" ? "desc" : "asc") : defaultSortDirection(nextKey);
}

function sortBatchEntries(entries: LeaderboardBatchEntry[], sortKey: BatchSortKey, direction: SortDirection) {
  return [...entries].sort((left, right) =>
    compareValues(left[sortKey], right[sortKey], direction)
    || compareValues(right.totalScore, left.totalScore, "asc")
  );
}

function totalBatchScore(entry: LeaderboardTotalEntry, batchId: string) {
  return entry.details.find((detail) => detail.batchId === batchId)?.totalScore ?? null;
}

function totalSortValue(entry: LeaderboardTotalEntry, sortKey: TotalSortKey) {
  if (sortKey === "modelName" || sortKey === "totalScore") return entry[sortKey];
  if (sortKey.startsWith("test:")) return totalBatchScore(entry, sortKey.slice(5));
  return null;
}

function sortTotalEntries(entries: LeaderboardTotalEntry[], sortKey: TotalSortKey, direction: SortDirection) {
  return [...entries].sort((left, right) =>
    compareValues(totalSortValue(left, sortKey), totalSortValue(right, sortKey), direction)
    || compareValues(right.totalScore, left.totalScore, "asc")
    || compareValues(left.modelName, right.modelName, "asc")
  );
}

function SortHeader<SortKey extends string>({
  activeSortKey,
  direction,
  label,
  onSort,
  sortKey,
  title,
}: {
  activeSortKey: SortKey;
  direction: SortDirection;
  label: string;
  onSort: (sortKey: SortKey) => void;
  sortKey: SortKey;
  title?: string;
}) {
  const isActive = activeSortKey === sortKey;
  const indicator = isActive ? (direction === "asc" ? "↑" : "↓") : "↕";
  return (
    <th aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"} title={title}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 rounded-md text-left font-bold text-slate-600 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span>{label}</span>
        <span aria-hidden="true" className={isActive ? "text-slate-950" : "text-slate-400"}>{indicator}</span>
      </button>
    </th>
  );
}

export function ModelLeaderboardView({ batches, totals }: { batches: LeaderboardBatch[]; totals: LeaderboardTotalEntry[] }) {
  const [activeTab, setActiveTab] = useState<"batch" | "total">("batch");
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.batchId ?? "");
  const [batchSortKey, setBatchSortKey] = useState<BatchSortKey>("totalScore");
  const [batchSortDirection, setBatchSortDirection] = useState<SortDirection>("desc");
  const [totalSortKey, setTotalSortKey] = useState<TotalSortKey>("totalScore");
  const [totalSortDirection, setTotalSortDirection] = useState<SortDirection>("desc");

  const selectedBatch = batches.find((batch) => batch.batchId === selectedBatchId) ?? batches[0] ?? null;
  const totalBatches = useMemo(
    () => [...batches].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.batchId.localeCompare(right.batchId, "zh-CN")),
    [batches]
  );
  const sortedBatchEntries = useMemo(
    () => selectedBatch ? sortBatchEntries(selectedBatch.entries, batchSortKey, batchSortDirection) : [],
    [selectedBatch, batchSortKey, batchSortDirection]
  );
  const sortedTotals = useMemo(
    () => sortTotalEntries(totals, totalSortKey, totalSortDirection),
    [totals, totalSortKey, totalSortDirection]
  );
  const handleBatchSort = (sortKey: BatchSortKey) => {
    setBatchSortDirection((currentDirection) => nextSortDirection(batchSortKey, sortKey, currentDirection));
    setBatchSortKey(sortKey);
  };
  const handleTotalSort = (sortKey: TotalSortKey) => {
    setTotalSortDirection((currentDirection) => nextSortDirection(totalSortKey, sortKey, currentDirection));
    setTotalSortKey(sortKey);
  };

  if (!batches.length) {
    return <Card><h2 className="text-xl font-bold">模型排行榜</h2><p className="mt-3 text-sm text-slate-500">还没有完成的模型排名批次，暂无可展示榜单。</p></Card>;
  }

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">模型排行榜</h2>
            <p className="mt-1 text-sm text-slate-500">次榜看单次批次的三项均分，总榜按测试批次展开每次得分和最终得分。</p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button type="button" onClick={() => setActiveTab("batch")} className={activeTab === "batch" ? "rounded-lg bg-white px-3 py-2 text-slate-950 shadow-sm" : "rounded-lg px-3 py-2 text-slate-600"}>次榜</button>
            <button type="button" onClick={() => setActiveTab("total")} className={activeTab === "total" ? "rounded-lg bg-white px-3 py-2 text-slate-950 shadow-sm" : "rounded-lg px-3 py-2 text-slate-600"}>总榜</button>
          </div>
        </div>
      </Card>

      {activeTab === "batch" && selectedBatch && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">次榜</h3>
              <p className="mt-1 text-sm text-slate-500">批次 {selectedBatch.batchId} · {selectedBatch.questionCount} 题 · 完成于 {formatDate(selectedBatch.judgeCompletedAt ?? selectedBatch.completedAt)}</p>
              {selectedBatch.questionSummary && <p className="mt-2 text-sm leading-6 text-slate-600">题库：{selectedBatch.questionSummary}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                <span>批次</span>
                <select value={selectedBatch.batchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
                  {batches.map((batch) => <option key={batch.batchId} value={batch.batchId}>{batch.batchId} · {formatDate(batch.createdAt)}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>模型</th>
                  <SortHeader activeSortKey={batchSortKey} direction={batchSortDirection} label="质量均分" onSort={handleBatchSort} sortKey="qualityAverage" />
                  <SortHeader activeSortKey={batchSortKey} direction={batchSortDirection} label="时间均分" onSort={handleBatchSort} sortKey="timeAverage" />
                  <SortHeader activeSortKey={batchSortKey} direction={batchSortDirection} label="空间均分" onSort={handleBatchSort} sortKey="memoryAverage" />
                  <SortHeader activeSortKey={batchSortKey} direction={batchSortDirection} label="本次得分" onSort={handleBatchSort} sortKey="totalScore" />
                </tr>
              </thead>
              <tbody>
                {sortedBatchEntries.map((entry, index) => (
                  <tr key={`${selectedBatch.batchId}-${entry.modelId}`} className={rowClassName(entry.isCurrentUser)}>
                    <td className="font-bold text-slate-900">#{index + 1}</td>
                    <td><ModelIdentity modelName={entry.modelName} username={entry.username} /></td>
                    <td>{formatAverage(entry.qualityAverage)}</td>
                    <td>{formatAverage(entry.timeAverage)}</td>
                    <td>{formatAverage(entry.memoryAverage)}</td>
                    <td className="font-bold text-slate-950">{formatAverage(entry.totalScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === "total" && (
        <Card>
          <div>
            <h3 className="text-lg font-bold">总榜</h3>
            <p className="mt-1 text-sm text-slate-500">列按批次创建时间展开为测试1、测试2、测试3……，最右侧显示最终得分。</p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <SortHeader activeSortKey={totalSortKey} direction={totalSortDirection} label="模型" onSort={handleTotalSort} sortKey="modelName" />
                  {totalBatches.map((batch, index) => (
                    <SortHeader
                      key={batch.batchId}
                      activeSortKey={totalSortKey}
                      direction={totalSortDirection}
                      label={`测试${index + 1}`}
                      onSort={handleTotalSort}
                      sortKey={`test:${batch.batchId}`}
                      title={`${batch.batchId} · ${formatDate(batch.createdAt)}`}
                    />
                  ))}
                  <SortHeader activeSortKey={totalSortKey} direction={totalSortDirection} label="最终得分" onSort={handleTotalSort} sortKey="totalScore" />
                </tr>
              </thead>
              <tbody>
                {sortedTotals.map((entry, index) => (
                  <tr key={entry.modelId} className={rowClassName(entry.isCurrentUser)}>
                    <td className="font-bold text-slate-900">#{index + 1}</td>
                    <td><ModelIdentity modelName={entry.modelName} username={entry.username} /></td>
                    {totalBatches.map((batch) => {
                      const score = totalBatchScore(entry, batch.batchId);
                      return <td key={`${entry.modelId}-${batch.batchId}`}>{score == null ? "-" : formatAverage(score)}</td>;
                    })}
                    <td className="font-bold text-slate-950">{formatAverage(entry.totalScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
