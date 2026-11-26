import { z } from "zod";
import { SignalSchema } from "@repo/contracts/elise";

export {
  SignalParamSchema,
  SignalSchema,
  SignalsQuerySchema,
  SignalsSettingsSchema,
  UpdateSignalsSettingsBodySchema,
} from "@repo/contracts/elise";
export type { Signal, SignalsSettings } from "@repo/contracts/elise";

export const SignalListSchema = z.array(SignalSchema);

export const SignalDismissedSchema = z.object({ dismissed: z.literal(true) });
