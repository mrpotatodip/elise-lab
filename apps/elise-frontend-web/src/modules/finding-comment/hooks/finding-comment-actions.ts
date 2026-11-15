import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteFindingComment, postFindingComment } from "../api";
import { findingCommentKeys } from "./finding-comment-queries";

type CommentTarget = { repo: string; fingerprint: string };

export function useFindingCommentActions({ repo, fingerprint }: CommentTarget) {
  const queryClient = useQueryClient();
  const reload = () => queryClient.invalidateQueries({ queryKey: findingCommentKeys.thread(repo, fingerprint) });

  const create = useMutation({
    mutationFn: (body: string) => postFindingComment({ data: { repo, fingerprint, body } }),
    onSuccess: reload,
    onError: (error) => toast.error(`We couldn't post that comment. ${error.message}`),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) => deleteFindingComment({ data: { commentId } }),
    onSuccess: reload,
    onError: (error) => toast.error(`We couldn't delete that comment. ${error.message}`),
  });

  return { create, remove };
}
