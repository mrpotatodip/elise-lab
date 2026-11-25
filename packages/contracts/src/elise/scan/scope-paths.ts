export const SCAN_SCOPE_PATHS_MAX = 10;
export const SCAN_SCOPE_PATH_MAX_LENGTH = 200;

const SCOPE_PATH_PART = /^[A-Za-z0-9_@+=~][A-Za-z0-9_.@+=~-]*$|^\.[A-Za-z0-9_@+=~][A-Za-z0-9_.@+=~-]*$/;

export type ScopePathsCheck = { ok: true; paths: string[] } | { ok: false; message: string };

const SHOWN_ENTRY_LENGTH = 40;

const shownEntry = (raw: string): string => {
  const flat = raw.trim().replace(/\s+/g, " ");
  return flat.length > SHOWN_ENTRY_LENGTH ? `${flat.slice(0, SHOWN_ENTRY_LENGTH)}…` : flat;
};

const refusalOf = (path: string): string | null => {
  if (path.length > SCAN_SCOPE_PATH_MAX_LENGTH)
    return `it is longer than ${SCAN_SCOPE_PATH_MAX_LENGTH} characters. Use a shorter path.`;
  if (path === ".") return "it is the whole repository. Leave the list empty to scan everything.";
  if (path.includes("\\")) return "it has a backslash. Separate folders with /, like src/api.";
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path))
    return "it starts at the computer's root. Write it from the repository's root, like src/api.";
  if (path.startsWith("-"))
    return "a folder name can't start with a dash. Pick a folder that does not, or the one above it.";
  const parts = path.split("/");
  if (parts.includes("..")) return "it points outside the repository. Write it from the repository's root, without ..";
  if (parts.some((part) => part === "")) return "it has a double slash. Use one / between folders.";
  if (parts.some((part) => part === ".")) return "it has a lone . in it. Write the path without the ./ parts.";
  if (!parts.every((part) => SCOPE_PATH_PART.test(part)))
    return "it has a character that is not allowed. Use folder names without spaces or special characters, written from the repository's root.";
  return null;
};

export const normalizeScopePath = (path: string): string =>
  path
    .trim()
    .replace(/^(\.\/)+(?=.)/, "")
    .replace(/(?<=.)\/+$/, "");

export const checkScopePaths = (paths: readonly string[]): ScopePathsCheck => {
  if (paths.length > SCAN_SCOPE_PATHS_MAX)
    return {
      ok: false,
      message: `Too many folders: at most ${SCAN_SCOPE_PATHS_MAX}, and ${paths.length} were given. Remove some, or leave the list empty to scan everything.`,
    };
  const kept: string[] = [];
  for (const raw of paths) {
    const path = normalizeScopePath(raw);
    if (path === "")
      return { ok: false, message: "An empty entry can't be used: remove it or write a folder on that line." };
    const refusal = refusalOf(path);
    if (refusal !== null) return { ok: false, message: `"${shownEntry(raw)}" can't be used: ${refusal}` };
    if (kept.includes(path))
      return {
        ok: false,
        message: `"${shownEntry(path)}" can't be used: it is in the list twice. Remove one of them.`,
      };
    kept.push(path);
  }
  return { ok: true, paths: kept };
};
