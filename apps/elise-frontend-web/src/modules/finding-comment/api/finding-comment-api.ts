import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CreateFindingCommentBodySchema, FindingCommentSchema, FindingCommentsQuerySchema, FindingThreadSchema } from "../schemas";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";

export const fetchFindingThread = createServerFn({ method: "GET" })
  .validator(FindingCommentsQuerySchema)
  .handler(async ({ data }) => engineJson(FindingThreadSchema, `/findings/comments?${new URLSearchParams(data)}`, {}, await engineAuth()));

export const postFindingComment = createServerFn({ method: "POST" })
  .validator(CreateFindingCommentBodySchema)
  .handler(async ({ data }) => engineJson(FindingCommentSchema, "/findings/comments", jsonPost(JSON.stringify(data)), await engineAuth()));

export const deleteFindingComment = createServerFn({ method: "POST" })
  .validator(z.object({ commentId: z.uuid() }))
  .handler(async ({ data }) => engineJson(FindingCommentSchema, `/findings/comments/${data.commentId}`, { method: "DELETE" }, await engineAuth()));
