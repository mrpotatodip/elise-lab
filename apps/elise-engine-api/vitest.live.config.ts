import { mergeConfig } from "vitest/config";
import base from "./vitest.config";

// -----
// Only tools/live-get.live.ts (started by tools/live-get.mjs) and
// tools/seal-backfill.live.ts (tools/seal-backfill.mjs). The normal
// `vitest run` never reaches them: their names have no `.test.`.
// -----
export default mergeConfig(base, { test: { include: ["tools/*.live.ts"] } });
