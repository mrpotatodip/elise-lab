import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteFindingComment, editFindingComment, postFindingComment } from "../api";
import type { FindingThread } from "../schemas";
import {
  findComment,
  pendingCommentId,
  withComment,
  withCommentDeleted,
  withCommentRestored,
  withoutEvent,
} from "../utils";
import { findingCommentKeys } from "./finding-comment-queries";

type CommentTarget = {
  repo: string;
  fingerprint: string;
  viewer: { partyId: string | null; name: string | null };
};

// -----
// Post and delete are optimistic: the thread changes at once, a
// failure puts it back and says so, and the refetch afterwards
// brings the engine's own version either way. Edit waits for the
// engine.
// -----
export function useFindingCommentActions({ repo, fingerprint, viewer }: CommentTarget) {
  const queryClient = useQueryClient();
  const threadKey = findingCommentKeys.thread(repo, fingerprint);
  const reload = () => queryClient.invalidateQueries({ queryKey: threadKey });
  const changeEvents = (change: (events: FindingThread["events"]) => FindingThread["events"]) =>
    queryClient.setQueryData<FindingThread>(threadKey, (thread) =>
      thread ? { ...thread, events: change(thread.events) } : thread,
    );

  const create = useMutation({
    mutationFn: (body: string) => postFindingComment({ data: { repo, fingerprint, body } }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const pendingId = pendingCommentId();
      changeEvents((events) =>
        withComment(events, {
          kind: "comment",
          id: pendingId,
          authorPartyId: viewer.partyId,
          authorName: viewer.name,
          body,
          createdAt: new Date().toISOString(),
          editedAt: null,
          deletedAt: null,
        }),
      );
      return { pendingId };
    },
    onError: (error, _body, context) => {
      if (context) changeEvents((events) => withoutEvent(events, context.pendingId));
      toast.error(`We couldn't post that comment. ${error.message}`);
    },
    onSettled: reload,
  });

  const edit = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      editFindingComment({ data: { commentId, body } }),
    onSuccess: reload,
    onError: (error) => toast.error(`We couldn't save that edit. ${error.message}`),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) => deleteFindingComment({ data: { commentId } }),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previous = findComment(queryClient.getQueryData<FindingThread>(threadKey)?.events ?? [], commentId);
      changeEvents((events) => withCommentDeleted(events, commentId, new Date().toISOString()));
      return { previous };
    },
    onError: (error, _commentId, context) => {
      const previous = context?.previous;
      if (previous) changeEvents((events) => withCommentRestored(events, previous));
      toast.error(`We couldn't delete that comment. ${error.message}`);
    },
    onSettled: reload,
  });

  return { create, edit, remove };
}
