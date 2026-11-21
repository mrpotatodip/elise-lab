import { z } from "zod";

// -----
// Signals: hints from an outside model (ADR 0011). They never
// change a Finding, a decision or the Verdict.
// -----
export const SignalsSettingsSchema = z.object({
  enabled: z.boolean(),
});

export const UpdateSignalsSettingsBodySchema = z.object({
  enabled: z.boolean(),
});

export const SignalsQuerySchema = z.object({
  repo: z.string().min(1),
});

export const SignalParamSchema = z.object({
  signalId: z.uuid(),
});

// -----
// One Signal as the dashboard shows it. relatedFingerprint is the
// other Finding of a duplicate pair, null for a kind with one.
// probability is the raw answer; the thresholds decide what shows.
// -----
export const SignalSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  fingerprint: z.string(),
  relatedFingerprint: z.string().nullable(),
  probability: z.number(),
  modelVersion: z.string(),
  createdAt: z.iso.datetime(),
});

// -----
// The check before an accepted risk is saved: the draft note and
// the Finding it is about. signal is null when the reason holds,
// Signals are off or TypeSafe did not answer.
// -----
export const WEAK_REASON_SIGNAL_KIND = "weak_reason";

export const CheckAcceptedRiskBodySchema = z.object({
  repo: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  note: z.string().trim().min(1).max(2000),
});

export const AcceptedRiskCheckSchema = z.object({
  signal: SignalSchema.nullable(),
});

export type CheckAcceptedRiskBody = z.infer<typeof CheckAcceptedRiskBodySchema>;
export type AcceptedRiskCheck = z.infer<typeof AcceptedRiskCheckSchema>;
export type SignalsSettings = z.infer<typeof SignalsSettingsSchema>;
export type UpdateSignalsSettingsBody = z.infer<typeof UpdateSignalsSettingsBodySchema>;
export type Signal = z.infer<typeof SignalSchema>;
