import { z } from "zod";
import { NOUL_QUESTION_ID, TYPESAFE_API_URL, TYPESAFE_MODEL, TYPESAFE_TIMEOUT_MS } from "#/modules/typesafe/constants";
import type { TypeSafeGateway } from "#/modules/typesafe/types";

const NoulResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) })),
});

export const typesafeGateway = (apiKey: string, fetcher: typeof fetch = fetch): TypeSafeGateway => ({
  noul: async ({ state, question }) => {
    const response = await fetcher(TYPESAFE_API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TYPESAFE_TIMEOUT_MS),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: TYPESAFE_MODEL, state, questions: { [NOUL_QUESTION_ID]: { type: "noul", instructions: question } } }),
    });
    if (!response.ok) throw new Error(`TypeSafe answered ${response.status}`);
    const parsed = NoulResponseSchema.parse(await response.json());
    const answer = parsed.answers[NOUL_QUESTION_ID];
    if (!answer) throw new Error("TypeSafe returned no answer for the question");
    return { probability: answer.noul, modelVersion: parsed.model };
  },
});
