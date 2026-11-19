import { z } from "zod";

const ErrorLineSchema = z.object({
  type: z.enum(["result", "system"]),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
});

// -----
// The text of a failed run's error, from the agent's stream-json log:
// only the `result` and `system` lines count. A tool result or an
// assistant message can hold the repo's file contents, and this text
// ends in scans.error, so those lines never go in. A line that is not
// JSON is skipped for the same reason.
// -----
export const agentErrorText = (log: string, maxChars: number): string => {
  const parts = log.split("\n").flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try {
      const parsed = ErrorLineSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      const { type, subtype, is_error, result } = parsed.data;
      return [[type, subtype, is_error ? "error" : undefined, result].filter((part) => part !== undefined && part !== "").join(" ")];
    } catch {
      return [];
    }
  });
  return parts.join("\n").slice(-maxChars);
};
