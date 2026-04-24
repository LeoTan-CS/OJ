export const forbiddenTokens = [
  "import ", "from ", "open(", "eval(", "exec(", "compile(", "__import__", "subprocess", "os.", "sys.", "socket", "pathlib", "shutil", "globals(", "locals(", "input(", "breakpoint(",
];

export function validatePythonCode(code: string) {
  const compact = code.replace(/\s+/g, " ");
  const hit = forbiddenTokens.find((token) => compact.includes(token));
  return hit ? `Forbidden Python capability: ${hit.trim()}` : null;
}

export function safeJsonParse(value: string) {
  return JSON.parse(value);
}

export function normalizeJson(value: unknown) {
  return JSON.stringify(value);
}
