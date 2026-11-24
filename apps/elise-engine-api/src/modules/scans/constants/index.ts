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
// -----
// A ref reaches git as an argument, so it cannot start
// with a dash, and it holds only what a branch, tag or
// commit name needs.
// -----
export const SCANS_GIT_REF = /^[\w][\w./-]{0,99}$/;
export const SCANS_SCAN_ID_PATTERN = /^[\w-]{1,100}$/;

// -----
// Listing and limits
// -----
export const SCANS_PAGE_SIZE = 50;
