import {
  UPLOAD_ARCHIVE_MAX_MB,
  UPLOAD_ARCHIVES_PER_APP_MAX,
  UPLOAD_FILES_MAX,
  UPLOAD_PATH_DEPTH_MAX,
  UPLOAD_STORAGE_PER_TENANT_MAX_MB,
  UPLOAD_UNPACKED_MAX_MB,
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
// -----
export const ARCHIVE_TOO_LARGE = `A zip can be at most ${UPLOAD_ARCHIVE_MAX_MB} MB`;
export const UNPACKED_TOO_LARGE = `A zip can unpack to at most ${UPLOAD_UNPACKED_MAX_MB} MB`;
export const TOO_MANY_FILES = `A zip can hold at most ${UPLOAD_FILES_MAX.toLocaleString("en-US")} files`;
export const PATH_TOO_DEEP = `A path in a zip can be at most ${UPLOAD_PATH_DEPTH_MAX} levels deep`;
export const TOO_MANY_ARCHIVES = `An upload app can hold at most ${UPLOAD_ARCHIVES_PER_APP_MAX} zips: remove one first`;
export const STORAGE_FULL = `An account can store at most ${UPLOAD_STORAGE_PER_TENANT_MAX_MB} MB of zips: remove some first`;
