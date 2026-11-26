import { z } from "zod";

// -----
// Responses: who the signed-in login is, which
// Accounts it can use and whether it is platform
// staff.
// -----
export const MeAccountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: z.string(),
  roleLabel: z.string(),
  // What the role may do here (ACCESS_POWERS strings). Optional while an older engine does not send it.
  powers: z.array(z.string()).optional(),
});

export const MeSchema = z.object({
  // partyId is optional while an older engine does not send it; it tells the dashboard which comments are the login's own.
  user: z.object({ id: z.string(), name: z.string(), email: z.string(), partyId: z.uuid().optional() }),
  partyType: z.string(),
  isSuperuser: z.boolean(),
  accounts: z.array(MeAccountSchema),
  // Optional while an older engine does not send them: whether the login has Two-factor, and whether it must set it up before using the dashboard.
  twoFactorEnabled: z.boolean().optional(),
  twoFactorSetupRequired: z.boolean().optional(),
});

export type MeAccount = z.infer<typeof MeAccountSchema>;
export type Me = z.infer<typeof MeSchema>;
