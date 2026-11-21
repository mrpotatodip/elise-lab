import type { TypeSafeGateway } from "#/modules/typesafe";

// -----
// TypeSafe in memory: every question gets the probability the
// test chose (0.5 unless told), and the calls are kept so a test
// can see what was sent.
// -----
export const fakeTypeSafe = (probability = 0.5) => {
  const calls: { state: unknown; question: string }[] = [];

  const gateway: TypeSafeGateway = {
    noul: async (input) => {
      calls.push(input);
      return { probability, modelVersion: "jev-fake" };
    },
  };

  return { gateway, calls };
};
