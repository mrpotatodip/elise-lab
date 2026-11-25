import { failureCodeOf, type ResumeSource } from "#/modules/scan-ledger";
import {
  RESUME_ACTIVE_MESSAGE,
  RESUME_ALREADY_RESUMED_MESSAGE,
  RESUME_CLOUD_MESSAGE,
  RESUME_POOL_SPENT_MESSAGE,
  RESUME_SUCCEEDED_MESSAGE,
  RESUME_ZIP_REMOVED_MESSAGE,
} from "#/modules/scans/constants";

export type ResumeRefusal = { kind: "conflict" | "invalid"; message: string };

export const resumeRefusalOf = (source: ResumeSource): ResumeRefusal | null => {
  if (source.job === null) return { kind: "invalid", message: RESUME_CLOUD_MESSAGE };
  if (source.status === "queued" || source.status === "running")
    return { kind: "conflict", message: RESUME_ACTIVE_MESSAGE };
  if (source.status === "succeeded") return { kind: "conflict", message: RESUME_SUCCEEDED_MESSAGE };
  if (source.status === "failed" && failureCodeOf(source.error) === "budget_spent")
    return { kind: "conflict", message: RESUME_POOL_SPENT_MESSAGE };
  if (source.resumedByScanId !== null)
    return { kind: "conflict", message: `${RESUME_ALREADY_RESUMED_MESSAGE}: ${source.resumedByScanId}` };
  if (source.archive !== null && source.archive.archiveId === null)
    return { kind: "invalid", message: RESUME_ZIP_REMOVED_MESSAGE };
  return null;
};
