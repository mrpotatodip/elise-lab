import { describe, expect, it } from "vitest";
import { typesafeGateway } from "#/modules/typesafe/lib";

type Sent = { url: string; auth: string | null; body: unknown };

const answering = (response: Response) => {
  const sent: Sent[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    sent.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return response;
  };
  return { sent, gateway: typesafeGateway("tsk_test", fetcher) };
};

const ok = (noul: number) => Response.json({ model: "jev-1.14.0", answers: { q: { type: "noul", noul } }, usage: { input_tokens: 10, output_tokens: 2 } });

describe("typesafeGateway.noul", () => {
  it("asks one yes/no question against the pinned model and returns the raw probability", async () => {
    const { sent, gateway } = answering(ok(0.82));

    const answer = await gateway.noul({ state: { title: "SQL injection" }, question: "Is this a duplicate?" });

    expect(answer).toEqual({ probability: 0.82, modelVersion: "jev-1.14.0" });
    expect(sent).toEqual([
      {
        url: "https://api.typesafe.ai/v1/systemone",
        auth: "Bearer tsk_test",
        body: { model: "jev-1.14.0", state: { title: "SQL injection" }, questions: { q: { type: "noul", instructions: "Is this a duplicate?" } } },
      },
    ]);
  });

  it("fails on a non-2xx answer", async () => {
    const { gateway } = answering(new Response("nope", { status: 401 }));

    await expect(gateway.noul({ state: "x", question: "y" })).rejects.toThrow("TypeSafe answered 401");
  });

  it("fails on an answer that is not a probability", async () => {
    const { gateway } = answering(ok(1.5));

    await expect(gateway.noul({ state: "x", question: "y" })).rejects.toThrow("too_big");
  });
});
