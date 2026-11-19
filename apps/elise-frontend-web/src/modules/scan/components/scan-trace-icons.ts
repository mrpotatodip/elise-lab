import { FileText, MessageSquare, Pencil, Search, Terminal, Wrench, type LucideIcon } from "lucide-react";
import type { TraceLabelValue } from "@repo/contracts/elise";

export const TRACE_LABEL_ICON = {
  reasoning: MessageSquare,
  reading_files: FileText,
  searching: Search,
  running_command: Terminal,
  writing: Pencil,
  calling_tool: Wrench,
  phase_started: MessageSquare,
  phase_ended: MessageSquare,
} satisfies Record<TraceLabelValue, LucideIcon>;
