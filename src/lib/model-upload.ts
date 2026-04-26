import { createWriteStream } from "node:fs";
import { access, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname, join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const execFileAsync = promisify(execFile);

export const modelUploadsRoot = join(/*turbopackIgnore: true*/ process.cwd(), "uploads", "models");
export const modelRuntimeLimitMs = Math.min(Number(process.env.MODEL_TEST_TIMEOUT_MS ?? 300000), 300000);

export function assertModelStorageId(id: string) {
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error("模型目录名包含不支持的路径字符");
}

export function modelStoragePaths(id: string) {
  assertModelStorageId(id);
  const root = join(/*turbopackIgnore: true*/ process.cwd(), "uploads", "models", id);
  return { root, archivePath: join(root, "model.zip"), packageDir: join(root, "package"), runsDir: join(root, "runs") };
}

export async function renameModelUpload(oldId: string, newId: string) {
  if (oldId === newId) return null;
  const oldPaths = modelStoragePaths(oldId);
  const newPaths = modelStoragePaths(newId);
  try {
    await access(oldPaths.root);
  } catch {
    return null;
  }
  try {
    await access(newPaths.root);
    throw new Error("新模型目录已存在，请换一个名称或联系管理员处理旧目录");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await rename(oldPaths.root, newPaths.root);
  return { oldPaths, newPaths };
}

function stagedModelStoragePaths(id: string) {
  assertModelStorageId(id);
  const root = join(/*turbopackIgnore: true*/ process.cwd(), "uploads", "models", ".incoming", id);
  return { root, archivePath: join(root, "model.zip"), packageDir: join(root, "package"), runsDir: join(root, "runs") };
}

export function modelRunPaths(modelId: string, batchId: string) {
  const runDir = join(modelStoragePaths(modelId).runsDir, batchId);
  return { runDir, outputPath: join(runDir, "answers.json") };
}

export async function modelUploadExists(id: string) {
  const paths = modelStoragePaths(id);
  await access(paths.packageDir);
  return true;
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isIgnoredPackageEntry(name: string) {
  return name === "__MACOSX" || name === ".DS_Store" || name.startsWith("._");
}

async function findMainPyFiles(root: string) {
  const found: string[] = [];

  async function walk(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (isIgnoredPackageEntry(entry.name)) return;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        return;
      }
      if (entry.isFile() && entry.name === "main.py") found.push(path);
    }));
  }

  await walk(root);
  return found;
}

async function findEntrypointInPackageDir(packageDir: string) {
  const topLevelEntrypoint = join(packageDir, "main.py");
  if (await pathExists(topLevelEntrypoint)) return topLevelEntrypoint;

  const entries = await readdir(packageDir, { withFileTypes: true });
  const packageEntries = entries.filter((entry) => !isIgnoredPackageEntry(entry.name));
  if (packageEntries.length === 1 && packageEntries[0].isDirectory()) {
    const nestedEntrypoint = join(packageDir, packageEntries[0].name, "main.py");
    if (await pathExists(nestedEntrypoint)) return nestedEntrypoint;
  }

  const candidates = await findMainPyFiles(packageDir);
  if (candidates.length === 1) return candidates[0];
  throw new Error(`模型目录缺少可唯一识别的 main.py: ${packageDir}`);
}

export async function readModelUploadMetadata(id: string) {
  const paths = modelStoragePaths(id);
  await modelUploadExists(id);
  const [packageStats, archiveExists, entrypointPath] = await Promise.all([
    stat(paths.packageDir),
    pathExists(paths.archivePath),
    findEntrypointInPackageDir(paths.packageDir),
  ]);
  const archiveStats = archiveExists ? await stat(paths.archivePath) : null;

  return {
    ...paths,
    archivePath: archiveExists ? paths.archivePath : "",
    originalFilename: archiveExists ? basename(paths.archivePath) : `${id}.zip`,
    entrypointPath,
    workingDir: dirname(entrypointPath),
    createdAt: archiveStats?.mtime ?? packageStats.mtime,
  };
}

export async function existingModelUploadIds() {
  const entries = await readdir(modelUploadsRoot, { withFileTypes: true }).catch(() => []);
  const ids = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      await modelUploadExists(entry.name);
      return entry.name;
    } catch {
      return null;
    }
  }));
  return ids.filter((id): id is string => Boolean(id));
}

export function getModelFile(formData: FormData) {
  const value = formData.get("modelFile");
  if (!value || typeof value === "string") return null;
  return value.size > 0 ? value : null;
}

export const modelNameMaxLength = 120;

export function normalizeModelName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  if (name.length > modelNameMaxLength) throw new Error(`模型名称不能超过 ${modelNameMaxLength} 个字符`);
  if (/[\u0000-\u001F\u007F]/.test(name)) throw new Error("模型名称不能包含控制字符");
  return name;
}

