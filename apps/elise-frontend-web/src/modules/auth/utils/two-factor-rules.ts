export type SignInOutcome = "session" | "unverified" | "challenge";
export type SignInScreen = "app" | "setup" | "second-step" | "unverified";

export const screenAfterSignIn = (outcome: SignInOutcome, setupRequired: boolean): SignInScreen => {
  if (outcome === "challenge") return "second-step";
  if (outcome === "unverified") return "unverified";
  return setupRequired ? "setup" : "app";
};

export type SecondStepFailure = "wrong" | "locked" | "expired" | "other";

export const secondStepFailure = (status: number, code: string | undefined): SecondStepFailure => {
  if (status === 429) return "locked";
  if (status === 401 && code?.includes("COOKIE")) return "expired";
  if (status === 401 || status === 400) return "wrong";
  return "other";
};

export type CodeInput = { kind: "totp" | "backup"; code: string };

export const codeInput = (typed: string): CodeInput => {
  const trimmed = typed.trim();
  const digits = trimmed.replaceAll(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? { kind: "totp", code: digits } : { kind: "backup", code: trimmed };
};

const ADMIN_ROLES = new Set(["tenant_admin", "workspace_admin"]);

export const canTurnOff = (role: string): boolean => !ADMIN_ROLES.has(role);

export const spacedKey = (key: string): string => key.match(/.{1,4}/g)?.join(" ") ?? key;
