import type { FindingComment, FindingThreadEvent } from "../schemas";

const PENDING_ID_PREFIX = "pending-";

// -----
// A comment the person just posted, shown before the engine has
// answered. Its id is not a real one, so the thread offers no edit
// or delete on it until the refetch brings the saved comment.
// -----
export const pendingCommentId = (): string => `${PENDING_ID_PREFIX}${crypto.randomUUID()}`;

export const isPendingComment = (id: string): boolean => id.startsWith(PENDING_ID_PREFIX);

export const withComment = (events: readonly FindingThreadEvent[], comment: FindingComment): FindingThreadEvent[] => [...events, comment];

export const withoutEvent = (events: readonly FindingThreadEvent[], id: string): FindingThreadEvent[] => events.filter((event) => event.id !== id);

// -----
// The "deleted" marker the engine will leave: no body, a deleted
// time. Other events are left as they are.
// -----
export const withCommentDeleted = (events: readonly FindingThreadEvent[], id: string, deletedAt: string): FindingThreadEvent[] =>
  events.map((event) => (event.kind === "comment" && event.id === id ? { ...event, body: null, deletedAt } : event));

export const hasLiveComment = (events: readonly FindingThreadEvent[]): boolean => events.some((event) => event.kind === "comment" && event.body !== null);

export const findComment = (events: readonly FindingThreadEvent[], id: string): FindingComment | undefined =>
  events.find((event): event is FindingComment => event.kind === "comment" && event.id === id);

export const withCommentRestored = (events: readonly FindingThreadEvent[], comment: FindingComment): FindingThreadEvent[] =>
  events.map((event) => (event.id === comment.id ? comment : event));
