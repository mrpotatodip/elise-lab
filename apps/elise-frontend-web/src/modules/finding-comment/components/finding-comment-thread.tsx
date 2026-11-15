import { useRouteContext } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Skeleton } from "#/components/ui/skeleton";
import { useFindingCommentActions, useFindingThread } from "../hooks";
import type { FindingThreadEvent } from "../schemas";
import { FindingCommentComposer } from "./finding-comment-composer";
import { FindingCommentDeleteDialog } from "./finding-comment-delete-dialog";
import { FindingCommentItem } from "./finding-comment-item";

type FindingCommentThreadProps = {
  repo: string;
  fingerprint: string;
};

type ThreadEventProps = {
  event: FindingThreadEvent;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (commentId: string) => Promise<void>;
};

function ThreadEvent({ event, canDelete, deleting, onDelete }: ThreadEventProps) {
  const actions = canDelete && event.body !== null ? <FindingCommentDeleteDialog pending={deleting} onConfirm={() => onDelete(event.id)} /> : undefined;
  return <FindingCommentItem comment={event} actions={actions} />;
}

// -----
// The Discussion section of a finding's detail sheet: the thread,
// oldest first, with the composer under it. A person who can read
// but not write sees the thread and no composer.
// -----
export function FindingCommentThread({ repo, fingerprint }: FindingCommentThreadProps) {
  const { user } = useRouteContext({ from: "/_app" });
  const canComment = hasAccessPower(user?.powers ?? [], "company:findings:comments:create");
  const canDeleteAny = hasAccessPower(user?.powers ?? [], "company:findings:comments:delete");
  const thread = useFindingThread(repo, fingerprint);
  const { create, remove } = useFindingCommentActions({ repo, fingerprint });

  return (
    <section aria-labelledby="finding-discussion-title" className="grid gap-4 border-t pt-6">
      <h3 id="finding-discussion-title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Discussion
      </h3>
      {thread.isPending && <Skeleton className="h-16 w-full" />}
      {thread.isError && (
        <Alert variant="destructive">
          <AlertDescription>We couldn't load the discussion. {thread.error.message}</AlertDescription>
        </Alert>
      )}
      {thread.data &&
        (thread.data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one has commented on this finding yet.</p>
        ) : (
          <ol className="grid gap-5">
            {thread.data.events.map((event) => (
              <ThreadEvent
                key={event.id}
                event={event}
                canDelete={canDeleteAny || (canComment && event.authorPartyId !== null && event.authorPartyId === user?.partyId)}
                deleting={remove.isPending}
                onDelete={(commentId) => remove.mutateAsync(commentId).then(() => undefined)}
              />
            ))}
          </ol>
        ))}
      {canComment ? (
        <FindingCommentComposer pending={create.isPending} onPost={(body) => create.mutateAsync(body).then(() => true, () => false)} />
      ) : (
        <p className="text-sm text-muted-foreground">Your role can read this discussion but not write in it.</p>
      )}
    </section>
  );
}
