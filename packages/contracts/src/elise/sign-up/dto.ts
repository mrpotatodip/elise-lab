import { z } from "zod";
import {
  SIGN_UP_ACCOUNT_NAME_MAX,
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_PASSWORD_MAX,
  SIGN_UP_PASSWORD_MIN,
  SIGN_UP_PERSON_NAME_MAX,
} from "../constants";
import { TenantSchema } from "../tenant";

// -----
// A real IANA zone, e.g. "Europe/Rome".
// Intl throws a RangeError for anything else.
// -----
const isTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

// -----
// Requests: a visitor starts their account. An old
// client's stray `inviteCode` key is stripped, not refused.
// `turnstileToken` is optional here on purpose: the engine
// answers a missing or bad token with the one generic refusal,
// so the schema must not give it a message of its own.
// -----
export const SignUpBodySchema = z.object({
  firstName: z.string().trim().min(1).max(SIGN_UP_PERSON_NAME_MAX),
  lastName: z.string().trim().min(1).max(SIGN_UP_PERSON_NAME_MAX),
  email: z.email().max(SIGN_UP_EMAIL_MAX).trim().toLowerCase(),
  password: z.string().min(SIGN_UP_PASSWORD_MIN).max(SIGN_UP_PASSWORD_MAX),
  accountName: z.string().trim().min(1).max(SIGN_UP_ACCOUNT_NAME_MAX),
  timezone: z.string().refine(isTimezone, "Must be an IANA timezone, e.g. Europe/Rome"),
  turnstileToken: z.string().optional(),
});

// -----
// Responses: the new login and its account,
// where the creator is the owner
// -----
export const SignUpSchema = z.object({
  userId: z.string(),
  tenant: TenantSchema,
});

// -----
// Resend the Verification email: no session needed.
// The answer is the same for any address, so it never
// says whether a Login exists, is verified or was limited.
// -----
export const ResendVerificationBodySchema = z.object({
  email: z.email().max(SIGN_UP_EMAIL_MAX).trim().toLowerCase(),
});

export const ResendVerificationSchema = z.object({
  requested: z.literal(true),
});

export type SignUpBody = z.infer<typeof SignUpBodySchema>;
export type SignUp = z.infer<typeof SignUpSchema>;
export type ResendVerificationBody = z.infer<typeof ResendVerificationBodySchema>;
export type ResendVerification = z.infer<typeof ResendVerificationSchema>;
