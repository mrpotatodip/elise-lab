import type { SCAN_KEPT_FILES } from "#/constants";

export type ScanFiles = Partial<Record<(typeof SCAN_KEPT_FILES)[number], string>>;
