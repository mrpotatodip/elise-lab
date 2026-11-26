import { z } from "zod";

const ErrorLineSchema = z.object({
  type: z.enum(["result", "system"]),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
});

export const agentErrorText = (log: string, maxChars: number): string => {
  const parts = log.split("\n").flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try {
      const parsed = ErrorLineSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      const { type, subtype, is_error, result } = parsed.data;
      return [
        [type, subtype, is_error ? "error" : undefined, result]
          .filter((part) => part !== undefined && part !== "")
          .join(" "),
      ];
    } catch {
      return [];
    }
  });
  return parts.join("\n").slice(-maxChars);
};