export function modelNameOrFallback(value: unknown, fallback: string) {
  return normalizeModelName(value) ?? normalizeModelName(fallback) ?? "模型";
}

export function defaultModelNameFromFilename(filename: string) {
  return modelNameOrFallback(basename(filename).replace(/\.zip$/i, "").slice(0, modelNameMaxLength), "模型");
}

export function parseModelName(formData: FormData, fallback: string) {
  return modelNameOrFallback(formData.get("modelName") ?? formData.get("name"), fallback);
}

function assertZipFilename(filename: string) {
  if (!filename.toLowerCase().endsWith(".zip")) throw new Error("请上传 .zip 格式的模型压缩包");
}

function assertZipFile(file: File) {
  assertZipFilename(file.name);
}

function isUnsafeZipEntry(entry: string) {
  if (!entry || entry.startsWith("/") || /^[A-Za-z]:/.test(entry)) return true;
  return entry.split(/[\\/]+/).some((part) => part === "..");
}

function findEntrypoint(entries: string[]) {
  const packageEntries = entries.filter((entry) => !entry.startsWith("__MACOSX/") && !entry.split("/").some((part) => part === ".DS_Store"));
  if (packageEntries.includes("main.py")) return "main.py";
  const files = packageEntries.filter((entry) => !entry.endsWith("/"));
  const roots = new Set(files.map((entry) => entry.split("/")[0]).filter(Boolean));
  if (roots.size === 1) {
    const [root] = Array.from(roots);
    const candidate = `${root}/main.py`;
    if (entries.includes(candidate)) return candidate;
  }
  return null;
}

async function listZipEntries(path: string) {
  const { stdout } = await execFileAsync("unzip", ["-Z", "-1", path], { maxBuffer: 1024 * 1024 * 4 });
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function extractZip(path: string, destination: string) {
  await execFileAsync("unzip", ["-q", path, "-d", destination], { maxBuffer: 1024 * 1024 * 4 });
}

async function prepareModelUpload(id: string) {
  const paths = stagedModelStoragePaths(id);
  await rm(paths.root, { recursive: true, force: true });
  await mkdir(paths.packageDir, { recursive: true });
  return paths;
}

async function validateAndExtractModelUpload(paths: ReturnType<typeof modelStoragePaths>) {
  const entries = await listZipEntries(paths.archivePath);
  if (entries.length === 0) throw new Error("模型压缩包为空");
  const unsafe = entries.find(isUnsafeZipEntry);
  if (unsafe) throw new Error(`模型压缩包包含不安全路径: ${unsafe}`);
  const entrypoint = findEntrypoint(entries);
  if (!entrypoint) throw new Error("模型压缩包中必须包含顶层 main.py，或单一根目录下的 main.py");

  await extractZip(paths.archivePath, paths.packageDir);
  return { ...paths, entrypointPath: join(paths.packageDir, entrypoint), workingDir: dirname(join(paths.packageDir, entrypoint)) };
}

async function commitModelUpload(id: string, staged: Awaited<ReturnType<typeof validateAndExtractModelUpload>>) {
  const paths = modelStoragePaths(id);
  const entrypointRelativePath = relative(staged.packageDir, staged.entrypointPath);

  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.runsDir, { recursive: true });
  await rm(paths.archivePath, { force: true });
  await rm(paths.packageDir, { recursive: true, force: true });
  await rename(staged.packageDir, paths.packageDir);
  await rm(staged.root, { recursive: true, force: true });

  const entrypointPath = join(paths.packageDir, entrypointRelativePath);
  return { ...paths, archivePath: "", entrypointPath, workingDir: dirname(entrypointPath) };
}

export async function saveModelUpload(id: string, file: File) {
  assertZipFile(file);
  const paths = await prepareModelUpload(id);
  try {
    await writeFile(paths.archivePath, Buffer.from(await file.arrayBuffer()));
    return await commitModelUpload(id, await validateAndExtractModelUpload(paths));
  } catch (error) {
    await rm(paths.root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function saveModelUploadStream(id: string, filename: string, stream: ReadableStream<Uint8Array>) {
  assertZipFilename(filename);
  const paths = await prepareModelUpload(id);
  try {
    await pipeline(Readable.fromWeb(stream as NodeReadableStream<Uint8Array>), createWriteStream(paths.archivePath));
    return await commitModelUpload(id, await validateAndExtractModelUpload(paths));
  } catch (error) {
    await rm(paths.root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removeModelUpload(id: string) {
  await rm(modelStoragePaths(id).root, { recursive: true, force: true });
}
