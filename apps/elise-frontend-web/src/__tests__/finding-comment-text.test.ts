import { describe, expect, it } from "vitest";
import { commentCountText, commentSegments } from "#/modules/finding-comment/utils/finding-comment-text";

const linkTexts = (body: string) =>
  commentSegments(body).flatMap((segment) => (segment.kind === "link" ? [segment.text] : []));

describe("commentSegments", () => {
  it.each([
    ["see https://example.com/a.", "https://example.com/a"],
    ["(see https://example.com/a)", "https://example.com/a"],
    ["[https://example.com/a]", "https://example.com/a"],
    ["https://example.com/a, then", "https://example.com/a"],
    ["https://en.wikipedia.org/wiki/Foo_(bar)", "https://en.wikipedia.org/wiki/Foo_(bar)"],
    ["read https://en.wikipedia.org/wiki/Foo_(bar).", "https://en.wikipedia.org/wiki/Foo_(bar)"],
    ["(read https://en.wikipedia.org/wiki/Foo_(bar))", "https://en.wikipedia.org/wiki/Foo_(bar)"],
    ["https://example.com/a[0]", "https://example.com/a[0]"],
    ["https://example.com/{id}", "https://example.com/{id}"],
  ])("links %j as %j", (body, link) => {
    expect(linkTexts(body)).toEqual([link]);
  });

  it.each([
    [0, "0 of 4,000 characters"],
    [1234, "1,234 of 4,000 characters"],
  ])("counts %j as %j", (length, text) => {
    expect(commentCountText(length, 4000)).toBe(text);
  });

  it("keeps the text around a link and drops nothing", () => {
    const segments = commentSegments("see https://example.com/a.");

    expect(segments.map((segment) => segment.text).join("")).toBe("see https://example.com/a.");
  });
});
