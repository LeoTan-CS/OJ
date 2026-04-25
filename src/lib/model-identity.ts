import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { modelRankingPaths } from "./model-ranking";

export type ModelIdentityMapping = {
  oldId: string;
  newId: string;
};

const modelRankingsRoot = join(/*turbopackIgnore: true*/ process.cwd(), "uploads", "model-rankings");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceModelIdentityText(text: string, mappings: ModelIdentityMapping[]) {
  return mappings.reduce((next, mapping) => {
    if (mapping.oldId === mapping.newId) return next;
    return next.replace(new RegExp(escapeRegExp(mapping.oldId), "g"), mapping.newId);
  }, text);
}

export function replaceModelIdentityValue<T>(value: T, mappings: ModelIdentityMapping[]): T {
  if (typeof value === "string") return replaceModelIdentityText(value, mappings) as T;
  if (Array.isArray(value)) return value.map((item) => replaceModelIdentityValue(item, mappings)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceModelIdentityValue(item, mappings)]),
    ) as T;
  }
  return value;
}

async function rewriteJsonFile(path: string, mappings: ModelIdentityMapping[]) {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return false;
  }
  let nextText: string;
  try {
    nextText = JSON.stringify(replaceModelIdentityValue(JSON.parse(text), mappings), null, 2);
  } catch {
    nextText = replaceModelIdentityText(text, mappings);
  }
  if (nextText === text) return false;
  await writeFile(path, `${nextText}\n`);
  return true;
}

export async function rewriteModelRankingFiles(mappings: ModelIdentityMapping[]) {
  const entries = await readdir(modelRankingsRoot, { withFileTypes: true }).catch(() => []);
  const batchIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const batchId of batchIds) {
    const paths = modelRankingPaths(batchId);
    await Promise.all([
      rewriteJsonFile(paths.judgeInputPath, mappings),
      rewriteJsonFile(paths.leaderboardSnapshotPath, mappings),
    ]);
  }
}
