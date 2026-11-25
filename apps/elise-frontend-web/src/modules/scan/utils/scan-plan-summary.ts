import { SCAN_MODEL_OPTIONS, SCAN_PROFILE_OPTIONS } from "../constants";
import { CreateScanInputSchema, type CreateScanInput } from "../schemas";
import { scanRepoName } from "./scan-repo-name";
import { scanScopeSentence } from "./scan-scope-paths";

const labelOf = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export function scanPlanSummary(input: CreateScanInput, runnerName?: string, archiveLabel?: string) {
  if (!CreateScanInputSchema.safeParse(input).success) return null;
  const { owner, name } = scanRepoName(input.repo, input.repo);
  const profile = labelOf(SCAN_PROFILE_OPTIONS, input.profile).toLowerCase();
  const model = labelOf(SCAN_MODEL_OPTIONS, input.model);
  const where = runnerName === undefined ? "" : ` It runs on ${runnerName}, with that computer's own Claude.`;
  const source = archiveLabel ? ` (zip ${archiveLabel})` : input.ref ? ` (branch ${input.ref})` : "";
  const scopeSentence = scanScopeSentence(input.scopePaths);
  const scope = scopeSentence === null ? "" : ` ${scopeSentence}`;
  return `You're about to run a ${profile} audit of ${owner ? `${owner}/${name}` : name}${source} with ${model}.${where}${scope} You'll land on the report page, where progress updates on its own.`;
}
