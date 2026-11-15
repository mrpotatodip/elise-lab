import { describe, expect, it } from "vitest";
import type { FindingComment, FindingDecision } from "#/modules/finding-comment/schemas";
import {
  findComment,
  isPendingComment,
  pendingCommentId,
  withComment,
  withCommentDeleted,
  withCommentRestored,
  withoutEvent,
} from "#/modules/finding-comment/utils/finding-thread-cache";

const comment = (id: string, body: string | null = "hello"): FindingComment => ({
  kind: "comment",
  id,
  authorPartyId: null,
  authorName: "Alex",
  body,
  createdAt: "2026-11-15T08:13:00.000Z",
  editedAt: null,
  deletedAt: null,
});

const decision: FindingDecision = {
  kind: "decision",
  id: "11111111-1111-4111-8111-111111111111",
  actorName: "Alex",
  status: "fixed",
  note: null,
  acceptedUntil: null,
  createdAt: "2026-11-15T08:15:00.000Z",
};

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("the optimistic thread", () => {
  it("marks a pending comment, and no saved one", () => {
    expect(isPendingComment(pendingCommentId())).toBe(true);
    expect(isPendingComment(A)).toBe(false);
  });

  it("adds a posted comment at the end and takes it out again when the post fails", () => {
    const pending = comment(pendingCommentId(), "new");
    const events = withComment([comment(A), decision], pending);

    expect(events.map((event) => event.id)).toEqual([A, decision.id, pending.id]);
    expect(withoutEvent(events, pending.id).map((event) => event.id)).toEqual([A, decision.id]);
  });

  it("turns only the deleted comment into the marker, and puts it back when the delete fails", () => {
    const original = comment(A);
    const events = [original, comment(B), decision];

    const deleted = withCommentDeleted(events, A, "2026-11-15T08:20:00.000Z");

    expect(findComment(deleted, A)).toMatchObject({ body: null, deletedAt: "2026-11-15T08:20:00.000Z" });
    expect(findComment(deleted, B)).toMatchObject({ body: "hello", deletedAt: null });
    expect(deleted[2]).toBe(decision);
    expect(withCommentRestored(deleted, original)).toEqual(events);
  });
});
