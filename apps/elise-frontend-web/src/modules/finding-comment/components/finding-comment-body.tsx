import { commentSegments } from "../utils";

// -----
// Plain text with https links. Every run is a React text node or an
// anchor: nothing a person types is read as HTML.
// -----
export function FindingCommentBody({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">
      {commentSegments(text).map((segment, index) =>
        segment.kind === "link" ? (
          <a
            key={`${index}-${segment.href}`}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {segment.text}
          </a>
        ) : (
          <span key={`${index}-text`}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
