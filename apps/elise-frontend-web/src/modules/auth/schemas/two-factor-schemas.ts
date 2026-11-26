import { z } from "zod";

export const CodeSchema = z.object({ code: z.string().trim().min(1, "Type a code").max(64) });
export const PasswordSchema = z.object({ password: z.string().min(1, "Type your password").max(256) });
export const DisableSchema = PasswordSchema.extend({ code: z.string().trim().min(1, "Type a code").max(64) });

export const EnableResponseSchema = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
export const BackupCodesResponseSchema = z.object({ backupCodes: z.array(z.string()) });
