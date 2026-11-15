export type CommentSegment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const URL_PATTERN = /https:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

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
    const text = match[0].replace(TRAILING_PUNCTUATION, "");
    const href = httpsHref(text);
    if (!href) continue;
    if (match.index > cursor) segments.push({ kind: "text", text: body.slice(cursor, match.index) });
    segments.push({ kind: "link", text, href });
    cursor = match.index + text.length;
  }
  if (cursor < body.length) segments.push({ kind: "text", text: body.slice(cursor) });
  return segments;
}

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
