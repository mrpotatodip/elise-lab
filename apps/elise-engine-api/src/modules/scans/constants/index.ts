import { z } from "zod";
import { DEFAULT_SOURCE_PROVIDER_ID, SOURCE_PROVIDER_IDS } from "#/providers/registry";

// -----
// Where the repo lives. Only providers with a line in the
// registry are accepted; a request without one is github
// (repoIdentityOf), so a client from before providers keeps
// working.
// -----
export const SCANS_PROVIDER = z.enum(SOURCE_PROVIDER_IDS).optional().meta({
  example: DEFAULT_SOURCE_PROVIDER_ID,
  description: "Where the repository lives. Leave it out for github. A gitlab or gitlab-sh Scan runs only on a Runner.",
});
// -----
// A provider without cloud Scans (gitlab, gitlab-sh) has no
// token on our side: its Scans clone on a Runner, with the
// person's own git login (ADR 0008).
// -----
export const SCANS_RUNNER_ONLY_MESSAGE =
  "runner_id: Scans of this provider run only on a Runner, which clones with your own git login. Pick a connected Runner.";
export const SCANS_SCOPE_RUNNER_ONLY_MESSAGE =
  "scope_paths: a Scan of some folders runs only on a Runner. Pick a connected Runner, or leave the folders out.";
// -----
// A ref reaches git as an argument, so it cannot start
// with a dash, and it holds only what a branch, tag or
// commit name needs.
// -----
export const SCANS_GIT_REF = /^[\w][\w./-]{0,99}$/;
export const SCANS_SCAN_ID_PATTERN = /^[\w-]{1,100}$/;

// -----
// Why a Scan cannot be resumed (ADR 0016). The dashboard shows
// these words as they are.
// -----
export const RESUME_CLOUD_MESSAGE = "Only a Scan that ran on a Runner can be resumed. Start a new Scan.";
export const RESUME_ACTIVE_MESSAGE = "This Scan is still active. Stop it or wait for it to end before resuming it.";
export const RESUME_SUCCEEDED_MESSAGE = "This Scan succeeded, so there is nothing to resume.";
export const RESUME_POOL_SPENT_MESSAGE =
  "This Scan spent its whole Budget cap, so there is no money left to resume with. Start a new Scan with a bigger profile.";
export const RESUME_ALREADY_RESUMED_MESSAGE = "This Scan was already resumed as another Scan";
export const RESUME_ZIP_REMOVED_MESSAGE =
  "The zip this Scan read was removed, so it cannot be resumed. Upload it again.";
export const RESUME_RUNNER_GONE_MESSAGE =
  "A Scan can only resume on the Runner that ran it, and that Runner was removed. Start a new Scan.";

// -----
// Listing and limits
// -----
export const SCANS_PAGE_SIZE = 50;
