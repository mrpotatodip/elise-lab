import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const CHALLENGE_COOKIE = "elise_two_factor";
const CHALLENGE_MAX_AGE = 60 * 10;

export function saveChallenge(engineSetCookies: readonly string[]) {
  const pairs = engineSetCookies.map((line) => line.split(";")[0] ?? "").filter((pair) => pair !== "" && !pair.endsWith("="));
  setCookie(CHALLENGE_COOKIE, pairs.join("; "), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MAX_AGE,
  });
}

export const readChallenge = (): string | undefined => getCookie(CHALLENGE_COOKIE) || undefined;

export const clearChallenge = () => deleteCookie(CHALLENGE_COOKIE, { path: "/" });
