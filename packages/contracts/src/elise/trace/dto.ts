import { z } from "zod";
import { TRACE_BATCH_MAX } from "../constants";
import { RUNNER_JOB_PHASE_VALUES, TRACE_LABEL_VALUES } from "../enums";

// -----
// One Trace entry: a label, the Phase it ran in (null for a run with
// no Phases), the producer's start and end time, and how many times
// the label repeated in a row. Nothing the agent wrote. The producer
// gives each entry a UUIDv7, so sending it again (a retry, or the
// same entry grown) replaces it instead of adding one.
// -----
export const TraceEntrySchema = z.object({
  id: z.uuid({ version: "v7" }),
  label: z.enum(TRACE_LABEL_VALUES),
  phase: z.enum(RUNNER_JOB_PHASE_VALUES).nullable(),
  startedAt: z.coerce.date().transform((d) => d.toISOString()),
  endedAt: z.coerce.date().transform((d) => d.toISOString()),
  count: z.number().int().min(1),
});

// -----
// A batch from a producer: the entries that are new or grew since the
// last batch, and the number of candidate Findings so far (a count,
// never a title). An older producer leaves the count out.
// -----
export const SaveTraceBodySchema = z.object({
  entries: z.array(TraceEntrySchema).max(TRACE_BATCH_MAX),
  candidateFindings: z.number().int().min(0).optional(),
});

// -----
// How much of a batch was kept. Entries past the per-Scan cap are
// dropped, not refused, so the producer never retries them.
// -----
export const TraceSavedSchema = z.object({
  accepted: z.number().int().min(0),
  dropped: z.number().int().min(0),
});

// -----
// after is the cursor from the last read: the database time of the
// newest change the reader has. Without it the whole Trace comes back.
// -----
export const TraceQuerySchema = z.object({
  after: z.iso.datetime().optional(),
});

// -----
// The entries changed after the cursor, in display order (start time,
// then id), and the cursor to send next time. The reader replaces an
// entry it already has by id, so a grown entry updates in place.
// -----
export const TraceSchema = z.object({
  entries: z.array(TraceEntrySchema),
  cursor: z.iso.datetime().nullable(),
  candidateFindings: z.number().int().min(0).nullable(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;
export type SaveTraceBody = z.infer<typeof SaveTraceBodySchema>;
export type TraceSaved = z.infer<typeof TraceSavedSchema>;
export type TraceQuery = z.infer<typeof TraceQuerySchema>;
export type Trace = z.infer<typeof TraceSchema>;
