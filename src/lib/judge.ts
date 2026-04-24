export const forbiddenTokens = [
  "eval(", "exec(", "compile(", "__import__", "subprocess", "os.", "sys.", "socket", "pathlib", "shutil", "globals(", "locals(", "input(", "breakpoint(",
];

export const competitionMetrics = ["accuracy", "macro_f1", "rmse", "mae"] as const;
export type CompetitionMetric = (typeof competitionMetrics)[number];

export function validatePythonCode(code: string) {
  const compact = code.replace(/\s+/g, " ");
  const hit = forbiddenTokens.find((token) => compact.includes(token));
  return hit ? `Forbidden Python capability: ${hit.trim()}` : null;
}

export function isErrorMetric(metric: string) {
  return metric === "rmse" || metric === "mae";
}

export function toLeaderboardScore(metric: string, value: number) {
  return isErrorMetric(metric) ? -value : value;
}

export function formatMetricName(metric: string) {
  const labels: Record<string, string> = { accuracy: "Accuracy", macro_f1: "Macro F1", rmse: "RMSE", mae: "MAE" };
  return labels[metric] ?? metric;
}

export function formatMetricValue(value: number | null | undefined) {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
