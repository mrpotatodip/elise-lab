export type CommentSegment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const URL_PATTERN = /https:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]$/;
const CLOSING_TO_OPENING = new Map([
  [")", "("],
  ["]", "["],
  ["}", "{"],
]);

const countOf = (text: string, char: string): number => text.split(char).length - 1;

// -----
// Drops what a sentence puts after a link: stops, commas and a
// closing bracket that has no opening one inside the link. A
// link that really ends in a bracket, like Foo_(bar), keeps it.
// -----
const trimTrailingPunctuation = (candidate: string): string => {
  let text = candidate;
  while (text !== "") {
    const last = text.slice(-1);
    const opening = CLOSING_TO_OPENING.get(last);
    const unbalanced = opening !== undefined && countOf(text, last) > countOf(text, opening);
    if (!TRAILING_PUNCTUATION.test(text) && !unbalanced) break;
    text = text.slice(0, -1);
  }
  return text;
};

const httpsHref = (candidate: string): string | null => {
  const parsed = URL.canParse(candidate) ? new URL(candidate) : null;
  return parsed?.protocol === "https:" && parsed.hostname !== "" ? parsed.href : null;
};

// -----
// Plain text split into runs of text and https links. Nothing
// else is a link, and nothing is HTML: the caller renders each
// run as a React text node or an anchor.
// -----
export function commentSegments(body: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let cursor = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    const text = trimTrailingPunctuation(match[0]);
    const href = httpsHref(text);
    if (!href) continue;
    if (match.index > cursor) segments.push({ kind: "text", text: body.slice(cursor, match.index) });
    segments.push({ kind: "link", text, href });
    cursor = match.index + text.length;
  }
  if (cursor < body.length) segments.push({ kind: "text", text: body.slice(cursor) });
  return segments;
}

const NUMBER = new Intl.NumberFormat("en");

// -----
// The live count under a box: "0 of 4,000 characters".
// -----
export const commentCountText = (length: number, max: number): string => `${NUMBER.format(length)} of ${NUMBER.format(max)} characters`;

// -----
// A time in full for a tooltip: date, year, time and zone.
// timeZone undefined means the viewer's own.
// -----
export const commentTimeTitle = (value: string, timeZone: string | undefined): string =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "long", timeZone }).format(new Date(value));

export const COMMENT_AUTHOR_FALLBACK = "a team member";

export const commentAuthorLabel = (authorName: string | null) => authorName ?? COMMENT_AUTHOR_FALLBACK;

export const commentInitials = (authorName: string | null): string =>
  authorName
    ? authorName
        .split(/\s+/)
        .filter((part) => part !== "")
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : "";
