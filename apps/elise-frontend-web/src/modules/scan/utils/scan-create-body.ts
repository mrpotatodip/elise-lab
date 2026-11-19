import { DEFAULT_SOURCE_PROVIDER } from "@repo/contracts/elise";
import type { CreateScanInput } from "../schemas";

type ScanCreateBody = Omit<CreateScanInput, "runnerId" | "provider" | "archiveId"> & {
  provider?: CreateScanInput["provider"];
  archive_id?: string;
  runner_id: string | undefined;
};

// -----
// The body of POST /scans. The engine names its fields
// runner_id and archive_id, like max_budget_usd. A github plan
// sends no provider, which the engine reads as github, so an
// engine from before providers takes it unchanged. An upload
// plan names its zip by id.
// -----
export function scanCreateBodyOf(input: CreateScanInput): ScanCreateBody {
  const { runnerId, provider, archiveId, ...scan } = input;
  const body: ScanCreateBody = { ...scan, runner_id: runnerId };
  if (provider !== undefined && provider !== DEFAULT_SOURCE_PROVIDER) body.provider = provider;
  if (archiveId !== undefined) body.archive_id = archiveId;
  return body;
}

// -----
// Why the engine would not start a Scan, for the person: the
// engine names the request field first ("runner_id: ..."), which
// means nothing on screen, so it is cut and the reason starts
// with a capital. An older Runner asked for an upload Scan reads
// "This Runner cannot read uploaded zips. Update ...".
// -----
export function scanStartProblem(message: string): string {
  const reason = message.replace(/^[a-z_]+: /, "");
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
