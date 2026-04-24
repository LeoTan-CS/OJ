import { PrismaClient } from "@prisma/client";

type SubmissionStatus = "PENDING" | "RUNNING" | "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED" | "RUNTIME_ERROR" | "REJECTED";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { validatePythonCode } from "../src/lib/judge";

const prisma = new PrismaClient();
const pollMs = 1000;
const outputLimit = 4000;

function runPython(scriptPath: string, timeoutMs: number): Promise<{ status: SubmissionStatus; stdout: string; stderr: string; durationMs: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("python3", [scriptPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString()).slice(-outputLimit); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-outputLimit); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (signal === "SIGKILL") resolve({ status: "TIME_LIMIT_EXCEEDED", stdout, stderr, durationMs });
      else if (code === 0) resolve({ status: "ACCEPTED", stdout, stderr, durationMs });
      else resolve({ status: "RUNTIME_ERROR", stdout, stderr, durationMs });
    });
  });
}

function wrapper(code: string, functionName: string, args: string, expected: string) {
  return `import json\n\n${code}\n\nargs = json.loads(${JSON.stringify(args)})\nexpected = json.loads(${JSON.stringify(expected)})\nresult = ${functionName}(*args)\nprint(json.dumps({"actual": result, "ok": result == expected}, ensure_ascii=False))\n`;
}

async function judgeSubmission(id: string) {
  const submission = await prisma.submission.findUnique({ where: { id }, include: { problem: { include: { testCases: { orderBy: { sortOrder: "asc" } } } } } });
  if (!submission) return;
  const rejection = validatePythonCode(submission.code);
  if (rejection) {
    await prisma.submission.update({ where: { id }, data: { status: "REJECTED", error: rejection, completedAt: new Date() } });
    return;
  }
  await prisma.submission.update({ where: { id }, data: { status: "RUNNING" } });
  await prisma.submissionCaseResult.deleteMany({ where: { submissionId: id } });
  let passed = 0;
  let totalDuration = 0;
  let finalStatus: SubmissionStatus = "ACCEPTED";
  let finalError: string | null = null;

  for (const testCase of submission.problem.testCases) {
    const dir = await mkdtemp(join(tmpdir(), "bench-oj-"));
    const scriptPath = join(dir, "main.py");
    let status: SubmissionStatus = "ACCEPTED";
    let actual: string | null = null;
    let error: string | null = null;
    let durationMs = 0;
    try {
      JSON.parse(testCase.args);
      JSON.parse(testCase.expected);
      await writeFile(scriptPath, wrapper(submission.code, submission.problem.functionName, testCase.args, testCase.expected));
      const result = await runPython(scriptPath, submission.problem.timeLimitMs);
      durationMs = result.durationMs;
      totalDuration += durationMs;
      if (result.status !== "ACCEPTED") {
        status = result.status;
        error = result.stderr || result.stdout || result.status;
      } else {
        const parsed = JSON.parse(result.stdout.trim());
        actual = JSON.stringify(parsed.actual);
        status = parsed.ok ? "ACCEPTED" : "WRONG_ANSWER";
      }
    } catch (err) {
      status = "RUNTIME_ERROR";
      error = err instanceof Error ? err.message : "Runtime error";
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    if (status === "ACCEPTED") passed += 1;
    else if (finalStatus === "ACCEPTED") {
      finalStatus = status;
      finalError = error;
    }
    await prisma.submissionCaseResult.create({ data: { submissionId: id, testCaseId: testCase.id, status, durationMs, actual, error: error?.slice(0, outputLimit) } });
    if (status === "TIME_LIMIT_EXCEEDED") break;
  }

  const total = submission.problem.testCases.length || 1;
  await prisma.submission.update({ where: { id }, data: { status: finalStatus, score: Math.round((passed / total) * 100), durationMs: totalDuration, error: finalError?.slice(0, outputLimit), completedAt: new Date() } });
}

async function tick() {
  const submission = await prisma.submission.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (submission) await judgeSubmission(submission.id);
}

async function main() {
  console.log("Bench OJ worker started");
  for (;;) {
    try { await tick(); } catch (err) { console.error(err); }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().finally(() => prisma.$disconnect());
