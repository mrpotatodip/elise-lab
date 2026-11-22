// -----
// What one yes/no (Noul) question returned: the model's raw
// probability that the statement is true, and the model version
// that answered. Callers store both.
// -----
export type NoulAnswer = { probability: number; modelVersion: string };

// -----
// The only door to TypeSafe. The real one calls its HTTP API with
// the Worker's key; the tests pass an in-memory one. state is what
// the model reads (Finding text, never source code).
// -----
export type TypeSafeGateway = {
  noul: (input: { state: unknown; question: string }) => Promise<NoulAnswer>;
};
