import { PrismaClient } from "@prisma/client";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import { toLeaderboardScore, validatePythonCode } from "../src/lib/judge";

type SubmissionStatus = "PENDING" | "RUNNING" | "SCORED" | "INVALID_OUTPUT" | "TIME_LIMIT_EXCEEDED" | "RUNTIME_ERROR" | "REJECTED";
type CsvRow = Record<string, string>;

const prisma = new PrismaClient();
const pollMs = 1000;
const outputLimit = 4000;

function runPython(scriptPath: string, dataDir: string, outputPath: string, timeoutMs: number): Promise<{ status: SubmissionStatus; stdout: string; stderr: string; durationMs: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("python3", [scriptPath, "--data-dir", dataDir, "--output", outputPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString()).slice(-outputLimit); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-outputLimit); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (signal === "SIGKILL") resolve({ status: "TIME_LIMIT_EXCEEDED", stdout, stderr, durationMs });
      else if (code === 0) resolve({ status: "SCORED", stdout, stderr, durationMs });
      else resolve({ status: "RUNTIME_ERROR", stdout, stderr, durationMs });
    });
  });
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

async function readCsv(path: string): Promise<CsvRow[]> {
  const content = await readFile(path, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV must include a header and at least one row");
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
    return row;
  });
}

async function readAnswerFile(path: string): Promise<CsvRow[]> {
  if (extname(path).toLowerCase() !== ".json") return readCsv(path);
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.answers;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("JSON answer file must be a non-empty array or { answers: [...] }");
  return rows.map((row) => {
    if (row == null || typeof row !== "object") throw new Error("Each JSON answer row must be an object");
    const record = row as Record<string, unknown>;
    return { id: String(record.id ?? ""), label: String(record.label ?? "") };
  });
}

function alignRows(answers: CsvRow[], predictions: CsvRow[]) {
  const predictionMap = new Map<string, string>();
  for (const row of predictions) {
    if (!row.id || row.prediction == null) throw new Error("Prediction CSV requires id,prediction columns");
    if (predictionMap.has(row.id)) throw new Error(`Duplicate prediction id: ${row.id}`);
    predictionMap.set(row.id, row.prediction);
  }
  return answers.map((row) => {
    if (!row.id || row.label == null) throw new Error("Answer CSV requires id,label columns");
    const prediction = predictionMap.get(row.id);
    if (prediction == null || prediction === "") throw new Error(`Missing prediction for id: ${row.id}`);
    return { label: row.label, prediction };
  });
}

function score(metric: string, pairs: { label: string; prediction: string }[]) {
  if (!pairs.length) throw new Error("No rows to score");
  if (metric === "accuracy") return pairs.filter((pair) => pair.label === pair.prediction).length / pairs.length;
  if (metric === "macro_f1") {
    const labels = [...new Set(pairs.flatMap((pair) => [pair.label, pair.prediction]))];
    const f1Values = labels.map((label) => {
      let tp = 0, fp = 0, fn = 0;
      for (const pair of pairs) {
        if (pair.prediction === label && pair.label === label) tp += 1;
        else if (pair.prediction === label) fp += 1;
        else if (pair.label === label) fn += 1;
      }
      const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
      const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
      return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    });
    return f1Values.reduce((sum, value) => sum + value, 0) / f1Values.length;
  }
  const numeric = pairs.map((pair) => ({ label: Number(pair.label), prediction: Number(pair.prediction) }));
  if (numeric.some((pair) => Number.isNaN(pair.label) || Number.isNaN(pair.prediction))) throw new Error(`${metric} requires numeric labels and predictions`);
  if (metric === "mae") return numeric.reduce((sum, pair) => sum + Math.abs(pair.prediction - pair.label), 0) / numeric.length;
  if (metric === "rmse") return Math.sqrt(numeric.reduce((sum, pair) => sum + (pair.prediction - pair.label) ** 2, 0) / numeric.length);
  throw new Error(`Unsupported metric: ${metric}`);
}

async function judgeSubmission(id: string) {
  const submission = await prisma.submission.findUnique({ where: { id }, include: { competition: true } });
  if (!submission) return;
  const rejection = validatePythonCode(submission.code);
  if (rejection) {
    await prisma.submission.update({ where: { id }, data: { status: "REJECTED", error: rejection, completedAt: new Date() } });
    return;
  }
  await prisma.submission.update({ where: { id }, data: { status: "RUNNING" } });
  const dir = await mkdtemp(join(tmpdir(), "bench-ai-"));
  const scriptPath = join(dir, "main.py");
  const outputPath = join(dir, "predictions.csv");
  try {
    await writeFile(scriptPath, submission.code);
    const result = await runPython(scriptPath, submission.competition.hiddenTestDataDir, outputPath, submission.competition.runtimeLimitMs);
    if (result.status !== "SCORED") {
      await prisma.submission.update({ where: { id }, data: { status: result.status, durationMs: result.durationMs, error: (result.stderr || result.stdout || result.status).slice(0, outputLimit), completedAt: new Date() } });
      return;
    }
    const [answers, predictions] = await Promise.all([readAnswerFile(submission.competition.answerCsvPath), readCsv(outputPath)]);
    const pairs = alignRows(answers, predictions);
    const metricValue = score(submission.competition.metric, pairs);
    await prisma.submission.update({ where: { id }, data: { status: "SCORED", metricValue, leaderboardScore: toLeaderboardScore(submission.competition.metric, metricValue), durationMs: result.durationMs, outputPreview: (await readFile(outputPath, "utf8")).slice(0, outputLimit), error: result.stderr.slice(0, outputLimit) || null, completedAt: new Date() } });
  } catch (err) {
    await prisma.submission.update({ where: { id }, data: { status: "INVALID_OUTPUT", error: (err instanceof Error ? err.message : "Invalid output").slice(0, outputLimit), completedAt: new Date() } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function tick() {
  const submission = await prisma.submission.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (submission) await judgeSubmission(submission.id);
}

async function main() {
  console.log("Bench AI leaderboard worker started");
  for (;;) {
    try { await tick(); } catch (err) { console.error(err); }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().finally(() => prisma.$disconnect());
