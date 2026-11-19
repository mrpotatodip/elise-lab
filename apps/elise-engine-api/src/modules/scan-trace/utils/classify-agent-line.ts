import { z } from "zod";
import type { TraceLabelValue } from "@repo/contracts/elise";

const ContentBlockSchema = z.object({ type: z.string(), name: z.string().optional() });

const AgentLineSchema = z.object({
  type: z.string(),
  message: z.object({ content: z.array(ContentBlockSchema) }).optional(),
});

const labelOfTool = (name: string | undefined): TraceLabelValue => {
  switch (name?.toLowerCase()) {
    case "read":
    case "glob":
      return "reading_files";
    case "grep":
      return "searching";
    case "bash":
      return "running_command";
    case "write":
    case "edit":
    case "multiedit":
    case "notebookedit":
      return "writing";
    default:
      return "calling_tool";
  }
};

export const classifyAgentLine = (line: string): TraceLabelValue[] => {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return [];
  }
  const parsed = AgentLineSchema.safeParse(json);
  if (!parsed.success || parsed.data.type !== "assistant") return [];
  return (parsed.data.message?.content ?? []).flatMap((block): TraceLabelValue[] => {
    if (block.type === "thinking" || block.type === "text") return ["reasoning"];
    if (block.type === "tool_use") return [labelOfTool(block.name)];
    return [];
  });
};
