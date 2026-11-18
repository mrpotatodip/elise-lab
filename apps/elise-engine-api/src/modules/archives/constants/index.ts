import {
  UPLOAD_ARCHIVE_TOO_LARGE_MESSAGE,
  UPLOAD_PATH_TOO_DEEP_MESSAGE,
  UPLOAD_STORAGE_FULL_MESSAGE,
  UPLOAD_TOO_MANY_ARCHIVES_MESSAGE,
  UPLOAD_TOO_MANY_FILES_MESSAGE,
  UPLOAD_UNPACKED_TOO_LARGE_MESSAGE,
} from "@repo/contracts/elise";

export const MB = 1024 * 1024;
export const DAY_MS = 24 * 60 * 60 * 1000;

// -----
// The daily sweep. It deletes at most RETENTION_BATCH expired
// zips a run (one R2 delete call), and looks for objects with no
// row under ORPHAN_SWEEP_APPS upload apps picked at random, so
// every app is looked at in time without one run listing them
// all. An object with no row is left alone for ORPHAN_MIN_AGE_MS:
// its upload may still be committing.
// -----
export const RETENTION_BATCH = 1000;
export const ORPHAN_SWEEP_APPS = 50;
export const ORPHAN_MIN_AGE_MS = DAY_MS;

// -----
// Each refusal names its limit, so the person knows what to fix.
// The words live in the contracts: the dashboard says the same
// before it sends a zip.
// -----
export const ARCHIVE_TOO_LARGE = UPLOAD_ARCHIVE_TOO_LARGE_MESSAGE;
export const UNPACKED_TOO_LARGE = UPLOAD_UNPACKED_TOO_LARGE_MESSAGE;
export const TOO_MANY_FILES = UPLOAD_TOO_MANY_FILES_MESSAGE;
export const PATH_TOO_DEEP = UPLOAD_PATH_TOO_DEEP_MESSAGE;
export const TOO_MANY_ARCHIVES = UPLOAD_TOO_MANY_ARCHIVES_MESSAGE;
export const STORAGE_FULL = UPLOAD_STORAGE_FULL_MESSAGE;
