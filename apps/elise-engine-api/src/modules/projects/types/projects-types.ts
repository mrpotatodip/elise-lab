import type { Conflict, DbError, Forbidden, NotFound } from "#/lib/effect-query";

export type ProjectFailure = Conflict | Forbidden | NotFound | DbError;
