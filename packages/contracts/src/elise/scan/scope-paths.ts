export const SCAN_SCOPE_PATHS_MAX = 10;
export const SCAN_SCOPE_PATH_MAX_LENGTH = 200;

const SCOPE_PATH_PART = /^[A-Za-z0-9_@+=~][A-Za-z0-9_.@+=~-]*$|^\.[A-Za-z0-9_@+=~][A-Za-z0-9_.@+=~-]*$/;

export type ScopePathsCheck = { ok: true; paths: string[] } | { ok: false; message: string };

const refusalOf = (path: string): string | null => {
  if (path === "") return "an empty entry";
  if (path.length > SCAN_SCOPE_PATH_MAX_LENGTH) return `too long (at most ${SCAN_SCOPE_PATH_MAX_LENGTH} characters)`;
  if (path === "." || path === "./") return "the repository's root: leave the list empty to scan everything";
  if (path.includes("\\")) return "a backslash: write folders with /";
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path))
    return "an absolute path: write it relative to the repository's root";
  if (path.startsWith("-")) return "a name that starts with -";
  const parts = path.split("/");
  if (parts.includes("..")) return "a .. part, which would leave the repository";
  if (parts.some((part) => part === "")) return "an empty part (a double /)";
  if (parts.some((part) => part === ".")) return "a . part";
  if (!parts.every((part) => SCOPE_PATH_PART.test(part)))
    return "a character other than letters, digits and . _ - @ + = ~ (no globs or spaces)";
  return null;
};

export const normalizeScopePath = (path: string): string =>
  path
    .trim()
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");

export const checkScopePaths = (paths: readonly string[]): ScopePathsCheck => {
  if (paths.length > SCAN_SCOPE_PATHS_MAX)
    return { ok: false, message: `at most ${SCAN_SCOPE_PATHS_MAX} folders, and ${paths.length} were given` };
  const kept: string[] = [];
  for (const raw of paths) {
    const path = normalizeScopePath(raw);
    const refusal = refusalOf(path);
    if (refusal !== null)
      return { ok: false, message: `"${raw.trim()}" is not a folder of the repository: ${refusal}` };
    if (kept.includes(path)) return { ok: false, message: `"${path}" is in the list twice` };
    kept.push(path);
  }
  return { ok: true, paths: kept };
};
